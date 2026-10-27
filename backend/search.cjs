'use strict';
const {enrichOffer}=require('./evidence.cjs');
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function publicUrl(value){
  try{
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
    const host=u.hostname.toLowerCase();
    if(!host.includes('.')||host==='localhost'||host.endsWith('.local')||host.endsWith('.localhost')||host.endsWith('.internal')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':'))return null;
    return u.href;
  }catch{return null;}
}
async function searchWeb({apiKey,query,fetchImpl=fetch,signal}){
  try{
    const response=await fetchImpl('https://api.deepseek.com/v1/tools/search',{
      method:'POST',signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({query:Array.from(query).slice(0,128).join(''),count:6,need_content:false})
    });
    if(!response.ok)return {status:'failed',query,results:[],notice:response.status===402?"Insufficient balance for web search. Planning suggestions are still available.":response.status===429?"Too many web search requests. Please try again shortly.":"Web search could not connect. No searched resources are available yet."};
    const data=await response.json();
    if(!Array.isArray(data.results))throw Error('invalid search response');
    const seen=new Set(),results=[];
    for(const item of data.results){
      if(!item||typeof item!=='object')continue;
      const url=publicUrl(item.url),title=clean(item.title,180);
      if(!url||!title||seen.has(url))continue;
      seen.add(url);
      results.push({id:`s${results.length+1}`,title,url,site:new URL(url).hostname,summary:clean(item.summary||item.snippet,1600).replace(/^#{1,6}\s+/gm,'').replace(/\s+/g,' '),publishedAt:typeof item.date==='string'&&Number.isFinite(Date.parse(item.date))?item.date:null});
      if(results.length===6)break;
    }
    return {status:results.length?'succeeded':'empty',query,results,retrievedAt:new Date().toISOString(),notice:results.length?'':"No usable results were found. Try another area or more specific keywords."};
  }catch{
    return {status:'failed',query,results:[],notice:"Web search did not finish. Please try again."};
  }
}
function groundedOffers(rawOffers,search,needs={}){
  if(search.status!=='succeeded')return [];
  const seen=new Set();
  const ranked=Array.isArray(rawOffers);
  const picks=ranked?rawOffers:[];
  const offers=[];
  for(const pick of picks){
    const source=search.results.find(s=>s.id===pick?.sourceId);
    if(!source||seen.has(source.id)||pick.budgetFit==='over')continue;
    const enriched=enrichOffer(pick,source,needs);
    if(!enriched)continue;
    seen.add(source.id);
    offers.push(enriched);
    if(offers.length===3)break;
  }
  // A missing model ranking still exposes actual search results, clearly labelled as leads.
  if(!ranked)return search.results.slice(0,3).map(s=>({...enrichOffer({},s,needs),caution:"This source has not been compared yet. Check whether it fits.",matchType:'lead'}));
  return offers;
}
module.exports={searchWeb,groundedOffers,publicUrl};
