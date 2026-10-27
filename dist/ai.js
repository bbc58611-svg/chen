/* Real AI mode. Keys are never read by the browser; /api/chat is same-origin. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const D=window.MOMO_DECISIONS,N=window.MOMO_NEEDS;
  let changes=[],checkedItems=new Set(),draftText='',editorSnapshot=null,requestOverride=null,requestRefresh=false;
  const catalog=[...window.MOMO_DEMO_DATA.tutors,...window.MOMO_DEMO_DATA.gifts];
  let mode='ai',config=null,connection='checking',turns=[],result=null,pending=false,error='',controller=null,version=0,suspended=false;
  const bar=document.createElement('section');bar.className='ai-connection';bar.setAttribute('aria-label',"AI connection and mode");
  $('.topbar').after(bar);
  function status(){
    const labels={checking:"Checking the local AI service…",ready:"DeepSeek configured · Send a message to connect",connected:"DeepSeek connected · Live AI conversation",missing:"DeepSeek is not configured",offline:"The AI backend is not running here",error:"AI connection unavailable"};
    bar.innerHTML=`<div><span class="ai-status-dot ${connection==='connected'?'connected':''}"></span><strong>${mode==='demo'?"Exploring the guided demo":labels[connection]}</strong><span class="ai-boundary">${mode==='demo'?"Guided demo · Fictional test catalog":`AI planning · Web search · ${config?.paymentMode==='sandbox'?"PayPal Sandbox configured":"PayPal Sandbox not configured"}`}</span></div><div class="ai-mode-actions"><button id="sandboxCatalogButton" class="sandbox-test-entry">Sandbox checkout</button><button id="aiModeButton" aria-pressed="${mode==='ai'}">${mode==='ai'?"Try guided demo":"Switch to AI chat"}</button><button id="aiCheckButton">Check connection</button></div>${mode==='ai'&&['missing','offline'].includes(connection)?"<details class=\"ai-setup\"><summary>AI connection help</summary><p>DeepSeek is unavailable. The website owner can check the backend credentials and connection using the setup guide. You can keep exploring the guided demo.</p></details>":''}`;
  }
  async function check(){
    connection='checking';status();
    if(!['http:','https:'].includes(location.protocol)){connection='offline';status();return;}
    try{const response=await fetch('/api/config',{signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(data.provider!=='deepseek')throw Error();config=data;connection=data.configured?'ready':'missing';}
    catch{config=null;connection='offline';}status();
  }
  function mascot(state,text){$('#mascotStage').dataset.state=state;$('#mascotCaption').textContent=text;}
  function aiShell(){
    suspended=false;document.body.classList.add('has-story','has-dialogue-composer','ai-active');document.body.classList.remove('has-micro-flow');
    $('#initialNote').hidden=true;$('#promptChips').hidden=true;
    $('.wish-box-title').innerHTML="<span>✧</span> Keep exploring with Momo";
    $('#wishInput').placeholder="Add a detail, or tell Momo what does not feel right…";
    $('#composerHint').textContent="Your conversation and search queries go to DeepSeek. Checkout uses PayPal Sandbox.";
    $('#wishForm .send-btn span').textContent=pending?"Thinking…":"Tell Momo";
    $('#wishForm .send-btn').disabled=pending;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id==='exploreNav'));
  }
  function reply(text){return `<div class="reply"><span class="reply-avatar" aria-hidden="true">ᴗ</span><div class="reply-content"><div class="reply-label">MOMO · DEEPSEEK</div><p class="ai-text">${e(text)}</p></div></div>`;}
  function render(){
    if(mode!=='ai'||suspended)return;
    aiShell();
    const history=D.conversation(turns);
    let content='';
    if(pending)content="<div class=\"ai-wait\" role=\"status\"><span class=\"loader\"></span><div><strong>Momo is putting things together…</strong><p>Keeping your preferences and comparing supported options.</p></div><button data-ai-cancel>Stop</button></div>";
    else if(error)content=`<section class="ai-error" role="alert"><strong>Momo could not finish this reply</strong><p>${e(error)}</p><button class="primary-button" data-ai-retry>Retry this message ↗</button><button class="text-button" data-ai-demo>Try the guided demo</button></section>`;
    else if(result){
      const ready=result.checkout?.status==='available'&&result.checkout.items?.length;
      let supporting='';
      if(ready)content+=D.checkout(result.checkout,catalog);
      if(result.question)supporting+=`<section class="ai-question"><span>One quick question</span><h2>${e(result.question)}</h2></section>`;
      supporting+=D.draft(result.draft,draftText)+D.checklist(result.checklist,checkedItems)+D.resources(result);
      const alternative=D.paths(result.paths);
      if(alternative){
        supporting+=(result.offers?.length||result.draft||result.checklist||result.question||ready)?`<details class="alternative-paths"><summary>Explore other paths and next steps</summary>${alternative}</details>`:"<div class=\"results-head\"><div><h2>Here are a few ways to begin.</h2></div></div>"+alternative;
      }
      content+=ready&&supporting?`<details class="checkout-supporting"><summary>Review web sources and other ways to begin</summary>${supporting}</details>`:supporting;
      if(!ready&&result.recommendations.length)content+=`<section class="sandbox-recommendations"><div class="results-head"><div><h2>Sandbox options</h2><p>Fictional test catalog · Continue to PayPal Sandbox after choosing</p></div></div><div class="cards">${result.recommendations.map((r,i)=>{const item=catalog.find(x=>x.id===r.id);return window.MOMO_DEMO_UI.card(item,i);}).join('')}</div></section>`;
      if(!ready&&!result.question&&(result.checkout?.category||result.offers?.length||result.draft||result.checklist||result.paths.some(path=>['goods','service'].includes(path.kind))))content+=D.checkout(result.checkout,catalog);
      if(!ready&&!result.checklist)content+=`<div class="ai-suggestions">${result.suggestions.map((s,i)=>`<button class="choice-button" data-ai-suggestion="${i}">${e(s)} ↗</button>`).join('')}</div>`;
      if(result.search?.status==='succeeded')content+="<p class=\"result-footnote\">Sources may be outdated. Opening a map or source does not place an order. Check current prices, hours and availability with the provider.</p>";
    }
    $('#journey').innerHTML=(result?D.needbar(result.needs,pending?[]:changes,pending):'')+history+content;
  }
  function halt(){version++;controller?.abort();controller=null;pending=false;$('#wishForm .send-btn').disabled=false;}
  function clear(){
    halt();turns=[];result=null;error='';suspended=false;changes=[];checkedItems.clear();draftText='';requestOverride=null;document.body.classList.remove('ai-active');window.MOMO_DEMO_UI.reset();
    $('#composerHint').textContent="Share any wish. Momo will help you find a way forward.";
  }
  function switchMode(){
    halt();mode=mode==='ai'?'demo':'ai';document.body.classList.remove('ai-active');window.MOMO_DEMO_UI.reset();suspended=false;
    if(mode==='ai'&&turns.length){if(turns.at(-1).role==='user')error="The last reply was stopped. You can retry it.";render();}status();
  }
  async function send(text,retry=false,needsOverride=null){
    if(pending)return;
    text=text.trim();if(!text)return;
    if(!retry){
      requestRefresh=!!needsOverride&&result?.search?.status==='succeeded';
      requestOverride=needsOverride;
      if(turns.at(-1)?.role==='user')turns.pop();
      if(turns.length>=22){error="This conversation has reached its limit. Start a new wish to continue.";render();return;}
      turns.push({role:'user',content:text,display:text.startsWith("I have submitted my choices,")?"I chose: "+D.selectedItems(result?.checklist,checkedItems).join('；'):text});$('#wishInput').value='';
    }
    pending=true;error='';changes=[];controller=new AbortController();const run=++version;
    render();mascot('thinking',"Momo is finding a way that fits you");
    if(matchMedia('(max-width:680px)').matches)$('#journey').scrollIntoView({behavior:'smooth',block:'end'});
    try{
      if(!['http:','https:'].includes(location.protocol))throw Error("Run node server.cjs and open Momo through the local HTTP address.");
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({messages:turns.map(({role,content})=>({role,content})),...(requestOverride?{needsOverride:requestOverride,refreshResources:requestRefresh}:{})})});
      const type=response.headers.get('content-type')||'';
      if(!type.includes('application/json'))throw Error("This address is not running the AI backend. Start node server.cjs locally and configure the key in .env.");
      const data=await response.json();
      if(!response.ok)throw Error(data.error?.message||"No reply received. Please try again.");
      if(data.provider!=='deepseek'||!data.needs||!Array.isArray(data.paths)||!Array.isArray(data.recommendations))throw Error("The AI returned an incomplete plan. Please try again.");
      if(run!==version)return;
      changes=N.changes(result?.needs,data.needs);checkedItems.clear();
      result=data;draftText=data.draft?.body||'';turns.push({role:'assistant',content:D.context(data),display:data.reply});
      connection='connected';mascot('found',"All set. Which path feels right for you?");
    }catch(err){if(run!==version)return;error=err.name==='AbortError'?"Stopped waiting. You can try again.":err.message;mascot('listen',"Your wish is still right here");}
    finally{if(run===version){pending=false;controller=null;render();status();if(!error&&result?.checkout?.status==='available')$('#journey .checkout-decision')?.scrollIntoView({behavior:'smooth',block:'start'});}}
  }
  document.addEventListener('submit',event=>{
    if(mode==='ai'&&event.target.id==='aiNeedsForm'){
      event.preventDefault();event.stopImmediatePropagation();
      const patch=D.readPatch(editorSnapshot);
      $('#aiNeedsEditor').close();
      if(Object.keys(patch).length){
        const descriptions=N.changes(editorSnapshot,{...editorSnapshot,...patch});
        const pinned={...editorSnapshot,...patch};
        if(!Object.hasOwn(patch,'goal'))delete pinned.goal;
        send("Update my needs:"+(descriptions.join(", ")||patch.goal)+". Search again with these changes and keep my other preferences.",false,pinned);
      }
      return;
    }
    if(mode==='ai'&&event.target.id==='wishForm'){event.preventDefault();event.stopImmediatePropagation();const value=$('#wishInput').value.trim();if(value)send(value);}
  },true);
  document.addEventListener('click',event=>{
    const b=event.target.closest('button,a');if(!b)return;
    const handle=fn=>{event.preventDefault();event.stopImmediatePropagation();fn();};
    if(b.id==='aiModeButton'||b.hasAttribute('data-ai-demo'))return handle(switchMode);
    if(b.id==='aiCheckButton')return handle(check);
    if(b.hasAttribute('data-checkout-demo'))return handle(()=>window.MOMO_DEMO_UI.sandboxCatalog());
    if(b.hasAttribute('data-close-needs'))return handle(()=>$('#aiNeedsEditor').close());
    if(mode!=='ai')return;
    if(b.hasAttribute('data-checkout-choice')&&result&&!pending)return handle(()=>{
      const choice=result.checkout?.items?.find(item=>item.id===b.dataset.checkoutChoice);
      if(choice)window.MOMO_DEMO_UI.openAIItem(choice.id,result.needs,choice.options);
    });
    if(b.hasAttribute('data-ai-edit-needs')&&result&&!pending)return handle(()=>{editorSnapshot=N.normalize(result.needs);D.editor(editorSnapshot);});
    if(b.hasAttribute('data-option-action'))return handle(()=>{
      const [index,kind]=b.dataset.optionAction.split(':');
      const item=result?.offers?.[Number(index)];if(item)send(D.actionText(item,kind));
    });
    if(b.hasAttribute('data-submit-selection')&&result?.checklist)return handle(()=>{
      if(pending)return;
      const text=D.selectionText(result.checklist,checkedItems);if(text)send(text);
    });
    if(b.hasAttribute('data-copy-draft')&&result?.draft)return handle(async()=>{
      const text=$('#messageDraft')?.value??draftText;
      try{await navigator.clipboard.writeText(text);b.textContent="Copied ✓";}catch{$('#messageDraft').focus();$('#messageDraft').select();b.textContent="Text selected. Copy it to continue.";}
    });
    if(b.hasAttribute('data-start'))return handle(()=>{clear();send(window.MOMO_DEMO_DATA.texts[b.dataset.start]);});
    if(b.id==='newWish'||b.classList.contains('brand'))return handle(clear);
    if(b.hasAttribute('data-ai-retry'))return handle(()=>send(turns.at(-1)?.content||'',true));
    if(b.hasAttribute('data-ai-cancel'))return handle(()=>{halt();error="Stopped waiting. Retry or try a different wording.";render();mascot('listen',"Take your time. Momo is here.");});
    if(b.hasAttribute('data-ai-suggestion'))return handle(()=>send(result.suggestions[Number(b.dataset.aiSuggestion)]));
    if(b.hasAttribute('data-ai-path'))return handle(()=>send(`I would like to continue with "${result.paths[Number(b.dataset.aiPath)].title}". Help me work out the next step.`));
    if(b.hasAttribute('data-ai-resource'))return handle(()=>{const item=result.offers[Number(b.dataset.aiResource)];send(`Help me compare this source:${item.title}(${item.url}). Does it fit my earlier needs, and what still needs checking?`);});
    if(b.hasAttribute('data-detail')&&result&&!suspended)return handle(()=>window.MOMO_DEMO_UI.openAIItem(b.dataset.detail,result.needs));
    if(b.id==='exploreNav'&&turns.length)return handle(()=>{if(pending){halt();error="The last reply was stopped. You can retry it.";}suspended=false;render();});
    if(b.id==='continueSearchBtn'&&turns.length)return handle(()=>{$('#checkoutDialog').close();suspended=false;render();$('#wishInput').focus();});
    if(['favoritesNav','ordersNav','viewOrderBtn'].includes(b.id)){
      if(pending){halt();error="The last reply was stopped. You can retry it.";}suspended=true;document.body.classList.remove('ai-active');
    }
  },true);
  $('footer>span:nth-child(2)').textContent="AI and web search · PayPal Sandbox";
  $('#infoDialog p:last-of-type').textContent="AI chat uses the backend to connect to DeepSeek and search the web. Resource cards link to their sources. The guided demo uses fictional people, products and time slots. Web search does not confirm live availability. Only the test catalog supports PayPal Sandbox; Momo does not collect payments or make bookings for third-party search results.";
  document.addEventListener('change',event=>{
    if(mode!=='ai'||!result?.checklist||pending||!event.target.matches('[data-check-item]'))return;
    const index=Number(event.target.dataset.checkItem);if(event.target.checked)checkedItems.add(index);else checkedItems.delete(index);
    const count=D.selectedItems(result.checklist,checkedItems).length;
    const button=$('[data-submit-selection]');if(button){button.disabled=!count;button.textContent=`Submit choices${count?` (${count})`:''} ↗`;}
    const label=$('[data-selection-count]');if(label)label.textContent=count?`Selected ${count} ${count===1?"item":"items"}`:"Select what you want to keep. You can choose more than one.";
  });
  document.addEventListener('input',event=>{if(event.target.id==='messageDraft'){draftText=event.target.value;const b=$('[data-copy-draft]');if(b){b.textContent="Copy message ↗";b.disabled=!draftText.trim();}}});
  check();
})();



