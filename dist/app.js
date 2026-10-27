(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be disabled. */ } };
  let favorites = read('momo-favorites-v1', []), orders = read('momo-orders-v1', []);
  if (!Array.isArray(favorites)) favorites = [];
  if (!Array.isArray(orders)) orders = [];
  let scene = null, stage = 'idle', requestId = 0, filter = 'all', rotation = 0, selected = null;
  let goal = '', context = '', currentCards = [], refinements = [], searchRound = 0;
  let preferences = {maxPrice:null,patient:false,weekend:false,type:null};
  const { tutors, gifts, texts } = window.MOMO_DEMO_DATA;
  const all = [...tutors, ...gifts];
  const experience = window.MOMO_EXPERIENCE;
  let microDraft = {answer:'',feeling:''}, needsCard = null, selectedPath = null, practiceText = '';
  function setMomo(state, caption) { $('#mascotStage').dataset.state = state; $('#mascotCaption').textContent = caption; }
  function counts(){ $('#favoriteCount').textContent=favorites.length; $('#orderCount').textContent=orders.length; }
  function toast(message){ $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),2600); }
  function activate(id){ document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.id===id)); }
  function userMessage(text){ return `<div class="user-message"><div>${escape(text)}</div></div>`; }
  function reply(text, contents=''){ return `<div class="reply"><span class="reply-avatar" aria-hidden="true">ᴗ</span><div class="reply-content"><div class="reply-label">MOMO · YOUR LITTLE WISH COMPANION</div><p>${text}</p>${contents}</div></div>`; }
  function choices(items){ return `<div class="choice-row">${items.map(([label,value])=>`<button class="choice-button" data-choice="${value}">${escape(label)} ↗</button>`).join('')}</div>`; }
  function baseStory(){ $('body').classList.remove('has-micro-flow'); $('body').classList.add('has-story'); $('#initialNote').hidden=true; activate('exploreNav'); syncComposer(); }
  function scrollToJourney(){ if (matchMedia('(max-width:680px)').matches) $('#journey').scrollIntoView({behavior:'smooth',block:'start'}); }
  function start(kind, text) {
    requestId++; scene=kind; filter='all'; rotation=0; context=''; refinements=[]; searchRound=0;
    preferences={maxPrice:null,patient:false,weekend:false,type:null};
    microDraft={answer:'',feeling:''};
    needsCard=null; selectedPath=null; practiceText=''; goal=text||texts[kind];
    $('#wishInput').value='';
    $('#wishInput').placeholder="You can also share your budget, timing or a small preference…";
    updatePreferences(goal);
    needsCard={focus:goal,budget:preferences.maxPrice===null?'none':String(preferences.maxPrice),schedule:preferences.weekend?'weekend':'flexible'};
    showEntry();
  }
  function syncComposer() {
    const active=!!scene&&['entry','results','searching'].includes(stage);
    $('body').classList.toggle('has-dialogue-composer',active);
    $('.wish-box-title').innerHTML=active?"<span>✧</span> Keep exploring with Momo":"<span>✧</span> What would you like to make a little better today?";
    $('#composerHint').textContent=active?"Your preferences stay with you. Choose a plan, then review it.":"A little thought is enough to begin.";
    $('#wishForm .send-btn span').textContent=active?"Keep looking":"Let Momo explore";
    $('#wishInput').placeholder=active?"Add a budget, a time, or what you would like to change…":"For example: I want to learn English, but I feel shy speaking…";
    $('#promptChips').hidden=active;
  }
  function showEntry() {
    requestId++;stage='entry';baseStory();syncComposer();
    setMomo('listen',"Start your way: explore now or try one small step");
    const tags=preferenceTags();
    $('#journey').innerHTML=userMessage(goal)+reply(scene==='gift'?"Let's find a thoughtful way to reconnect. Compare gifts and shared experiences, or start with what you want to say.":"Let's find a learning start that fits you. Browse tutors, or try a free phrase to discover what you need.")+
      `<section class="entry-panel"><span class="experience-badge">Choose a comfortable beginning</span><h2>Explore now, or try a little first?</h2>${tags.length?`<p class="entry-known">Remembered: ${tags.map(escape).join(' · ')}</p>`:''}<div class="entry-options"><button class="entry-option primary-entry" data-direct-results><b>⌕</b><strong>See options now ↗</strong><span>Use your current needs to compare a few possibilities</span></button><button class="entry-option" data-try-first><b>✧</b><strong>Try a small step</strong><span>About one minute, free, and easy to skip</span></button></div><button class="text-button" data-edit-needs>Adjust my needs and budget first ↗</button><p class="experience-disclosure">Guided demo: people, products and recommendations are fictional examples.</p></section>`;
    scrollToJourney();
  }
  function directResults() {
    selectedPath=null;search("Compare options using the needs I already shared");
  }
  function experienceBase(nextStage) {
    requestId++; stage=nextStage; baseStory(); $('body').classList.add('has-micro-flow');
  }
  function showMicro() {
    experienceBase('experience');
    setMomo('listen',scene==='gift'?"Try one sentence. Momo is listening.":"One sentence is enough to start");
    $('#journey').innerHTML=userMessage(goal)+experience.micro(scene,microDraft);
    scrollToJourney();
  }
  function showNeeds() {
    experienceBase('needs');
    if(!needsCard)needsCard=experience.initialNeeds(scene,microDraft);
    setMomo('thinking',"You can edit this wish card any time");
    $('#journey').innerHTML=experience.needs(scene,microDraft,needsCard);
    scrollToJourney();
  }
  function showPaths() {
    if(!needsCard){showNeeds();return;}
    experienceBase('paths');
    setMomo('found',"One wish, a few different paths");
    $('#journey').innerHTML=experience.paths(scene,needsCard);
    scrollToJourney();
  }
  function applyNeedPreferences() {
    if(!needsCard)return;
    preferences.maxPrice=needsCard.budget==='none'?null:Number(needsCard.budget);
    preferences.weekend=needsCard.schedule==='weekend';
    preferences.patient=/耐心|温柔|慢慢|轻巧|patient|gentle|slow|light|beginner/i.test(needsCard.focus);
  }
  function selectPath(pathId) {
    if(!experience.pathData(scene).some(p=>p.id===pathId))return;
    if(pathId!=='free'&&needsCard?.budget==='0'){
      toast("You chose a free start. Edit your needs before exploring paid options.");return;
    }
    selectedPath=pathId; applyNeedPreferences();
    if(pathId==='free'){showActivity();return;}
    preferences.type=scene==='gift'?(pathId==='goods'?'goods':'service'):null;
    filter=pathId==='partner'?'patient':'all';
    search(scene==='gift'?(pathId==='goods'?"Follow this path and show physical gifts only":"Follow this path and show shared experiences only"):(pathId==='partner'?"Find a patient speaking partner":"Find a tutor who practices everyday situations"));
  }
  function showActivity() {
    experienceBase('practice');
    setMomo('listen',scene==='gift'?"Take your time. Let the words sound like you.":"A little practice is enough for today");
    $('#journey').innerHTML=experience.activity(scene,microDraft,needsCard,practiceText);
    scrollToJourney();
  }
  function experienceSummary() {
    return needsCard?(selectedPath?experience.progress(3):"<div class=\"direct-mode-note\">⌕ Compare options now · You can try the exercise later</div>")+experience.summary(scene,needsCard,selectedPath):'';
  }
  function refineText(value){ return {small:"A small, thoughtful gift that feels easy to receive",together:"Do something together and make room to talk",budget:"Keep the budget light and show affordable options",beginner:"I am a beginner and want a relaxed start",patient:"I feel shy and would like a patient partner"}[value] || value; }
  function preferenceTags(){return [preferences.maxPrice!==null?`Up to $${preferences.maxPrice}`:null,preferences.patient?(scene==='gift'?"A small gesture":"Patient guidance"):null,preferences.weekend?"Weekend availability":null,preferences.type==='service'?"Shared experiences only":preferences.type==='goods'?"Physical gifts only":null].filter(Boolean);}
  function updatePreferences(text){
    if(/清除|重置|重新开始|不限制|(?:clear|reset).*(?:preferences|filters)|start over|no restrictions/i.test(text)){preferences={maxPrice:null,patient:false,weekend:false,type:null};filter='all';rotation=0;return;}
    const amount=text.match(/\$\s*(\d+(?:\.\d+)?)/)||text.match(/(\d+(?:\.\d+)?)\s*(?:美元|美金|USD|刀|dollars?)/i);
    if(amount)preferences.maxPrice=Number(amount[1]);
    if(/不限预算|预算不限|提高预算|no budget limit|unlimited budget|increase.*budget/i.test(text)&&!amount)preferences.maxPrice=null;
    if(/不一定周末|不只看周末|取消周末限制|时间不限|not just weekends|any time|flexible timing|remove.*weekend/i.test(text))preferences.weekend=false;
    else if(/周末|周六|周日|weekend|saturday|sunday/i.test(text))preferences.weekend=true;
    if(/耐心|内向|温柔|害怕|轻巧|patient|shy|gentle|nervous|light/i.test(text))preferences.patient=true;
    if(scene==='gift'){
      if(/只看.*(?:服务|体验)|不要实物|一起体验|only.*(?:services|experiences)|shared experiences only|services only/i.test(text))preferences.type='service';
      if(/只看.*(?:实物|商品|礼物)|不要体验|only.*(?:physical|products|gifts)|physical gifts only|products only/i.test(text))preferences.type='goods';
      if(/商品和服务|都可以|both products and services|either is fine/i.test(text))preferences.type=null;
    }
    if(/budget|便宜|贵|预算|价格|省钱|cheap|expensive|affordable|price|cost/i.test(text))filter='budget';
    else if(/patient|内向|耐心|害怕|温柔|shy|nervous|gentle/i.test(text))filter='patient';
    else if(/together|一起|体验|shared experience/i.test(text))filter='experience';
    if(/换一组|换个|换种|其他|不喜欢|都不合适|another|different|other options|do not like|none fit/i.test(text))rotation++;
    else rotation=0;
  }
  function conversation(){return userMessage(goal)+refinements.map(userMessage).join('');}
  async function search(value){ context=refineText(value); refinements.push(context); searchRound++; updatePreferences(context); if(needsCard){needsCard.budget=preferences.maxPrice===null?'none':String(preferences.maxPrice);needsCard.schedule=preferences.weekend?'weekend':'flexible';} stage='searching'; const run=++requestId; baseStory(); setMomo('searching',searchRound>1?"A new idea! Momo is exploring again":"Momo is browsing the test catalog");
    const remembered=preferenceTags();
    $('#journey').innerHTML=conversation()+reply(`${searchRound>1?"Let's keep refining.":"Got it. I'll remember that."}${remembered.length?`Keeping these preferences: <strong>${remembered.map(escape).join(' · ')}</strong>.`:"Let's compare a few different possibilities."}Keep telling me what to change until you find an option you want to choose.`,`<div class="progress-card"><div class="progress-top"><span class="loader"></span><span id="progressText">Organizing your wish and preferences…</span></div><div class="progress-steps"><span id="step1">Understand your needs</span><span id="step2">Browse the test catalog</span><span id="step3">Compare options</span></div></div>`); scrollToJourney();
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    await wait(650); if(run!==requestId)return; $('#step1')?.classList.add('done'); $('#progressText').textContent=scene==='gift'?"Browsing fictional gifts and shared experiences…":"Comparing tutor prices, styles and test time slots…";
    await wait(700); if(run!==requestId)return; $('#step2')?.classList.add('done'); $('#progressText').textContent="Comparing the details and bringing back different options…";
    await wait(650); if(run!==requestId)return; stage='results'; renderResults(); setMomo(currentCards.length?'found':'thinking',currentCards.length?"A few possibilities! See what feels right.":"No match yet. Let's adjust the conditions together."); }
  function getCards(){ let list=(scene==='gift'?gifts:tutors.filter(t=>t.scene===scene)).slice(); if(preferences.maxPrice!==null)list=list.filter(i=>i.price<=preferences.maxPrice);if(preferences.weekend)list=list.filter(i=>i.slot&&/周六|周日|saturday|sunday/i.test(i.slot));if(preferences.type==='service')list=list.filter(i=>!!i.slot);if(preferences.type==='goods')list=list.filter(i=>!i.slot);if(filter==='budget') list.sort((a,b)=>a.price-b.price); else if(filter==='patient'||preferences.patient)list.sort((a,b)=>Number(b.patient)-Number(a.patient)); else if(filter==='experience')list.sort((a,b)=>Number(!!b.slot)-Number(!!a.slot)); if(scene!=='gift'&&selectedPath==='structured')list=list.filter(t=>t.tags.some(tag=>/结构|场景|发音|声调|structured|situations|pronunciation|tone/i.test(tag)));  if(rotation&&list.length){ const n=rotation%list.length; list=[...list.slice(n),...list.slice(0,n)]; } return list.slice(0,3); }
  function portrait(item){if(item.art) return `<div class="gift-art ${item.art}"><i class="tea-leaf"></i></div><span class="gift-spark">✧</span>`;return `<div class="teacher-portrait ${item.portrait}"><i class="hair"></i><i class="head"></i><i class="fringe"></i><i class="neck"></i><i class="shirt"></i><i class="face-eyes"></i><i class="face-smile"></i></div><span class="portrait-spark">✧</span><span class="portrait-note">say hello :)</span>`; }
  function card(item,index=0){
    const saved=favorites.includes(item.id), info=window.MOMO_COMPARISONS[item.id];
    return `<article class="result-card" style="animation-delay:${index*65}ms"><div class="card-visual ${item.color}"><span class="visual-tag">${info.label}</span>${portrait(item)}<button class="save-btn ${saved?'saved':''}" data-save="${item.id}" aria-label="${saved?"Unsave":"Save"} ${escape(item.name)}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><div class="card-body"><div class="card-kicker">${item.kicker}</div><h3>${item.name}</h3><p class="card-description">${item.desc}</p><div class="comparison-facts"><p><span>Best for</span>${info.fit}</p><p><span>You get</span>${info.deliver}</p><p class="tradeoff"><span>Keep in mind</span>${info.limit}</p></div><div class="availability">◷ ${item.slot?"Test time · "+item.slot+" (UTC+8)":"Physical item · Delivery time not provided"}</div><div class="card-bottom"><span class="price">$${item.price}<small>${item.unit}</small></span><button class="card-action" data-detail="${item.id}">Review option ↗</button></div></div></article>`;
  }
  function feedbackBox(){
    const suggestions=scene==='gift'?["Too expensive. Show cheaper options.","Physical gifts only","Show another set of options"]:["Too expensive. Show cheaper options.","Weekend options only","Show another set of options"];
    return `<section class="refinement-shortcuts" aria-label="Refine these options"><div><strong>Still looking for the right fit?</strong><span>Tell Momo below, or choose a suggestion.</span></div><div class="feedback-suggestions">${suggestions.map(t=>`<button data-refine="${escape(t)}">${escape(t)} ↗</button>`).join('')}<button data-refine="Clear my preferences and start again">Reset preferences</button><button data-path="free">Try a free path first ↗</button></div></section>`;
  }
  function renderResults(){$('body').classList.remove('has-micro-flow');syncComposer();currentCards=getCards(); const gift=scene==='gift';const tags=preferenceTags(); const intro=currentCards.length?(searchRound>1?"Another round, with your new ideas.<strong>Keep refining. You decide when to choose.</strong>":gift?"A few different possibilities to explore.<strong>Tell me what to change. Choose when it feels right.</strong>":"A few learning partners with different styles.<strong>See what fits. You can always ask me to keep looking.</strong>"):"The test catalog has no match for these conditions yet.<strong>Adjust your budget or timing if you wish. I will keep your current limits until you change them.</strong>"; $('#journey').innerHTML=experienceSummary()+conversation()+reply(intro)+`<div class="results-head"><div><h2>${gift?"Find a thoughtful way to show you care.":"Find someone who will go at your pace."}</h2><p>${currentCards.length?`${currentCards.length} test options to explore.`:"No test options match your current needs."}</p></div><button class="subtle-btn" id="shuffleBtn">↻ Explore another set</button></div>${tags.length?`<div class="remembered-preferences"><span>Your preferences</span>${tags.map(t=>`<b>${escape(t)}</b>`).join('')}</div>`:''}<div class="filter-row"><button class="filter-btn ${filter==='all'?'selected':''}" data-filter="all">✧ See all options</button><button class="filter-btn ${filter==='budget'?'selected':''}" data-filter="budget">Keep it affordable</button><button class="filter-btn ${filter==='patient'?'selected':''}" data-filter="patient">${gift?"A lighter gesture":"Patient and beginner-friendly"}</button>${gift?`<button class="filter-btn ${filter==='experience'?'selected':''}" data-filter="experience">A shared experience</button>`:''}</div>${currentCards.length?`<div class="cards">${currentCards.map(card).join('')}</div>`:"<div class=\"empty-state\"><span>⌕</span><h2>A small adjustment, another possibility.</h2><p>Add a detail below, or reset your preferences.</p></div>"}${feedbackBox()}<div class="result-footnote">ⓘ Guided demo: feedback uses preset rules and a limited fictional catalog. It supports USD budgets, weekend slots, and product or service filters. Switch to AI chat for real analysis and web search.</div>${gift?"<div class=\"soft-tip\"><span>♡</span> A specific, sincere message can be a good beginning. A gift cannot guarantee reconciliation.</div>":''}`; }
  function onSubmit(event){event.preventDefault(); const text=$('#wishInput').value.trim(); if(!text){toast("Share a little of your wish first");$('#wishInput').focus();return;} $('#wishInput').value=''; const detected=/中文|汉语|chinese/i.test(text)?'chinese':/英语|英文|english/i.test(text)?'english':/朋友|和好|礼物|生日|道歉|gift|friend/i.test(text)?'gift':null; if(scene&&(stage==='entry'||stage==='clarify'||stage==='results'||stage==='searching')&&(!detected||detected===scene)){search(text);return;}if(detected){start(detected,text);return;}
    requestId++; baseStory(); stage='choose'; setMomo('thinking',"Momo would love to hear a little more"); $('#journey').innerHTML=userMessage(text)+reply("Your wish is here. This guided demo has <strong>language learning</strong> and <strong>thoughtful gifts</strong> to explore. Choose a path to begin.",`<div class="choice-row"><button class="choice-button" data-start="english">Find an English speaking partner ↗</button><button class="choice-button" data-start="chinese">Start learning Chinese ↗</button><button class="choice-button" data-start="gift">Find a thoughtful gesture ↗</button></div>`); scrollToJourney(); }
  function reset(){ microDraft={answer:'',feeling:''};needsCard=null;selectedPath=null;practiceText='';$('body').classList.remove('has-micro-flow'); requestId++;scene=null;stage='idle';goal='';context='';currentCards=[];refinements=[];searchRound=0;preferences={maxPrice:null,patient:false,weekend:false,type:null};$('body').classList.remove('has-story');syncComposer();$('#initialNote').hidden=false;$('#journey').innerHTML='';$('#wishInput').value='';$('#wishInput').placeholder="For example: I want to learn English, but I feel shy speaking…";activate('exploreNav');setMomo('idle',"Momo is waiting for your first little wish");window.scrollTo({top:0,behavior:'smooth'}); }
  function save(id){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write('momo-favorites-v1',favorites);counts();document.querySelectorAll(`[data-save="${id}"]`).forEach(b=>{const yes=favorites.includes(id);b.textContent=yes?'♥':'♡';b.classList.toggle('saved',yes);b.setAttribute('aria-pressed',yes);b.setAttribute('aria-label',`${yes?"Unsave":"Save"} ${all.find(i=>i.id===id)?.name||''}`);});if($('#favoritesNav').classList.contains('active'))showFavorites();else toast(favorites.includes(id)?"Saved for later. Come back whenever you like.":"Removed from your saved options");}
  function showFavorites(){requestId++;stage='favorites';baseStory();activate('favoritesNav');setMomo('idle',"Your favorite possibilities are right here");const list=all.filter(i=>favorites.includes(i.id));$('#journey').innerHTML=`<div class="results-head"><div><h2>Keep the possibilities you love.</h2><p>Saved in this browser, ready when you are.</p></div></div>`+(list.length?`<div class="cards">${list.map(card).join('')}</div>`:`<div class="empty-state"><span>♡</span><h2>Your little bag is empty for now.</h2><p>Tap the heart on an option to save it here.</p><button class="primary-button" data-start="english">Find a possibility ↗</button></div>`);scrollToJourney();}
  function showOrders(){
    requestId++;stage='orders';baseStory();activate('ordersNav');setMomo('happy',"Your little steps are all here");
    $('#journey').innerHTML="<div class=\"results-head\"><div><h2>Your wish moved a little closer.</h2><p>Sandbox payment history. No real booking, delivery or funds.</p></div></div>"+(orders.length?'<div class="receipt-list">'+orders.slice().reverse().map(o=>'<article class="receipt-card"><div><span class="card-kicker">'+escape(window.MOMO_DISPLAY.text(o.kind))+'</span><h3>'+escape(window.MOMO_DISPLAY.text(o.name))+'</h3><p>'+escape(window.MOMO_DISPLAY.text(o.option))+' · $'+Number(o.price).toFixed(2)+'</p><p class="receipt-id">'+escape(o.id)+'</p>'+(o.captureId?'<p class="receipt-id">Capture: '+escape(o.captureId)+'</p>':'')+'</div><span class="receipt-status">'+(o.environment==='sandbox'?"✓ Sandbox payment completed":"Legacy demo record")+'</span></article>').join('')+'</div>':"<div class=\"empty-state\"><h2>No payment records yet.</h2><p>No sandbox payment records yet.</p><button class=\"primary-button\" id=\"sandboxCatalogButton\">View sandbox catalog ↗</button></div>");scrollToJourney();
  }
  function sandboxCatalog(){
    $('#checkoutContent').innerHTML="<div class=\"eyebrow\">PAYPAL SANDBOX</div><h2>Choose a test item or service</h2><p class=\"dialog-note\">Fictional people, products, prices and time slots. This catalog tests sandbox payments only; nothing is booked or delivered.</p><div class=\"sandbox-catalog\">"+all.map(i=>'<button class="choice-button" data-detail="'+escape(i.id)+'">'+escape(i.name)+' · $'+i.price.toFixed(2)+' USD ↗</button>').join('')+'</div>';
    if(!$('#checkoutDialog').open)$('#checkoutDialog').showModal();
  }
  function sandboxComplete(value){
    const order={id:value.id,name:value.name,price:Number(value.amount),option:value.option,kind:value.itemId.startsWith('gift-')?"Test item or service":"Test lesson",captureId:value.captureId,environment:'sandbox',createdAt:value.createdAt};
    if(!orders.some(o=>o.id===order.id)){orders.push(order);write('momo-orders-v1',orders);}counts();setMomo('happy',"Your sandbox payment is complete");
    $('#checkoutContent').innerHTML="<div class=\"success-content\"><div class=\"success-icon\">✓</div><div class=\"eyebrow\">PAYPAL SANDBOX · COMPLETED</div><h2>Sandbox payment completed.</h2><p>Sandbox payment completed.</p><div class=\"checkout-summary\"><h3>"+escape(window.MOMO_DISPLAY.text(order.name))+'</h3><p>'+escape(window.MOMO_DISPLAY.text(order.option))+"</p><div class=\"checkout-row\"><span>Test amount</span><strong>$"+order.price.toFixed(2)+' USD</strong></div><p class="receipt-id">Order: '+escape(order.id)+'</p><p class="receipt-id">Capture: '+escape(order.captureId)+"</p></div><p class=\"dialog-note\">The backend verified the result with PayPal. Only sandbox funds were used; no real provider was paid and nothing was booked or delivered.<br>Verified by the backend. Sandbox funds only; no real booking or delivery.</p><button class=\"primary-button\" id=\"viewOrderBtn\">View payment record ↗</button></div>";
  }
  function detail(id){
    selected=all.find(i=>i.id===id);if(!selected)return;
    const item=selected,service=!!item.slot;
    $('#checkoutContent').innerHTML="<div class=\"eyebrow\">REVIEW SANDBOX CHECKOUT</div><h2>Review your test option.</h2><p class=\"dialog-note\">This is a fictional test option. PayPal processes sandbox funds only.</p><div class=\"checkout-summary\"><div class=\"card-kicker\">"+escape(item.kicker)+'</div><h3>'+escape(item.name)+'</h3><p>'+escape(item.desc)+"</p><div class=\"checkout-row\"><span>Test total</span><strong>$"+item.price.toFixed(2)+' USD</strong></div></div><div class="option-label">'+(service?"Test time (UTC+8)":"Test packaging")+'</div><div class="checkout-options">'+(service?[...new Set([item.slot,"Sunday 19:00",...(preferences.weekend?[]:["Next Tuesday 20:00"])])]:["Simple natural wrapping","Include a blank note card"]).map((v,i)=>'<button class="'+(i===0?'selected':'')+'" data-option="'+escape(v)+'">'+escape(v)+'</button>').join('')+"</div><section class=\"sandbox-checkout\" id=\"sandboxCheckout\"></section><button id=\"continueSearchBtn\" class=\"continue-search\">Keep exploring ↗</button>";
    if(!$('#checkoutDialog').open)$('#checkoutDialog').showModal();
    window.MOMO_PAYMENTS.mount($('#sandboxCheckout'),{item,getOption:()=>$('.checkout-options .selected')?.dataset.option||'',onComplete:sandboxComplete});
  }
  document.addEventListener('submit', event => {
    if(event.target.id==='microForm'){
      event.preventDefault();
      microDraft={answer:$('#microAnswer').value.trim(),feeling:$('#microFeeling').value};
      needsCard={...experience.initialNeeds(scene,microDraft),budget:needsCard?.budget||'none',schedule:needsCard?.schedule||'flexible'}; showNeeds();
    } else if(event.target.id==='needsForm'){
      event.preventDefault();
      const focus=$('#needFocus').value.trim();
      if(!focus){toast("Write one sentence about what you need");$('#needFocus').focus();return;}
      needsCard={focus,budget:$('#needBudget').value,schedule:$('#needSchedule').value};
      applyNeedPreferences(); showPaths();
    } else if(event.target.id==='freePracticeForm'){
      event.preventDefault();practiceText=$('#practiceDraft').value.trim();
      if(!practiceText){toast("Leave one sentence in your own voice first");$('#practiceDraft').focus();return;}
      experienceBase('completed');
      $('#journey').innerHTML=experience.completed(scene,needsCard,practiceText);
      setMomo('happy',"A free little step is worth celebrating too!");scrollToJourney();
    }
  });
  document.addEventListener('click', event => {
    const button=event.target.closest('button');if(!button)return;
    const handle=action=>{event.stopImmediatePropagation();action();};
    if(button.matches('[data-direct-results]'))handle(directResults);
    else if(button.matches('[data-try-first]'))handle(showMicro);
    else if(button.matches('[data-micro-example]'))handle(()=>{
      $('#microAnswer').value=experience.samples[scene];$('#microAnswer').focus();
      toast("This is a preset example. Make it your own.");
    });
    else if(button.matches('[data-skip-micro]'))handle(()=>{
      microDraft={answer:'',feeling:$('#microFeeling').value};
      showNeeds();
    });
    else if(button.matches('[data-retry-micro]'))handle(showMicro);
    else if(button.matches('[data-edit-needs]'))handle(showNeeds);
    else if(button.matches('[data-revisit-paths]'))handle(showPaths);
    else if(button.matches('[data-path]'))handle(()=>selectPath(button.dataset.path));
    else if(button.matches('[data-edit-practice]'))handle(showActivity);
    else if(button.id==='exploreNav'&&scene&&['experience','needs','paths','practice','completed'].includes(stage))handle(()=>{
      if(stage==='experience')showMicro();else if(stage==='needs')showNeeds();else if(stage==='practice'||stage==='completed')showActivity();else showPaths();
    });
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('[data-refine]') || button.id === 'shuffleBtn') {
      event.stopImmediatePropagation();
      search(button.dataset.refine || "Show another set of options");
    } else if (button.id === 'continueSearchBtn') {
      event.stopImmediatePropagation();
      $('#checkoutDialog').close();
      if (scene) {
        stage='results'; baseStory(); renderResults();
        setMomo('listen',"What would you like to change? I'll keep looking.");
        $('#wishInput').focus({preventScroll:true});
      } else toast("Start a little wish and let's explore together");
    }
  });
  $('#wishForm').addEventListener('submit',onSubmit);
  $('#wishInput').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('#wishForm').requestSubmit();}});
  $('#wishInput').addEventListener('focus',()=>{if(stage==='idle')setMomo('listen',"Momo is listening. Take your time.");});
  $('#wishInput').addEventListener('blur',()=>{if(stage==='idle')setMomo('idle',"Momo is waiting for your first little wish");});
  document.addEventListener('click',event=>{const el=event.target.closest('button,a');if(!el)return;if(el.matches('[data-start]'))start(el.dataset.start);else if(el.matches('[data-choice]'))search(el.dataset.choice);else if(el.matches('[data-filter]')){filter=el.dataset.filter;rotation=0;renderResults();setMomo('thinking',"Let's look at these possibilities from another angle");}else if(el.matches('[data-save]'))save(el.dataset.save);else if(el.matches('[data-detail]'))detail(el.dataset.detail);else if(el.matches('[data-close]'))$('#'+el.dataset.close).close();else if(el.matches('[data-option]')){document.querySelectorAll('[data-option]').forEach(b=>b.classList.toggle('selected',b===el));}else if(el.id==='newWish'||el.matches('.brand')){event.preventDefault();reset();}else if(el.id==='exploreNav'){if(scene && stage!=='idle'){stage='results';renderResults();activate('exploreNav');setMomo('found',"Take another look at what Momo found");}else reset();}else if(el.id==='favoritesNav')showFavorites();else if(el.id==='ordersNav')showOrders();else if(el.id==='aboutBtn')$('#infoDialog').showModal();else if(el.id==='shuffleBtn'){rotation++;renderResults();setMomo('searching',"A different path, a few new possibilities");setTimeout(()=>{if(stage==='results')setMomo('found',"Does anything in this set feel right?");},600);}else if(el.id==='sandboxCatalogButton')sandboxCatalog();else if(el.id==='viewOrderBtn'){$('#checkoutDialog').close();showOrders();}});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  window.MOMO_DEMO_UI={card,reset,sandboxCatalog,openAIItem(id,needs){preferences.weekend=/周末|周六|周日|weekend|saturday|sunday/i.test(needs.schedule);detail(id);}};
  syncComposer();
  counts();
})();
