'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const source=name=>fs.readFileSync(path.join(__dirname,'../dist',name),'utf8');
const storage=initial=>{const map=new Map(Object.entries(initial||{}));return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const element=()=>({textContent:'',innerHTML:'',hidden:false,disabled:false,append(){},remove(){}});
test('SDK failure keeps direct checkout usable and never calls capture before buyer approval',async()=>{
  const fields=new Map(),root={...element(),querySelector:s=>{if(!fields.has(s))fields.set(s,element());return fields.get(s);}};
  const calls=[],window={},sessionStorage=storage();let destination='';
  const order={id:'TESTORDER123456789',checkoutToken:'a'.repeat(64)};
  const document={createElement:()=>element(),head:{append:script=>queueMicrotask(()=>script.onerror())},querySelectorAll:()=>[]};
  const context={window,document,sessionStorage,URL,URLSearchParams,AbortSignal,setTimeout,clearTimeout,crypto:{randomUUID},location:{assign:url=>destination=url},fetch:async(url,options)=>{
    calls.push({url,options});let value;
    if(url.endsWith('/config'))value={apiVersion:2,configured:true,clientId:'test'};
    else if(url.endsWith('/orders'))value=order;
    else if(url.endsWith('/approval'))value={status:'PAYER_ACTION_REQUIRED',returnsToMomo:true,approvalUrl:'https://www.sandbox.paypal.com/checkoutnow?token='+order.id};
    else throw Error('Capture must not be called before approval');
    return new Response(JSON.stringify(value));
  }};
  vm.runInNewContext(source('payments.js'),context);
  await window.MOMO_PAYMENTS.mount(root,{item:{id:'en-sam',name:'Sam'},getOption:()=> '周六 14:00',onComplete:()=>assert.fail('Must not complete yet')});
  assert.ok(root.innerHTML.includes('data-payment-direct'));
  assert.ok(root.querySelector('[data-payment-status]').textContent.includes('Open checkout'));
  await root.querySelector('[data-payment-direct]').onclick();
  assert.equal(destination,'https://www.sandbox.paypal.com/checkoutnow?token='+order.id);
  assert.equal(calls.filter(c=>c.url.endsWith('/orders')).length,1);
  const pending=JSON.parse(sessionStorage.getItem('momo-paypal-pending-v1'));assert.equal(pending.checkoutToken,order.checkoutToken);
  assert.equal(destination.includes(order.checkoutToken),false);
});
test('return query strings alone cannot cause capture or show a successful receipt',()=>{
  for(const query of ['?flow=return&token=FORGED','?flow=cancel&token=EXPECTED']){
    const nodes=new Map(),pending={id:'EXPECTED',checkoutToken:'a'.repeat(64)};let network=0;
    vm.runInNewContext(source('paypal-return.js'),{URLSearchParams,location:{search:query},sessionStorage:storage({'momo-paypal-pending-v1':JSON.stringify(pending)}),document:{querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);}},fetch:()=>{network++;throw Error('Unexpected capture');}});
    assert.equal(network,0);assert.equal(nodes.get('#paymentReturnTitle').textContent.includes('付款已完成'),false);
  }
});
test('an old backend cannot create another checkout and shows a restart instruction',async()=>{
  const nodes=new Map(),root={...element(),querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);}},window={};
  let calls=0;
  vm.runInNewContext(source('payments.js'),{window,sessionStorage:storage(),AbortSignal,document:{querySelectorAll:()=>[],createElement:()=>assert.fail('Do not load the SDK against an incompatible backend')},fetch:async url=>{calls++;assert.equal(url,'/api/paypal/config');return new Response(JSON.stringify({configured:true,clientId:'test'}));}});
  await window.MOMO_PAYMENTS.mount(root,{item:{id:'en-sam'},getOption:()=>'',onComplete:()=>assert.fail('Must not report payment')});
  assert.equal(calls,1);assert.equal(root.querySelector('[data-payment-direct]').disabled,true);
  assert.ok(root.querySelector('[data-payment-status]').textContent.includes('start-momo.cmd'));
});
