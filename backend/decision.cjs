'use strict';
const needs=require('../dist/needs.js');
const instructions=`交互与结构化字段补充（优先执行）：
1. reply 用1到2句给结论，通常不超过90字。详细匹配依据放到资源卡片中，不重复长篇解释。需求足够时直接给选择，别每次都追问或固定生成三条路径。paths 可以0到3项；有问题、真实资源或执行清单时可不提供路径。
2. needs 除原字段外必须有 people（人数整数或null）、location（用户已说出的城市/大致区域或null）、budgetScope（total总预算/per_person人均/per_item每项/null）。总预算不能当成人均。用户最新修改优先；未修改的已知信息保持。schedule 与 preferences 也要保留。preferences 只存口味、风格等偏好，不重复人数、预算和位置。reply 不报告具体资源数量或未展示的候选，卡片数量由服务端筛选后显示。
3. offers 引用 sourceId，可附 entityName（一个具体餐厅/课程/活动/商品名，必须逐字出现在对应来源标题或摘要中）、locationText（逐字摘录的公开区域或地址，不能猜）、category（restaurant/course/activity/product/recipe/other）、reason、caution。
4. 如有价格依据，可附 price:{amount:50,currency:'CNY',basis:'per_person',evidence:'人均50元'}。evidence 必须逐字来自对应来源；basis 仅 per_person/total/per_item。未见价格就设 price:null；不要由预算倒推价格。总价套餐注明 coversPeople，且人数必须能在证据中找到。旧文章的价格只可称来源参考价，不能称实时价格或保证预算内。服务端会核对证据和计算参考总价，不依赖你填写的 budgetFit。
5. 用户需要选择问题、内容或下一步时，返回 checklist:{title:'选择想保留的内容',items:['一个有意义的选项','另一个独立选项'],note:''}，优先2至5项，最多8项。用户会勾选并提交，勾选代表选择而非已完成。不要把问候、感谢等普通句子拆成选项。用户提交选择后直接给可用结果，只采用选中的内容，不补回未选内容，不再给同一份 checklist 或重复追问确认。需要直接给他人发送的消息时，使用 draft:{title:'可以直接发送的消息',body:'完整、简短自然的一段正文'}，checklist:null、question:null、paths:[]；不要将消息正文重复放在 reply 中，reply 只简短说明。其余情况 draft:null。用户明确要操作清单、食材步骤时可用 checklist 整理实际行动。不能编造缺少证据的菜价、时段或预约成功状态，也不能声称已发送消息。
6. 优先检索官方页面与较新的资料；来源日期未知时明确未知。网页只作线索，不假装已核实营业、配送或库存。`;

function overrideFields(raw){
  if(raw==null)return null;
  if(typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_NEEDS');
  const out={},allowed=['goal','people','location','budgetAmount','budgetCurrency','budgetScope','schedule','preferences'];
  for(const key of allowed){
    if(!Object.hasOwn(raw,key))continue;
    const v=raw[key];
    if(key==='people'&&v!==null&&(!Number.isInteger(v)||v<1||v>99))throw Error('INVALID_NEEDS');
    if(key==='budgetAmount'&&v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000000))throw Error('INVALID_NEEDS');
    if(key==='budgetCurrency'&&v!==null&&(typeof v!=='string'||!/^[A-Z]{3}$/.test(v)))throw Error('INVALID_NEEDS');
    if(key==='budgetScope'&&v!==null&&!['total','per_person','per_item'].includes(v))throw Error('INVALID_NEEDS');
    if(key==='preferences'&&(!Array.isArray(v)||v.length>6||v.some(x=>typeof x!=='string'||x.length>80)))throw Error('INVALID_NEEDS');
    if(['goal','location','schedule'].includes(key)&&v!==null&&(typeof v!=='string'||v.length>300))throw Error('INVALID_NEEDS');
    out[key]=v;
  }
  return out;
}
function checklist(value){
  if(!value||typeof value!=='object'||typeof value.title!=='string'||!Array.isArray(value.items))return null;
  const items=value.items.filter(x=>typeof x==='string'&&x.trim()).slice(0,8).map(x=>x.trim().slice(0,240));
  if(!items.length)return null;
  return {title:value.title.trim().slice(0,100),items,note:typeof value.note==='string'?value.note.trim().slice(0,400):''};
}
function draft(value){
  if(!value||typeof value!=='object'||typeof value.body!=='string'||!value.body.trim())return null;
  return {title:typeof value.title==='string'?value.title.trim().slice(0,100)||'A message you can send':'A message you can send',body:value.body.trim().slice(0,1600)};
}
function queryForNeeds(raw){
  const n=needs.normalize(raw);
  return [n.location,n.goal.slice(0,45),n.people?`${n.people} people`:'',n.budgetAmount!==null?`${needs.scope(n.budgetScope)} ${n.budgetAmount} ${n.budgetCurrency||''}`:'',['待确认','Not set'].includes(n.schedule)?'':n.schedule,...n.preferences].filter(Boolean).join(' ').slice(0,128);
}
module.exports={instructions,overrideFields,checklist,draft,normalizeNeeds:needs.normalize,queryForNeeds};
