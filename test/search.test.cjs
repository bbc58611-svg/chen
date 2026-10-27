'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDeepSeek}=require('../backend/deepseek.cjs');
const {publicUrl,groundedOffers}=require('../backend/search.cjs');
const {loadCatalog}=require('../server.cjs');
const catalog=loadCatalog();
const result=()=>({reply:'我们可以先比较你所在区域的中餐信息，具体价格以来源为准。',needs:{goal:'吃中餐',budgetAmount:100,budgetCurrency:'CNY',schedule:'今晚',preferences:['两个人','川菜']},question:null,paths:[{title:'出去吃',description:'先比较附近的餐饮信息',kind:'service',firstStep:'查看来源中的地址与菜单。'},{title:'自己做',description:'按现有食材安排一顿饭',kind:'self',firstStep:'列出已有食材。'}],catalogIntent:'none',recommendations:[],searchQuery:'杭州 滨江 两人 川菜 餐厅',offers:[],suggestions:['想看看清淡一点的']});
const completion=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
const request=[{role:'user',content:'杭州滨江，两个人，预算100元，今晚想吃川菜。'}];

test('search results become source-bound cards, never model-invented titles or URLs',async()=>{
  let chats=0,searches=0;
  const chat=createDeepSeek({apiKey:'test',catalog,fetchImpl:async(url,options)=>{
    if(url.endsWith('/v1/tools/search')){
      searches++;const body=JSON.parse(options.body);assert.equal(body.query,'杭州 滨江 两人 川菜 餐厅');assert.equal(body.need_content,false);
      return new Response(JSON.stringify({results:[{title:'真实返回的网页标题',url:'https://example.com/menu',summary:'来源页面中的餐饮信息'},{title:'危险链接',url:'javascript:alert(1)',summary:'bad'}]}));
    }
    chats++;
    const data=result();
    if(chats===2){
      const payload=JSON.parse(options.body);assert.ok(payload.messages.at(-1).content.includes('真实返回的网页标题'));
      data.searchQuery=null;data.offers=[{sourceId:'s1',title:'编造的新商家',url:'https://invented.example/checkout',reason:'可以查看菜单信息',caution:'价格和当前营业状态需确认'},{sourceId:'s99',reason:'不存在的来源'}];
    }
    return completion(data);
  }});
  const data=await chat(request);
  assert.equal(chats,2);assert.equal(searches,1);assert.equal(data.search.status,'succeeded');
  assert.equal(data.offers.length,1);assert.equal(data.offers[0].title,'真实返回的网页标题');assert.equal(data.offers[0].url,'https://example.com/menu');assert.equal(data.recommendations.length,0);
});
test('out-of-catalog goals accept self-directed paths and never require a fake free offer',async()=>{
  const data=result();data.searchQuery=null;data.recommendations=[{id:'en-sam',reason:'unrelated'}];data.question='你想出去吃、点外卖，还是自己做？';
  const answer=await createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>completion(data)})([{role:'user',content:'我想吃中餐'}]);
  assert.equal(answer.paths[1].kind,'self');assert.deepEqual(answer.recommendations,[]);assert.equal(answer.search.status,'not_requested');assert.deepEqual(answer.offers,[]);
});
test('search failures remain explicit and do not generate fake resource cards',async()=>{
  const data=await createDeepSeek({apiKey:'test',catalog,fetchImpl:async url=>url.endsWith('/v1/tools/search')?new Response('private upstream message',{status:401}):completion(result())})(request);
  assert.equal(data.search.status,'failed');assert.deepEqual(data.offers,[]);assert.equal(JSON.stringify(data).includes('private upstream message'),false);
});
test('empty or disabled searches are distinct from a successful source match',async()=>{
  const empty=await createDeepSeek({apiKey:'test',catalog,fetchImpl:async url=>url.endsWith('/v1/tools/search')?new Response('{"results":[]}'):completion(result())})(request);
  assert.equal(empty.search.status,'empty');assert.deepEqual(empty.offers,[]);
  let calls=0;const disabled=await createDeepSeek({apiKey:'test',catalog,searchEnabled:false,fetchImpl:async()=>{calls++;return completion(result());}})(request);
  assert.equal(disabled.search.status,'disabled');assert.equal(calls,1);
});
test('source validation rejects unsafe URLs and respects an empty model relevance selection',()=>{
  for(const url of ['javascript:alert(1)','file:///secret','http://127.0.0.1/','http://localhost/','https://user:password@example.com/'])assert.equal(publicUrl(url),null);
  assert.equal(publicUrl('https://example.com/page'),'https://example.com/page');
  const search={status:'succeeded',results:[{id:'s1',title:'资源',url:'https://example.com/'}]};
  assert.deepEqual(groundedOffers([],search),[]);
  assert.deepEqual(groundedOffers([{sourceId:'s999'}],search),[]);
  assert.deepEqual(groundedOffers([{sourceId:'s1',budgetFit:'over'}],search),[]);
  assert.equal(groundedOffers([{sourceId:'s1'}],search)[0].budgetFit,'unknown');
});
