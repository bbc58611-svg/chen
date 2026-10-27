'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDeepSeek}=require('../backend/deepseek.cjs');
const {loadCatalog}=require('../server.cjs');
const {optionsFor}=require('../backend/paypal.cjs');
const display=require('../dist/display.js');
const N=require('../dist/needs.js');
test('English catalog preserves item IDs and prices, and accepts legacy checkout options',()=>{
  const catalog=loadCatalog();
  const expected={'en-ella':18,'en-noah':14,'en-mia':22,'en-sam':12,'zh-lin':16,'zh-mei':13,'zh-chen':20,'zh-an':11,'gift-book':12,'gift-tea':18,'gift-clay':38,'gift-letter':6};
  assert.equal(catalog.length,Object.keys(expected).length);
  for(const item of catalog){assert.equal(item.price,expected[item.id]);assert.equal(/\p{Script=Han}/u.test(item.name+item.desc+item.unit+(item.slot||'')),false);}
  const ella=catalog.find(i=>i.id==='en-ella');
  assert.ok(optionsFor(ella).includes('Saturday 10:00'));assert.ok(optionsFor(ella).includes('周六 10:00'));
  const gift=catalog.find(i=>i.id==='gift-letter');
  assert.ok(optionsFor(gift).includes('Simple natural wrapping'));assert.ok(optionsFor(gift).includes('简约原色包装'));
});
test('legacy receipts render English without changing order or capture data',()=>{
  const record={id:'ORDER-OLD',captureId:'CAPTURE-OLD',name:'Ella · 慢慢开口',option:'周六 10:00',price:18};const before=JSON.stringify(record);
  assert.equal(display.text(record.name),'Ella · Speak at Your Pace');assert.equal(display.text(record.option),'Saturday 10:00');assert.equal(JSON.stringify(record),before);
  assert.equal(display.text(record.id),record.id);assert.equal(display.text(record.captureId),record.captureId);
});
test('English weekend requests retain strict budget and timing constraints; output language is explicit',async()=>{
  const catalog=loadCatalog();let payload;
  const raw={reply:'Here are some options.',needs:{goal:'English conversation practice',budgetAmount:15,budgetCurrency:'USD',schedule:'Weekends only',preferences:[]},paths:[],recommendations:[],catalogIntent:'none'};
  const chat=createDeepSeek({apiKey:'test',catalog,fetchImpl:async(url,opts)=>{payload=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}));}});
  const result=await chat([{role:'user',content:'English practice, $15, weekends only. Use the demo catalog.'}]);
  assert.deepEqual(result.recommendations.map(i=>i.id),['en-sam']);assert.equal(result.needs.budgetAmount,15);
  assert.ok(payload.messages.some(m=>m.role==='system'&&m.content.includes('Reply in natural, concise English by default')));
  assert.deepEqual(N.normalize({preferences:['2 people','patient'],people:2}).preferences,['patient']);
});
