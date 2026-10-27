'use strict';
const short=(v,n=180)=>typeof v==='string'?v.trim().slice(0,n):'';
const contains=(haystack,value)=>!!value&&haystack.includes(value);
function referencePrice(raw,source){
  if(!raw||typeof raw!=='object')return null;
  const amount=raw.amount,currency=short(raw.currency,3),basis=raw.basis,evidence=short(raw.evidence,220);
  const haystack=`${source.title||''} ${source.summary||''}`;
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>10000000||!contains(haystack,evidence))return null;
  // A range or minimum is not one fixed price suitable for a total-budget check.
  if(/\d(?:\.\d+)?\s*(?:元)?\s*[-~～—–至到]\s*\d|起|至少|低至|最低|优惠券|立减/.test(evidence))return null;
  if(!['per_person','total','per_item'].includes(basis))return null;
  const numeric=String(amount).replace('.', '\\.');
  if(!new RegExp(`(^|[^0-9.])${numeric}(?:\\.0+)?($|[^0-9.])`).test(evidence))return null;
  const currencies={CNY:/人民币|元|￥|¥|CNY|人均/i,USD:/USD|US\$|\$|美元/i,EUR:/EUR|€|欧元/i,GBP:/GBP|£|英镑/i};
  if(!currencies[currency]?.test(evidence))return null;
  if(basis==='per_person'&&!/人均|每人|每位|\/人|per person/i.test(evidence))return null;
  if(basis==='total'&&!/总计|总价|总共|合计|套餐|双人|两人|人餐|total/i.test(evidence))return null;
  if(basis==='per_item'&&!/每份|每件|每次|\/份|\/件|\/次|一份|per item/i.test(evidence))return null;
  let coversPeople=null;
  if(basis==='total'&&Number.isInteger(raw.coversPeople)&&raw.coversPeople>0&&raw.coversPeople<=99){
    const words={1:'一',2:'二|两|双',3:'三',4:'四',5:'五',6:'六',7:'七',8:'八',9:'九',10:'十'};
    const token=words[raw.coversPeople];
    if(new RegExp(`(?:${raw.coversPeople}${token?'|'+token:''})\\s*(?:人|位)`).test(evidence))coversPeople=raw.coversPeople;
  }
  return {amount,currency,basis,evidence,coversPeople};
}
function compareBudget(price,needs={}){
  const unknown={status:'unknown',estimate:null,currency:price?.currency||null,calculation:''};
  if(!price||typeof needs.budgetAmount!=='number'||price.currency!==needs.budgetCurrency)return unknown;
  let estimate=null,calculation='';
  if(needs.budgetScope==='total'){
    if(price.basis==='per_person'&&needs.people){estimate=price.amount*needs.people;calculation=`${price.amount} × ${needs.people} people`;}
    else if(price.basis==='total'&&(!needs.people||needs.people===1||price.coversPeople===needs.people)){estimate=price.amount;calculation="Reference total from the source";}
  }else if(needs.budgetScope==='per_person'){
    if(price.basis==='per_person'){estimate=price.amount;calculation="Reference price per person";}
    else if(price.basis==='total'&&price.coversPeople){estimate=price.amount/price.coversPeople;calculation=`${price.amount} ÷ ${price.coversPeople} people`;}
  }else if(needs.budgetScope==='per_item'&&price.basis==='per_item'){estimate=price.amount;calculation="Reference price per item";}
  if(estimate===null)return unknown;
  estimate=Math.round(estimate*100)/100;
  return {status:estimate>needs.budgetAmount?'over':'reference_within',estimate,currency:price.currency,calculation};
}
function enrichOffer(pick,source,needs={}){
  const haystack=`${source.title||''} ${source.summary||''}`;
  const candidate=short(pick.entityName,80),entityName=contains(haystack,candidate)?candidate:null;
  const area=short(pick.locationText,120),locationText=contains(haystack,area)?area:null;
  const category=['restaurant','course','activity','product','recipe'].includes(pick.category)?pick.category:'other';
  const price=referencePrice(pick.price,source),budget=compareBudget(price,needs);
  if(budget.status==='over'||pick.budgetFit==='over')return null;
  let reason=short(pick.reason,240);
  if(budget.status==='unknown'&&/符合.*预算|预算内|不超.*预算|满足.*预算|within (?:your |the )?budget|fits.*budget|under.*budget|meets.*budget/i.test(reason))reason="This source may be worth reviewing. The budget still needs checking.";
  const actions=[{kind:'source',label:"View source",url:source.url}];
  if(entityName&&['restaurant','activity'].includes(category)){
    const params=new URLSearchParams({keyword:`${needs.location||''} ${entityName}`.trim(),view:'list',src:'momo',callnative:'0'});
    actions.push({kind:'map',label:"Find on map",url:'https://uri.amap.com/search?'+params.toString()});
  }
  const next={
    restaurant:[['menu',"Check menu and current prices"],['checklist',"Plan a meal"]],
    course:[['availability',"Check trial and booking details"],['checklist',"Prepare trial questions"]],
    activity:[['availability',"Check hours and booking details"],['checklist',"Plan the visit"]],
    product:[['availability',"Check details and current prices"],['checklist',"Check before buying"]],
    recipe:[['checklist',"Ingredients and cooking steps"]],
    other:[['checklist',"Plan the next step"]]
  }[category];
  for(const [kind,label] of next)actions.push({kind,label});
  return {...source,entityName,locationText,category,price,budget,reason,caution:short(pick.caution,300),budgetFit:budget.status==='reference_within'?'within':'unknown',matchType:'ranked',actions};
}
module.exports={referencePrice,compareBudget,enrichOffer};
