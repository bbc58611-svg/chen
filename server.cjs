'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {ApiError,createDeepSeek}=require('./backend/deepseek.cjs');
const {createPayPal}=require('./backend/paypal.cjs');
const {runtimeConfig}=require('./backend/runtime.cjs');
const ROOT=path.resolve(__dirname,'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};

function loadCatalog(){
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'data.js'),'utf8'),context,{timeout:1000});
  const {tutors,gifts}=context.window.MOMO_DEMO_DATA;
  return JSON.parse(JSON.stringify([...tutors,...gifts]));
}
function json(res,status,value,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(value));}
async function body(req){
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ApiError(415,'JSON_REQUIRED',"Send the request as JSON.");
  if(Number(req.headers['content-length'])>32768)throw new ApiError(413,'BODY_TOO_LARGE',"This conversation is too long.");
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>32768)throw new ApiError(413,'BODY_TOO_LARGE',"This conversation is too long.");chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'INVALID_JSON',"The request is not valid JSON.");}
}
function createServer({env=process.env,fetchImpl,timeoutMs,paymentStoreFile=null}={}){
  const runtime=runtimeConfig(env);
  const key=(env.DEEPSEEK_API_KEY||'').trim(),model=env.DEEPSEEK_MODEL||'deepseek-flash';
  const searchEnabled=env.DEEPSEEK_SEARCH_ENABLED!=='false';
  const chat=createDeepSeek({apiKey:key,model,catalog:loadCatalog(),fetchImpl,timeoutMs,searchEnabled});
  const payments=createPayPal({clientId:(env.PAYPAL_CLIENT_ID||'').trim(),secret:(env.PAYPAL_CLIENT_SECRET||'').trim(),catalog:loadCatalog(),fetchImpl,storeFile:paymentStoreFile});
  // Global demo limits bound total usage across browser tabs and visitors.
  let windowStart=Date.now(),requests=0,active=0;
  let payWindowStart=Date.now(),payRequests=0,payActive=0;
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    const host=req.headers.host||'';
    if(!runtime.allowsHost(host))return json(res,403,{error:{code:'HOST_REJECTED',message:"Open Momo at its configured address."}});
    const requestOrigin=runtime.requestOrigin(host);
    let url;try{url=new URL(req.url,`http://${host}`);}catch{return json(res,400,{error:{code:'BAD_URL',message:"Invalid request URL."}});}
    // PayPal may navigate to this public page. GET never creates or captures a payment.
    const isReturn=req.method==='GET'&&url.pathname==='/paypal-return.html';
    if(req.headers.origin&&req.headers.origin!==requestOrigin&&!isReturn)return json(res,403,{error:{code:'ORIGIN_REJECTED',message:"Open this request from your Momo page."}});
    if(req.headers['sec-fetch-site']==='cross-site'&&!isReturn)return json(res,403,{error:{code:'ORIGIN_REJECTED',message:"Cross-site requests are not accepted."}});
    if(url.pathname==='/healthz'&&['GET','HEAD'].includes(req.method)){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({ok:true}));
    }
    if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,{provider:'deepseek',language:'en',configured:!!key,model,searchEnabled,paymentMode:payments.config().configured?'sandbox':'unconfigured'});
    if(url.pathname==='/api/paypal/config'&&req.method==='GET')return json(res,200,payments.config());
    if(['/api/paypal/orders','/api/paypal/capture','/api/paypal/approval','/api/paypal/check'].includes(url.pathname)&&req.method==='POST'){
      try{
        if(Date.now()-payWindowStart>60000){payWindowStart=Date.now();payRequests=0;}
        if(payRequests>=30||payActive>=2)throw new ApiError(429,'PAYPAL_RATE_LIMIT',"Please wait before checking again.");
        const input=await body(req);payRequests++;payActive++;
        try{
          const value=url.pathname.endsWith('/orders')?await payments.create(input,{returnOrigin:requestOrigin}):url.pathname.endsWith('/capture')?await payments.capture(input):url.pathname.endsWith('/approval')?await payments.approval(input):await payments.check();
          if(!res.destroyed)json(res,url.pathname.endsWith('/orders')?201:200,value);
        }finally{payActive--;}
      }catch(error){if(!res.destroyed){const safe=error instanceof ApiError?error:new ApiError(500,'PAYMENT_ERROR',"Unable to confirm this sandbox order.");json(res,safe.status,{error:{code:safe.code,message:safe.message}});}}
      return;
    }
    if(url.pathname==='/api/chat'&&req.method==='POST'){
      const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
      try{
        if(Date.now()-windowStart>60000){windowStart=Date.now();requests=0;}
        if(requests>=12||active>=2)throw new ApiError(429,'LOCAL_RATE_LIMIT',"Too many requests. Please wait a moment.");
        const input=await body(req);requests++;active++;
        try{const result=await chat(input?.messages,{signal:controller.signal,needsOverride:input?.needsOverride,refreshResources:input?.refreshResources===true});if(!res.destroyed)json(res,200,result);}finally{active--;}
      }catch(error){
        if(!res.destroyed){const safe=error instanceof ApiError?error:new ApiError(500,'INTERNAL_ERROR',"The service is temporarily unavailable. Please try again.");json(res,safe.status,{error:{code:safe.code,message:safe.message}},safe.status===429?{'Retry-After':'60'}:{});}
      }
      return;
    }
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:{code:'NOT_FOUND',message:"Endpoint not found."}});
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
    if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    let name;try{name=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end('Bad request');}
    // Only public dist assets are served; secrets and backend code cannot be downloaded.
    if(name.split(/[\\/]/).some(part=>part.startsWith('.'))){res.writeHead(404);return res.end('Not found');}
    const file=path.resolve(ROOT,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(ROOT+path.sep)||!types[path.extname(file)]){res.writeHead(404);return res.end('Not found');}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);});
  });
}
if(require.main===module){
  const envFile=path.join(__dirname,'.env');
  if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  const runtime=runtimeConfig(process.env,__dirname),port=runtime.port;
  const server=createServer({paymentStoreFile:runtime.storeFile});
  server.requestTimeout=60000;server.headersTimeout=10000;
  server.on('error',error=>{process.stderr.write(error.code==='EADDRINUSE'?`Port ${port} is already in use. Close the old service or change PORT in .env.\n`:"The local Momo service could not start.\n");process.exitCode=1;});
  server.listen(port,runtime.bindHost,()=>process.stdout.write(`Momo: ${runtime.origin||`http://127.0.0.1:${port}`}\nDeepSeek: ${process.env.DEEPSEEK_API_KEY?"Configured (send a message to verify the connection)":"Not configured. Update .env and restart."}\n`));
}
module.exports={createServer,loadCatalog};
