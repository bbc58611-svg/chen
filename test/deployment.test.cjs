'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {runtimeConfig}=require('../backend/runtime.cjs');
const {createServer}=require('../server.cjs');
const {createPayPal}=require('../backend/paypal.cjs');

test('local startup remains loopback-only; hosting requires a validated HTTPS origin',()=>{
  const local=runtimeConfig({});
  assert.equal(local.bindHost,'127.0.0.1');assert.equal(local.port,4173);
  assert.equal(local.allowsHost('localhost:4173'),true);assert.equal(local.allowsHost('evil.example'),false);
  for(const PUBLIC_ORIGIN of ['http://momo.example','https://user:password@momo.example','https://momo.example/path','https://momo.example/?key=value','https://momo.example/#fragment','https://localhost'])assert.throws(()=>runtimeConfig({PUBLIC_ORIGIN}),/PUBLIC_ORIGIN/);
  for(const PORT of ['0','65536','abc'])assert.throws(()=>runtimeConfig({PORT}),/PORT/);
});

test('Render auto-detects its own HTTPS origin and uses the mounted order directory',()=>{
  const hosted=runtimeConfig({RENDER:'true',RENDER_EXTERNAL_URL:'https://momo-example.onrender.com',PORT:'10000',DATA_DIR:'/var/data/momo'});
  assert.equal(hosted.origin,'https://momo-example.onrender.com');assert.equal(hosted.bindHost,'0.0.0.0');assert.equal(hosted.port,10000);
  assert.equal(hosted.allowsHost('momo-example.onrender.com'),true);assert.equal(hosted.allowsHost('momo-example.onrender.com.evil.example'),false);
  assert.equal(hosted.storeFile,path.join(path.resolve('/var/data/momo'),'paypal-sandbox-orders.json'));
  assert.equal(runtimeConfig({RENDER_EXTERNAL_URL:'https://ignored.example'}).origin,null);
  assert.equal(runtimeConfig({RENDER:'true',RENDER_EXTERNAL_URL:'https://auto.example',PUBLIC_ORIGIN:'https://custom.example/'}).origin,'https://custom.example');
});

function call(server,route,{method='GET',headers={},data}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:route,method,headers:{Host:'momo.example',...headers}},res=>{
      let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,text}));
    });
    req.on('error',reject);req.end(data===undefined?undefined:JSON.stringify(data));
  });
}

test('hosted requests enforce canonical host and origin; proxy headers cannot change PayPal return URLs',async t=>{
  const calls=[];
  const server=createServer({env:{PUBLIC_ORIGIN:'https://momo.example',PAYPAL_CLIENT_ID:'test-client',PAYPAL_CLIENT_SECRET:'test-secret'},fetchImpl:async(url,options)=>{
    calls.push({url,options});
    assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
    if(url.endsWith('/v1/oauth2/token'))return new Response(JSON.stringify({access_token:'test-access',expires_in:3600}));
    assert.ok(url.endsWith('/v2/checkout/orders'));return new Response(JSON.stringify({id:'HOSTEDTESTORDER123',status:'CREATED'}));
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  assert.deepEqual(JSON.parse((await call(server,'/healthz')).text),{ok:true});assert.equal(calls.length,0);
  assert.equal((await call(server,'/healthz',{method:'HEAD'})).text,'');
  assert.equal((await call(server,'/',{headers:{Host:'momo.example.evil.example'}})).status,403);
  assert.equal((await call(server,'/.env')).status,404);assert.equal((await call(server,'/.local/paypal-sandbox-orders.json')).status,404);
  assert.equal((await call(server,'/backend/runtime.cjs')).status,404);
  const config=await call(server,'/api/paypal/config');assert.equal(config.text.includes('test-secret'),false);
  const headers={'Content-Type':'application/json',Origin:'https://momo.example'};
  const data={requestId:randomUUID(),itemId:'en-sam',option:'Saturday 14:00'};
  assert.equal((await call(server,'/api/paypal/orders',{method:'POST',data,headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await call(server,'/api/paypal/orders',{method:'POST',data,headers:{...headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal(calls.length,0);
  const created=await call(server,'/api/paypal/orders',{method:'POST',data,headers:{...headers,'X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'http'}});
  assert.equal(created.status,201);
  const experience=JSON.parse(calls.find(x=>x.url.endsWith('/orders')).options.body).payment_source.paypal.experience_context;
  assert.equal(experience.return_url,'https://momo.example/paypal-return.html?flow=return');assert.equal(experience.cancel_url,'https://momo.example/paypal-return.html?flow=cancel');
  assert.equal((await call(server,'/paypal-return.html?flow=return&token=FORGED',{headers:{Origin:'https://www.sandbox.paypal.com','Sec-Fetch-Site':'cross-site'}})).status,200);
  assert.equal(calls.length,2); // Visiting the return page does not contact or capture PayPal.
});

test('PayPal rejects insecure hosted return URLs before making an upstream request',async()=>{
  let network=0;
  const pay=createPayPal({clientId:'test',secret:'test',catalog:[],fetchImpl:async()=>{network++;throw Error('Must not call');}});
  for(const returnOrigin of ['http://momo.example','https://user:password@momo.example','https://momo.example/path','https://momo.example?token=x'])await assert.rejects(pay.create({requestId:randomUUID()},{returnOrigin}),e=>e.code==='INVALID_RETURN_ORIGIN');
  assert.equal(network,0);
});
