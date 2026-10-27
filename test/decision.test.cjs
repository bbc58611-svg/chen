'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {referencePrice,compareBudget,enrichOffer}=require('../backend/evidence.cjs');
const {groundedOffers}=require('../backend/search.cjs');
const {createDeepSeek}=require('../backend/deepseek.cjs');
const N=require('../dist/needs.js');
const source={id:'s1',title:'小馆的公开介绍',summary:'和风小馆，位于杭州滨江。人均50元。营业情况需核实。',url:'https://example.com/restaurant',site:'example.com',publishedAt:'2024-01-01'};
const pick={sourceId:'s1',entityName:'和风小馆',locationText:'杭州滨江',category:'restaurant',price:{amount:50,currency:'CNY',basis:'per_person',evidence:'人均50元'},reason:'适合先看看',budgetFit:'within'};
const needs={goal:'吃中餐',people:2,location:'杭州滨江',budgetAmount:100,budgetCurrency:'CNY',budgetScope:'total',schedule:'今晚',preferences:['不辣']};
test('reference price requires exact source evidence and matching unit/amount',()=>{
  assert.equal(referencePrice(pick.price,source).amount,50);
  assert.equal(referencePrice({...pick.price,evidence:'人均10元'},source),null);
  assert.equal(referencePrice({...pick.price,amount:5},source),null);
  assert.equal(referencePrice({...pick.price,currency:'USD'},source),null);
  assert.equal(referencePrice({...pick.price,basis:'total'},source),null);
  assert.equal(referencePrice({...pick.price,evidence:'人均50-80元'},{...source,summary:'人均50-80元'}),null);
  assert.equal(referencePrice({...pick.price,evidence:'人均50元起'},{...source,summary:'人均50元起'}),null);
});
test('server calculates total budget using party size and drops over-budget resources',()=>{
  const search={status:'succeeded',results:[source]};
  const two=groundedOffers([pick],search,needs);
  assert.equal(two.length,1);assert.equal(two[0].budget.estimate,100);assert.equal(two[0].budget.status,'reference_within');
  assert.deepEqual(groundedOffers([pick],search,{...needs,people:3}),[]);
  assert.equal(compareBudget(two[0].price,{...needs,budgetScope:'per_person'}).estimate,50);
});
test('no currency conversion or unsupported model budget promise',()=>{
  const foreign=enrichOffer(pick,source,{...needs,budgetCurrency:'USD'});
  assert.equal(foreign.budget.status,'unknown');
  const noEvidence=enrichOffer({...pick,price:null,reason:'完全符合你的预算'},source,needs);
  assert.equal(noEvidence.budgetFit,'unknown');assert.equal(noEvidence.reason.includes('完全符合'),false);
});
test('specific entity and location must occur in the source, map links only use validated names',()=>{
  const valid=enrichOffer(pick,source,needs);
  assert.equal(valid.entityName,'和风小馆');assert.equal(valid.locationText,'杭州滨江');
  assert.ok(valid.actions.some(a=>a.kind==='map'&&a.url.startsWith('https://uri.amap.com/search?')));
  assert.ok(valid.actions.some(a=>a.kind==='checklist'&&a.label==='Plan a meal'));
  const invented=enrichOffer({...pick,entityName:'编造餐厅',locationText:'不存在的地址'},source,needs);
  assert.equal(invented.entityName,null);assert.equal(invented.locationText,null);assert.equal(invented.actions.some(a=>a.kind==='map'),false);
});
test('party-size edits produce a visible change without pretending unchanged budget changed',()=>{
  const delta=N.changes(needs,{...needs,people:3,preferences:['不辣','安静']});
  assert.ok(delta.includes('Group size changed to 3 people'));assert.equal(delta.some(x=>x.includes('budget')),false);
  assert.ok(delta.some(x=>x.includes('安静')));
  assert.deepEqual(N.normalize({...needs,people:3,preferences:['两人','清淡不辣','2个人用餐']}).preferences,['清淡不辣']);
});
test('editor overrides remain exact even when model returns previous values',async()=>{
  const response={reply:'按新人数继续找。',needs,paths:[{title:'先确认',description:'看菜单',kind:'plan',firstStep:'核对实际费用'}],question:null,recommendations:[],catalogIntent:'none'};
  let payload;
  const chat=createDeepSeek({apiKey:'test',fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}));}});
  const changed=await chat([{role:'user',content:'改成三个人，其他保持。'}],{needsOverride:{people:3}});
  assert.equal(changed.needs.people,3);assert.equal(changed.needs.budgetAmount,100);
  assert.ok(payload.messages.some(m=>m.role==='system'&&m.content.includes('"people":3')));
  await assert.rejects(chat([{role:'user',content:'修改'}],{needsOverride:{people:-1}}),e=>e.code==='INVALID_NEEDS');
});
test('a concrete checklist can replace repetitive path cards',async()=>{
  const response={reply:'先按清单核实，再决定。',needs,paths:[],checklist:{title:'到店前的点单清单',items:['确认三人实际菜量','核对菜单总价'],note:'当前价格尚未确认'},question:null,recommendations:[]};
  const value=await createDeepSeek({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}))})([{role:'user',content:'整理一份清单'}]);
  assert.equal(value.paths.length,0);assert.equal(value.checklist.items.length,2);
});
test('editing an existing search refreshes cards even when model skips a search query',async()=>{
  const response={reply:'按新条件继续比较。',needs,paths:[{title:'看看选项',description:'查看真实来源',kind:'plan',firstStep:'核对费用'}],question:null,recommendations:[],offers:[pick]};
  let searches=0;
  const chat=createDeepSeek({apiKey:'test',fetchImpl:async url=>{
    if(url.endsWith('/v1/tools/search')){searches++;return new Response(JSON.stringify({results:[source]}));}
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}));
  }});
  const value=await chat([{role:'user',content:'改成三个人，总预算200元，继续找。'}],{needsOverride:{people:3,budgetAmount:200},refreshResources:true});
  assert.equal(searches,1);assert.equal(value.search.status,'succeeded');assert.equal(value.needs.people,3);
  assert.equal(value.offers[0].budget.estimate,150);
});
test('partial model updates inherit confirmed needs during editor changes',async()=>{
  const partial={reply:'按三个人继续找。',needs:{people:3}};
  const chat=createDeepSeek({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(partial)}}]}))});
  const value=await chat([{role:'user',content:'找中餐'},{role:'assistant',content:JSON.stringify({needs})},{role:'user',content:'改成三个人'}],{needsOverride:{people:3}});
  assert.equal(value.needs.people,3);assert.equal(value.needs.budgetAmount,100);assert.equal(value.needs.location,'杭州滨江');assert.deepEqual(value.paths,[]);assert.deepEqual(value.recommendations,[]);
});
