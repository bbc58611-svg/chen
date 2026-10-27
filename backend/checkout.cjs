'use strict';
const {normalize}=require('../dist/needs.js');

function categoryFor(goal){
  const text=String(goal||'');
  if(/\b(?:gift|gifts|presents)\b|\b(?:buy|find|choose|a|thoughtful)\s+(?:a\s+)?present\b|礼物|礼品|伴手礼/i.test(text))return 'gift';
  const learning=/\b(?:learn\w*|practi[cs]\w*|study\w*|speaking|speak|lesson\w*|tutor\w*|conversation|pronunciation|language|course\w*)\b|学|练|口语|陪练|课程|老师|发音/i.test(text);
  if(!learning)return null;
  if(/(?:learn\w*|study\w*|practi[cs]\w*)\s+(?:some\s+)?(?:chinese|mandarin)\b|学中文|学汉语|练中文|练汉语/i.test(text))return 'chinese';
  if(/\b(?:english|esl|ielts|toefl)\b|英语|英文/i.test(text))return 'english';
  if(/\b(?:food|restaurant|recipes?|cook\w*|meal)\b|中餐|做饭|餐厅|菜谱/i.test(text))return null;
  if(/\b(?:chinese|mandarin)\b|中文|汉语/i.test(text))return 'chinese';
  return null;
}

function timeOptions(item,schedule){
  if(!item.slot)return ['Simple natural wrapping','Include a blank note card'];
  const text=String(schedule||'');
  let values=[...new Set([item.slot,'Sunday 19:00','Next Tuesday 20:00'])];
  const weekend=/weekend|周末/i.test(text);
  const weekdays=/weekdays?|工作日/i.test(text);
  if(weekend&&!/Saturday|Sunday|周六|周日/i.test(item.slot))return [];
  if(weekdays&&/Saturday|Sunday|周六|周日/i.test(item.slot))return [];
  if(weekend)values=values.filter(value=>/Saturday|Sunday/i.test(value));
  if(weekdays)values=values.filter(value=>! /Saturday|Sunday/i.test(value));
  const days=[['Monday',/monday|周一|星期一/i],['Tuesday',/tuesday|周二|星期二/i],['Wednesday',/wednesday|周三|星期三/i],['Thursday',/thursday|周四|星期四/i],['Friday',/friday|周五|星期五/i],['Saturday',/saturday|周六|星期六/i],['Sunday',/sunday|周日|星期日|星期天/i]].filter(([,pattern])=>pattern.test(text)).map(([day])=>day);
  if(days.length){
    if(!days.some(day=>item.slot.includes(day)))return [];
    values=values.filter(value=>days.some(day=>value.includes(day)));
  }
  if(/evening|after work|晚上|晚间/i.test(text))values=values.filter(value=>Number(value.match(/(\d{1,2}):\d{2}/)?.[1])>=18);
  return values;
}

function checkoutForNeeds(raw,catalog){
  const n=normalize(raw),category=categoryFor(n.goal);
  const none=(reason,message)=>({environment:'sandbox',status:'unavailable',category,reason,message,items:[]});
  if(/\b(?:free|no paid|without paying)\b|免费|不付费|不花钱/i.test(n.goal+' '+n.preferences.join(' ')))return none('free_only','You asked for a free path. No paid test option has been added.');
  if(!category)return none('unsupported_goal','These resources open on provider websites. There is no matching in-app checkout for this wish.');
  if((n.budgetCurrency&&n.budgetCurrency!=='USD')||(n.budgetAmount!==null&&!n.budgetCurrency))return none('currency','The test catalog uses USD. Your budget currency has been kept, without conversion.');
  if(category!=='gift'&&n.people!==null&&n.people!==1)return none('group_size','The language test items are one-to-one sessions. No matching group checkout is available.');
  if(n.location&&!/^(?:online|anywhere|any location|remote|not set|线上|不限)$/i.test(n.location))return none('location','The test catalog cannot confirm a provider in your requested area. Your location has been kept.');
  const candidates=catalog.filter(item=>item.scene===category).map(item=>{
    let options=timeOptions(item,n.schedule);
    if(category==='gift'&&item.slot&&n.people!==null&&n.people!==2)options=[];
    const cost=category==='gift'&&item.slot&&n.budgetScope==='per_person'?item.price/2:item.price;
    return {item,options,cost};
  }).filter(({options,cost})=>options.length&&(n.budgetAmount===null||cost<=n.budgetAmount));
  if(/patient|beginner|耐心|初学/i.test(n.preferences.join(' ')))candidates.sort((a,b)=>Number(b.item.patient)-Number(a.item.patient)||a.item.price-b.item.price);
  else candidates.sort((a,b)=>a.item.price-b.item.price);
  const items=candidates.slice(0,3).map(({item,options})=>({id:item.id,options}));
  if(!items.length)return none('no_match','No test item matches your current budget and timing. Your limits have not been changed.');
  return {environment:'sandbox',status:'available',category,items};
}

module.exports={checkoutForNeeds,categoryFor,timeOptions};
