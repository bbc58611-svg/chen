'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createPayPal,approvalLink}=require('../backend/paypal.cjs');
const {createServer}=require('../server.cjs');
const catalog=[{id:'en-sam',name:'Sam test lesson',price:12,slot:'周六 14:00'}];
const input=()=>({requestId:randomUUID(),itemId:'en-sam',option:'周六 14:00'});
function mock(){
  const state={calls:[],status:'CREATED',captureStatus:'COMPLETED',createCount:0,captureCount:0,timeoutAfterCapture:false};
  state.fetch=async(url,options={})=>{
    assert.ok(url.startsWith('https://api-m.sandbox.paypal.com/'));
    state.calls.push({url,...options});
    const json=data=>new Response(JSON.stringify(data));
    if(url.endsWith('/v1/oauth2/token'))return json({access_token:'test-access-token',expires_in:3600});
    if(url.endsWith('/v2/checkout/orders')){state.createCount++;state.unit=JSON.parse(options.body).purchase_units[0];return json({id:'TESTORDER123456789',status:'CREATED'});}
    if(url.endsWith('/capture')){
      state.captureCount++;state.status='COMPLETED';
      if(state.timeoutAfterCapture){state.timeoutAfterCapture=false;throw Error('unknown response');}
    }
    const unit={...state.unit,amount:{...state.unit.amount}};
    if(state.amountOverride)unit.amount.value=state.amountOverride;
    if(state.currencyOverride)unit.amount.currency_code=state.currencyOverride;
    if(state.status==='COMPLETED')unit.payments={captures:[{id:'TESTCAPTURE123456',status:state.captureStatus,amount:{...unit.amount}}]};
    return json({id:'TESTORDER123456789',status:state.status,purchase_units:[unit],links:[{rel:'payer-action',href:state.approvalOverride||'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER123456789'}]});
  };
  return state;
}
const make=(state,extra={})=>createPayPal({clientId:'test-client',secret:'test-secret',catalog,fetchImpl:state.fetch,...extra});
test('configuration never returns the secret; missing credentials and unknown items never contact PayPal',async()=>{
  const state=mock(),pay=make(state);
  assert.equal(JSON.stringify(pay.config()).includes('test-secret'),false);
  assert.equal(pay.config().environment,'sandbox');
  assert.equal(pay.config().apiVersion,2);
  await assert.rejects(createPayPal().create(input()),e=>e.code==='PAYPAL_NOT_CONFIGURED');
  await assert.rejects(pay.create({...input(),itemId:'https://third-party.example/service'}),e=>e.code==='INVALID_ITEM');
  await assert.rejects(pay.create({...input(),option:'invented time'}),e=>e.code==='INVALID_ITEM');
  assert.equal(state.calls.length,0);
});
test('server owns price; create retries are idempotent and cannot change the item or option',async()=>{
  const state=mock(),pay=make(state),request={...input(),amount:'0.01',currency:'CNY'};
  const order=await pay.create(request),retry=await pay.create(request);
  assert.equal(order.amount,'12.00');assert.equal(order.currency,'USD');assert.equal(state.unit.amount.value,'12.00');
  assert.equal(retry.id,order.id);assert.equal(state.createCount,1);assert.equal(order.checkoutToken.length,64);
  assert.equal(state.calls.find(c=>c.url.endsWith('/orders')).headers['PayPal-Request-Id'],request.requestId);
  await assert.rejects(pay.create({...request,option:'周日 19:00'}),e=>e.code==='CHECKOUT_CONFLICT');
});
test('capture needs the checkout capability and explicit PayPal approval',async()=>{
  const state=mock(),pay=make(state),order=await pay.create(input());
  await assert.rejects(pay.capture({orderId:order.id,checkoutToken:'0'.repeat(64)}),e=>e.code==='PAYPAL_ORDER_NOT_FOUND');
  await assert.rejects(pay.capture({orderId:order.id,checkoutToken:order.checkoutToken}),e=>e.code==='PAYPAL_NOT_APPROVED');
  assert.equal(state.captureCount,0);
});
test('confirmed capture returns verified amount and receipt; repeating it never captures twice',async()=>{
  const state=mock(),pay=make(state),order=await pay.create(input());state.status='APPROVED';
  const query={orderId:order.id,checkoutToken:order.checkoutToken};
  const completed=await pay.capture(query);
  assert.equal(completed.status,'COMPLETED');assert.equal(completed.captureId,'TESTCAPTURE123456');
  assert.equal(JSON.stringify(completed).includes('checkoutToken'),false);
  await pay.capture(query);assert.equal(state.captureCount,1);
});
test('mismatched amounts or currencies never report success or initiate capture',async()=>{
  for(const change of [{amountOverride:'0.01'},{currencyOverride:'CNY'}]){
    const state=mock(),pay=make(state),order=await pay.create(input());Object.assign(state,{status:'APPROVED'},change);
    await assert.rejects(pay.capture({orderId:order.id,checkoutToken:order.checkoutToken}),e=>e.code==='PAYPAL_MISMATCH');assert.equal(state.captureCount,0);
  }
});
test('pending captures never become successful receipts',async()=>{
  const state=mock(),pay=make(state),order=await pay.create(input());state.status='APPROVED';state.captureStatus='PENDING';
  const value=await pay.capture({orderId:order.id,checkoutToken:order.checkoutToken});
  assert.equal(value.status,'PENDING');assert.equal(value.captureId,null);
});
test('unknown capture result survives a restart and reconciles without another payment',async(t)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'momo-paypal-test-')),file=path.join(dir,'orders.json');
  t.after(()=>{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir);});
  const state=mock(),pay=make(state,{storeFile:file}),request=input();
  const order=await pay.create(request);state.status='APPROVED';state.timeoutAfterCapture=true;
  const query={orderId:order.id,checkoutToken:order.checkoutToken};
  await assert.rejects(pay.capture(query),e=>e.code==='PAYPAL_NETWORK');
  const restarted=make(state,{storeFile:file});
  assert.equal((await restarted.create(request)).id,order.id);assert.equal(state.createCount,1);
  assert.equal((await restarted.capture(query)).status,'COMPLETED');assert.equal(state.captureCount,1);
  assert.equal(fs.readFileSync(file,'utf8').includes('test-secret'),false);
});
test('HTTP payment routes enforce origin, fixed catalog prices and credential privacy',async(t)=>{
  const state=mock(),server=createServer({env:{PAYPAL_CLIENT_ID:'test-client',PAYPAL_CLIENT_SECRET:'test-secret'},fetchImpl:state.fetch});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(route,value,headers={})=>fetch(base+'/api/paypal/'+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
  const config=await(await fetch(base+'/api/paypal/config')).json();assert.equal(config.environment,'sandbox');assert.equal(JSON.stringify(config).includes('test-secret'),false);
  assert.equal((await post('orders',input(),{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('approval',{}, {'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await fetch(base+'/paypal-return.html?token=forged',{headers:{'Sec-Fetch-Site':'cross-site',Origin:'https://www.sandbox.paypal.com'}})).status,200);
  assert.equal(state.captureCount,0);
  assert.equal((await fetch(base+'/.local/paypal-sandbox-orders.json')).status,404);
  const created=await post('orders',{...input(),amount:'0.01'});assert.equal(created.status,201);assert.equal((await created.json()).amount,'12.00');
  const experience=JSON.parse(state.calls.find(c=>c.url.endsWith('/orders')).body).payment_source.paypal.experience_context;
  assert.equal(experience.return_url,base+'/paypal-return.html?flow=return');assert.equal(experience.cancel_url,base+'/paypal-return.html?flow=cancel');
});
test('direct checkout only returns an official sandbox URL bound to this order and capability',async()=>{
  const state=mock(),pay=make(state),order=await pay.create(input(),{returnOrigin:'http://localhost:4173'});
  await assert.rejects(pay.approval({orderId:order.id,checkoutToken:'a'.repeat(64)}),e=>e.code==='PAYPAL_ORDER_NOT_FOUND');
  const result=await pay.approval({orderId:order.id,checkoutToken:order.checkoutToken});
  assert.equal(result.approvalUrl,'https://www.sandbox.paypal.com/checkoutnow?token='+order.id);assert.equal(result.returnsToMomo,true);assert.equal(state.captureCount,0);
  state.approvalOverride='https://evil.example/checkoutnow?token='+order.id;
  await assert.rejects(pay.approval({orderId:order.id,checkoutToken:order.checkoutToken}),e=>e.code==='PAYPAL_APPROVAL_UNAVAILABLE');
  await assert.rejects(pay.create(input(),{returnOrigin:'http://localhost:4173.evil.example'}),e=>e.code==='INVALID_RETURN_ORIGIN');
});
test('approval URL validation rejects live domains, credentials and different order IDs',()=>{
  for(const href of ['https://www.paypal.com/checkoutnow?token=EXPECTED','https://www.sandbox.paypal.com.evil.example/checkoutnow?token=EXPECTED','http://www.sandbox.paypal.com/checkoutnow?token=EXPECTED','https://foo@www.sandbox.paypal.com/checkoutnow?token=EXPECTED','https://www.sandbox.paypal.com/checkoutnow?token=OTHER'])assert.equal(approvalLink({links:[{rel:'approve',href}]},'EXPECTED'),null);
});
