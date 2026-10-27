/* Shared, pure need formatting used by the UI and backend. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MOMO_NEEDS=api;})(typeof window==='undefined'?{}:window,()=>{
  const text=(value,max=300)=>typeof value==='string'?value.trim().slice(0,max):'';
  function normalize(n={}){
    return {
      goal:text(n.goal),
      people:Number.isInteger(n.people)&&n.people>0&&n.people<=99?n.people:null,
      location:text(n.location,120)||null,
      budgetAmount:typeof n.budgetAmount==='number'&&Number.isFinite(n.budgetAmount)&&n.budgetAmount>=0?n.budgetAmount:null,
      budgetCurrency:typeof n.budgetCurrency==='string'&&/^[A-Z]{3}$/.test(n.budgetCurrency)?n.budgetCurrency:null,
      budgetScope:['total','per_person','per_item'].includes(n.budgetScope)?n.budgetScope:null,
      schedule:text(n.schedule,160)||"Not set",
      preferences:Array.isArray(n.preferences)?n.preferences.filter(x=>typeof x==='string').map(x=>text(x,80)).filter(x=>x&&!/^(?:[一二两三四五六七八九十\d]+(?:个人|人|位)(?:用餐|就餐)?|\d+\s*(?:people|persons?|guests?))$/i.test(x)).slice(0,6):[]
    };
  }
  const scope=s=>({total:"Total budget",per_person:"Per-person budget",per_item:"Per-item budget"}[s]||"Budget (scope not set)");
  const budget=n=>n.budgetAmount===null?"No budget set":`${scope(n.budgetScope)} ${n.budgetCurrency||"Currency not set"} ${n.budgetAmount}`;
  function changes(previous,next){
    if(!previous)return [];
    const a=normalize(previous),b=normalize(next),items=[];
    if(a.people!==b.people)items.push(b.people?`Group size changed to ${b.people} people`:"Group size not set");
    if(a.location!==b.location)items.push(b.location?`Location changed to ${b.location}`:"Any location");
    if(a.budgetAmount!==b.budgetAmount||a.budgetCurrency!==b.budgetCurrency||a.budgetScope!==b.budgetScope)items.push(budget(b));
    if(a.schedule!==b.schedule)items.push(`Timing: ${b.schedule}`);
    if(JSON.stringify(a.preferences)!==JSON.stringify(b.preferences))items.push(b.preferences.length?`Preferences: ${b.preferences.join(", ")}`:"Extra preferences cleared");
    if(!items.length&&a.goal!==b.goal)items.push("Goal description updated");
    return items;
  }
  return {normalize,budget,scope,changes};
});
