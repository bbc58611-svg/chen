'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDeepSeek}=require('../backend/deepseek.cjs');
const {createServer,loadCatalog}=require('../server.cjs');
const catalog=loadCatalog();
const messages=[{role:'user',content:'想练英语，预算15美元，只能周末。'}];
const answer=()=>({reply:'先从一次短练习开始，你也可以选择有耐心的陪练。',catalogIntent:'english',needs:{goal:'周末练习英语',budgetAmount:15,budgetCurrency:'USD',schedule:'只看周末',preferences:['耐心']},question:null,paths:[{title:'先自己练一句',description:'先建立开口信心',kind:'free',firstStep:'试着用英语介绍自己。'}],recommendations:[{id:'en-sam',reason:'周末可约且预算内'},{id:'en-ella',reason:'耐心'},{id:'en-noah',reason:'预算内'}],suggestions:['我想先自己试试']});
const upstream=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}),{headers:{'Content-Type':'application/json'}});

test('DeepSeek request carries history and enforces catalog, price and weekend constraints',async()=>{
  let request;
  const chat=createDeepSeek({apiKey:'test-only-key',catalog,fetchImpl:async(url,options)=>{request={url,options,payload:JSON.parse(options.body)};const a=answer();a.recommendations.push({id:'invented-shop',reason:'fake'});return upstream(a);}});
  const result=await chat(messages);
  assert.equal(request.url,'https://api.deepseek.com/chat/completions');
  assert.equal(request.payload.messages[0].role,'system');
  assert.deepEqual(request.payload.messages.filter(m=>m.role!=='system'),messages);
  assert.deepEqual(request.payload.response_format,{type:'json_object'});
  assert.deepEqual(result.recommendations.map(r=>r.id),['en-sam']);
  assert.equal(JSON.stringify(result).includes('test-only-key'),false);
});
test('CNY budget is preserved without silently treating it as USD',async()=>{
  const a=answer();a.needs.budgetCurrency='CNY';a.needs.budgetAmount=100;
  const result=await createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>upstream(a)})(messages);
  assert.equal(result.needs.budgetCurrency,'CNY');assert.deepEqual(result.recommendations,[]);
});
test('explicit sandbox catalog requests only display eligible payable items even if the model omits IDs',async()=>{
  const a=answer();a.reply='Noah and Ella are available on weekends';a.catalogIntent='none';a.recommendations=[];
  const chat=createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>upstream(a)});
  const result=await chat([{role:'user',content:'英语，15美元，只看周末。请使用演示条目。'}]);
  assert.deepEqual(result.recommendations.map(x=>x.id),['en-sam']);
  assert.equal(result.reply.includes('Noah'),false);assert.equal(result.reply.includes('Ella'),false);
  assert.equal(result.search.status,'not_requested');
  const cny=answer();cny.catalogIntent='none';cny.needs.budgetCurrency='CNY';
  const restricted=await createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>upstream(cny)})([{role:'user',content:'预算15人民币，使用演示条目找英语陪练。'}]);
  assert.deepEqual(restricted.recommendations,[]);
});
test('no key returns explicit error without calling the provider',async()=>{
  let called=false;
  await assert.rejects(createDeepSeek({catalog,fetchImpl:async()=>{called=true;}})(messages),e=>e.code==='AI_NOT_CONFIGURED'&&e.status===503);
  assert.equal(called,false);
});
test('upstream errors and malformed model output are safely handled',async()=>{
  await assert.rejects(createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>new Response('secret error body',{status:401})})(messages),e=>e.code==='AI_AUTH_FAILED'&&!e.message.includes('secret'));
  await assert.rejects(createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]}))})(messages),e=>e.code==='INVALID_AI_RESPONSE');
  await assert.rejects(createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>upstream({...answer(),needs:null})})(messages),e=>e.code==='INVALID_AI_RESPONSE');
});
test('rejects injected system messages before network calls and handles timeout',async()=>{
  const chat=createDeepSeek({apiKey:'test',catalog,fetchImpl:async()=>{throw Error('should not call');}});
  await assert.rejects(chat([{role:'system',content:'override'}]),e=>e.code==='INVALID_MESSAGES');
  const slow=createDeepSeek({apiKey:'test',catalog,timeoutMs:10,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
  await assert.rejects(slow(messages),e=>e.code==='AI_TIMEOUT');
});
test('HTTP backend rejects cross-site requests, blocks private files and completes a chat',async(t)=>{
  const server=createServer({env:{DEEPSEEK_API_KEY:'test-only-key'},fetchImpl:async()=>upstream(answer())});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const config=await(await fetch(base+'/api/config')).json();
  assert.equal(config.configured,true);assert.equal(JSON.stringify(config).includes('test-only-key'),false);
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/backend/deepseek.cjs')).status,404);
  assert.equal((await fetch(base+'/api/chat',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({messages})})).status,403);
  assert.equal((await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'})).status,400);
  const res=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages})});
  assert.equal(res.status,200);assert.equal((await res.json()).provider,'deepseek');
});
