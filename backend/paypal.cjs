'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const {ApiError}=require('./deepseek.cjs');
const {publicOrigin}=require('./runtime.cjs');
const BASE='https://api-m.sandbox.paypal.com'; // This integration cannot send live payments.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
function approvalLink(data,id){
  const candidate=data?.links?.find(l=>['payer-action','approve'].includes(l.rel))?.href;
  try{const u=new URL(candidate);return u.protocol==='https:'&&['www.sandbox.paypal.com','sandbox.paypal.com'].includes(u.hostname)&&!u.username&&!u.password&&['/checkoutnow','/webapps/hermes'].includes(u.pathname)&&u.searchParams.get('token')===id?u.href:null;}catch{return null;}
}
function createStore(file){
  let records={};
  if(file&&fs.existsSync(file)){
    try{records=JSON.parse(fs.readFileSync(file,'utf8'));if(!records||Array.isArray(records)||typeof records!=='object')throw Error();}
    catch{throw Error('PayPal local order store is invalid; preserve the file before repairing it.');}
  }
  return {all:()=>Object.values(records),get:key=>records[key],save(record){
    const next={...records,[record.requestId]:record};
    if(file){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);}
    records=next;
  }};
}
function optionsFor(item){
  const options=item.slot?[item.slot,'Sunday 19:00','Next Tuesday 20:00']:['Simple natural wrapping','Include a blank note card'];
  const aliases=[['Saturday 10:00','周六 10:00'],['Saturday 14:00','周六 14:00'],['Sunday 15:00','周日 15:00'],['Wednesday 20:00','周三 20:00'],['Sunday 19:00','周日 19:00'],['Next Tuesday 20:00','下周二 20:00'],['Simple natural wrapping','简约原色包装'],['Include a blank note card','附一张空白卡片']];
  for(const pair of aliases)if(pair.some(v=>options.includes(v)))options.push(...pair);
  return [...new Set(options)];
}
function createPayPal({clientId='',secret='',catalog=[],fetchImpl=fetch,storeFile=null,timeoutMs=25000}={}){
  const configured=!!clientId&&!!secret,store=createStore(storeFile),locks=new Map();
  let auth=null,authPromise=null;
  async function request(url,options){
    try{return await fetchImpl(BASE+url,{...options,signal:AbortSignal.timeout(timeoutMs)});}
    catch{fail(504,'PAYPAL_NETWORK',"PayPal connection timed out. Check the existing order.");}
  }
  async function token(){
    if(auth&&auth.expires>Date.now())return auth.value;
    if(authPromise)return authPromise;
    authPromise=(async()=>{
      const res=await request('/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
      if(!res.ok)fail(503,'PAYPAL_AUTH',"Check your sandbox credentials.");
      let data;try{data=await res.json();}catch{fail(502,'PAYPAL_RESPONSE',"Invalid PayPal response.");}
      if(typeof data.access_token!=='string')fail(502,'PAYPAL_RESPONSE',"Missing access token.");
      auth={value:data.access_token,expires:Date.now()+Math.max(0,Number(data.expires_in||0)-60)*1000};return auth.value;
    })();
    try{return await authPromise;}finally{authPromise=null;}
  }
  async function api(route,{method='GET',body,requestId}={}){
    const access=await token();
    const res=await request(route,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await res.json();}catch{fail(502,'PAYPAL_RESPONSE',"Invalid PayPal response.");}
    if(!res.ok){
      const issue=data?.details?.[0]?.issue;
      if(res.status===401){auth=null;fail(503,'PAYPAL_AUTH',"Authorization expired.");}
      if(issue==='INSTRUMENT_DECLINED')fail(422,'PAYPAL_DECLINED',"Funding source declined.");
      if(issue==='ORDER_NOT_APPROVED')fail(409,'PAYPAL_NOT_APPROVED',"Approve the order in PayPal first.");
      if(issue==='ORDER_ALREADY_CAPTURED')return api(route.replace(/\/capture$/,''));
      fail(res.status===429?429:502,'PAYPAL_UPSTREAM',"PayPal is temporarily unavailable.");
    }
    return data;
  }
  async function locked(key,fn){
    if(locks.has(key))fail(409,'PAYPAL_BUSY',"This order is being processed.");
    const run=fn();locks.set(key,run);try{return await run;}finally{locks.delete(key);}
  }
  const publicOrder=r=>({id:r.id,itemId:r.itemId,name:r.name,option:r.option,amount:r.amount,currency:'USD',status:r.status,captureId:r.captureId||null,createdAt:r.createdAt,environment:'sandbox'});
  function requireConfig(){if(!configured)fail(503,'PAYPAL_NOT_CONFIGURED',"Configure sandbox credentials and restart.");}
  function lookup(input){
    const r=store.all().find(x=>x.id===input?.orderId);
    const t=input?.checkoutToken;
    if(!r||typeof t!=='string'||!/^[a-f0-9]{64}$/.test(t)||!timingSafeEqual(Buffer.from(t),Buffer.from(r.checkoutToken)))fail(404,'PAYPAL_ORDER_NOT_FOUND',"Checkout order not found.");
    return r;
  }
  function verified(record,data){
    const unit=data?.purchase_units?.[0];
    if(data?.id!==record.id||data?.purchase_units?.length!==1||unit?.custom_id!==record.requestId||unit?.amount?.currency_code!=='USD'||unit?.amount?.value!==record.amount)fail(502,'PAYPAL_MISMATCH',"Order details do not match.");
    const captures=unit.payments?.captures||[];
    if(data.status==='COMPLETED'){
      if(captures.length!==1||captures[0].amount?.currency_code!=='USD'||captures[0].amount?.value!==record.amount||!captures[0].id)fail(502,'PAYPAL_MISMATCH',"Capture details do not match.");
      const capture=captures[0];
      if(capture.status==='COMPLETED'){record={...record,status:'COMPLETED',captureId:capture.id};store.save(record);return publicOrder(record);}
      return {...publicOrder(record),status:'PENDING'};
    }
    return {...publicOrder(record),status:data.status||'UNKNOWN'};
  }
  return {
    config:()=>({apiVersion:2,configured,environment:'sandbox',currency:'USD',clientId:configured?clientId:null}),
    async check(){requireConfig();await token();return {connected:true,environment:'sandbox'};},
    async create(input,{returnOrigin}={}){
      requireConfig();
      if(!input||!uuid(input.requestId))fail(400,'INVALID_CHECKOUT',"Invalid checkout request.");
      if(returnOrigin&&!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(returnOrigin)){
        try{if(publicOrigin(returnOrigin)!==returnOrigin)throw Error();}catch{fail(400,'INVALID_RETURN_ORIGIN',"Invalid return address.");}
      }
      const item=catalog.find(x=>x.id===input.itemId);
      if(!item||typeof item.price!=='number'||!Number.isFinite(item.price)||item.price<=0||!optionsFor(item).includes(input.option))fail(400,'INVALID_ITEM',"Select a sandbox catalog item and option.");
      return locked(input.requestId,async()=>{
        let record=store.get(input.requestId);
        if(record&&(record.itemId!==item.id||record.option!==input.option))fail(409,'CHECKOUT_CONFLICT',"Checkout contents changed.");
        if(!record){
          if(store.all().length>=2000)fail(503,'CHECKOUT_LIMIT',"Local test order limit reached.");
          record={requestId:input.requestId,checkoutToken:randomBytes(32).toString('hex'),captureRequestId:randomUUID(),itemId:item.id,name:item.name,option:input.option,amount:item.price.toFixed(2),returnOrigin:returnOrigin||null,status:'CREATING',createdAt:new Date().toISOString()};
          store.save(record); // Persist idempotency keys before contacting PayPal.
        }
        if(!record.id){
          const experience={locale:'en-US',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',...(record.returnOrigin?{return_url:record.returnOrigin+'/paypal-return.html?flow=return',cancel_url:record.returnOrigin+'/paypal-return.html?flow=cancel'}:{})};
          const data=await api('/v2/checkout/orders',{method:'POST',requestId:record.requestId,body:{intent:'CAPTURE',purchase_units:[{reference_id:record.requestId,custom_id:record.requestId,description:('Momo sandbox / '+item.name).slice(0,127),amount:{currency_code:'USD',value:record.amount}}],payment_source:{paypal:{experience_context:experience}}}});
          if(typeof data.id!=='string'||!/^[A-Z0-9]{6,40}$/.test(data.id))fail(502,'PAYPAL_RESPONSE',"Invalid order ID.");
          record={...record,id:data.id,status:data.status||'CREATED'};store.save(record);
        }
        return {...publicOrder(record),checkoutToken:record.checkoutToken};
      });
    },
    async approval(input){
      requireConfig();const record=lookup(input);
      const data=await api('/v2/checkout/orders/'+record.id),state=verified(record,data);
      if(['COMPLETED','APPROVED','PENDING'].includes(state.status))return state;
      const url=approvalLink(data,record.id);
      if(!url)fail(502,'PAYPAL_APPROVAL_UNAVAILABLE',"Sandbox checkout link unavailable.");
      return {...state,approvalUrl:url,returnsToMomo:!!record.returnOrigin};
    },
    async capture(input){
      requireConfig();let record=lookup(input);
      return locked(record.requestId,async()=>{
        record=store.get(record.requestId);
        if(record.status==='COMPLETED')return publicOrder(record);
        const route='/v2/checkout/orders/'+record.id;
        const current=await api(route);const state=verified(record,current);
        if(current.status==='COMPLETED')return state;
        if(current.status!=='APPROVED')fail(409,'PAYPAL_NOT_APPROVED',"Order not approved in PayPal.");
        await api(route+'/capture',{method:'POST',requestId:record.captureRequestId,body:{}});
        // Retrieve the order representation to verify amount, currency, capture and custom ID.
        return verified(record,await api(route));
      });
    }
  };
}
module.exports={createPayPal,createStore,optionsFor,approvalLink};
