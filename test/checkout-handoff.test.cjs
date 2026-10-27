'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {checkoutForNeeds,categoryFor}=require('../backend/checkout.cjs');
const {createDeepSeek}=require('../backend/deepseek.cjs');
const {loadCatalog}=require('../server.cjs');
const N=require('../dist/needs.js');
const catalog=loadCatalog();
const needs=(extra={})=>({goal:'Find an English speaking partner',budgetAmount:15,budgetCurrency:'USD',schedule:'Weekends only',...extra});

test('ordinary language-learning needs have a payable, bounded test choice without a magic demo phrase',async()=>{
  let calls=0;
  const raw={reply:'Noah fits your weekend needs.',needs:needs(),paths:[{title:'Compare lessons',kind:'service',description:'Compare styles',firstStep:'Pick a tutor'}],recommendations:[],catalogIntent:'none'};
  const chat=createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw)}}]}));}});
  const result=await chat([{role:'user',content:'I want an English speaking partner for under $15, weekends only.'}]);
  assert.equal(calls,1);assert.equal(result.checkout.status,'available');
  assert.deepEqual(result.checkout.items.map(item=>item.id),['en-sam']);
  assert.deepEqual(result.recommendations,[]);assert.deepEqual(result.offers,[]);
  assert.equal(result.checkout.environment,'sandbox');
  assert.equal(result.reply.includes('Noah'),false);assert.match(result.reply,/Sam.*USD 12\.00/);
});

test('checkout suggestions never convert currency, ignore group size, or raise a budget',()=>{
  for(const extra of [{budgetAmount:10},{budgetCurrency:'CNY'},{budgetCurrency:null},{people:2},{location:'San Francisco'}]){
    const result=checkoutForNeeds(needs(extra),catalog);assert.equal(result.status,'unavailable');assert.deepEqual(result.items,[]);
  }
});

test('test time choices retain weekend and specific-day constraints all the way into checkout',()=>{
  const weekend=checkoutForNeeds(needs(),catalog);
  assert.deepEqual(weekend.items[0].options,['Saturday 14:00','Sunday 19:00']);
  const sunday=checkoutForNeeds(needs({schedule:'Sunday only',budgetAmount:30}),catalog);
  assert.deepEqual(sunday.items.map(item=>item.id),['en-mia']);
  assert.ok(sunday.items.every(item=>item.options.every(option=>option.includes('Sunday'))));
  const weekday=checkoutForNeeds(needs({schedule:'Wednesday only'}),catalog);
  assert.deepEqual(weekday.items.map(item=>item.id),['en-noah']);assert.deepEqual(weekday.items[0].options,['Wednesday 20:00']);
});

test('free paths and unsupported requests do not acquire unrelated paid items',()=>{
  assert.equal(checkoutForNeeds(needs({goal:'Find free English lessons'}),catalog).reason,'free_only');
  for(const goal of ['Find a Chinese restaurant','Learn to cook Chinese food','Help me present a project','Learn singing']){
    assert.equal(categoryFor(goal),null);assert.equal(checkoutForNeeds(needs({goal}),catalog).status,'unavailable');
  }
  assert.equal(categoryFor('Learn Chinese in English'),'chinese');
});

test('only fixed catalog items are offered, with at most three choices',()=>{
  const english=checkoutForNeeds(needs({budgetAmount:null,schedule:'Not set'}),catalog);
  assert.equal(english.items.length,3);assert.ok(english.items.every(choice=>catalog.some(item=>item.id===choice.id)));
  const gift=checkoutForNeeds(needs({goal:'Find a thoughtful gift',budgetAmount:10,schedule:'Not set'}),catalog);
  assert.deepEqual(gift.items.map(item=>item.id),['gift-letter']);
});

test('the new selection is an explicit sandbox order review, not another checklist or external merchant charge',()=>{
  const window={MOMO_NEEDS:N};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/decision-ui.js'),'utf8'),{window});
  const html=window.MOMO_DECISIONS.checkout(checkoutForNeeds(needs(),catalog),catalog);
  assert.match(html,/Choose one option\. Review, then pay/);assert.match(html,/data-checkout-choice="en-sam"/);
  assert.match(html,/\$12\.00 USD/);assert.match(html,/Fictional test items/);assert.match(html,/Review &amp; pay/);
  assert.equal(html.includes('data-check-item'),false);assert.equal(html.includes('data-submit-selection'),false);
  const noMatch=window.MOMO_DECISIONS.checkout(checkoutForNeeds(needs({goal:'Find a Chinese restaurant'}),catalog),catalog);
  assert.match(noMatch,/No in-app checkout/);assert.equal(noMatch.includes('data-checkout-choice'),false);
});
