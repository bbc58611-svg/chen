'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const N=require('../dist/needs.js');
const {normalizeResult,createDeepSeek}=require('../backend/deepseek.cjs');
const window={MOMO_NEEDS:N};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/decision-ui.js'),'utf8'),{window});
const D=window.MOMO_DECISIONS;
const list={title:'想问老师什么？',items:['体验课具体练什么？','还有其他费用吗？','可以改约吗？'],note:'价格可能变化'};
test('selection submits only checked contents, not unselected items or the note',()=>{
  assert.equal(D.selectionText(list,new Set()),'');
  const text=D.selectionText(list,new Set([0,2,99]));
  const data=JSON.parse(text.slice(text.indexOf('\n')+1));
  assert.deepEqual(data.selected,[list.items[0],list.items[2]]);
  assert.equal(text.includes(list.items[1]),false);
  assert.equal(text.includes(list.note),false);
  assert.ok(text.includes('Do not add unselected items'));
});
test('choice UI starts disabled and reflects multi-select count without checklist copy',()=>{
  assert.match(D.checklist(list),/data-submit-selection disabled/);
  const html=D.checklist(list,new Set([1,2]));
  assert.match(html,/Submit choices\s*\(2\)/);
  assert.match(html,/Selected 2 items/);
  assert.equal((html.match(/ checked/g)||[]).length,2);
  assert.equal(html.includes('data-copy-checklist'),false);
  assert.equal(html.includes('data-submit-selection disabled'),false);
});
test('message draft replaces follow-up checkboxes, questions and path cards',async()=>{
  const response={reply:'整理好了，直接复制即可。',needs:{goal:'咨询声乐体验课'},draft:{title:'发给老师的消息',body:'老师您好，想请问15分钟体验课具体练什么？谢谢！'},checklist:list,question:'还想问什么？',paths:[{title:'试听',description:'了解课程',kind:'service',firstStep:'咨询老师'}]};
  const result=await createDeepSeek({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}))})([{role:'user',content:D.selectionText(list,new Set([0]))}]);
  assert.equal(result.draft.body,response.draft.body);
  assert.equal(result.checklist,null);assert.equal(result.question,null);assert.deepEqual(result.paths,[]);
  assert.ok(D.draft(result.draft).includes('data-copy-draft'));
  assert.equal(D.draft(result.draft).includes('type="checkbox"'),false);
  assert.equal(JSON.parse(D.context(result)).draft.body,response.draft.body);
});
test('malformed drafts are ignored and message text remains escaped and bounded',()=>{
  const raw={reply:'你好',needs:{goal:'咨询'},draft:{body:[]}};
  assert.equal(normalizeResult(raw,[]).draft,null);
  const result=normalizeResult({...raw,draft:{body:'x'.repeat(2000)}},[]);
  assert.equal(result.draft.body.length,1600);
  assert.ok(D.draft({body:'</textarea><script>alert(1)</script>'}).includes('&lt;/textarea&gt;'));
});
