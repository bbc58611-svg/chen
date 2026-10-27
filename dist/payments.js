/* Sandbox checkout. Only the local backend can set the payable amount. */
(() => {
  'use strict';
  const key='momo-paypal-pending-v1';
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let sdkPromise=null,buttons=null,mountVersion=0;
  function read(){try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return null;}}
  function save(value){try{if(value)sessionStorage.setItem(key,JSON.stringify(value));else sessionStorage.removeItem(key);return true;}catch{return false;}}
  async function api(route,input){
    let response;
    try{response=await fetch('/api/paypal/'+route,{method:input===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(90000),cache:'no-store'});}
    catch{throw Error("Unable to check payment status.");}
    const data=await response.json();
    if(!response.ok){const message=data.error?.code==='NOT_FOUND'?"Restart start-momo.cmd to load the latest backend, then refresh this page.":data.error?.message||"Sandbox request failed.";const error=Error(message);error.code=data.error?.code;throw error;}
    return data;
  }
  function loadSDK(clientId){
    if(window.paypal?.Buttons)return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const url=new URL('https://www.paypal.com/sdk/js');
      url.search=new URLSearchParams({'client-id':clientId,currency:'USD',locale:'en_US',intent:'capture',components:'buttons','disable-funding':'card,credit,paylater'}).toString();
      script.src=url.href;script.async=true;
      const timer=setTimeout(()=>{script.remove();sdkPromise=null;reject(Error("PayPal button timed out."));},20000);
      script.onload=()=>{clearTimeout(timer);if(window.paypal?.Buttons)resolve();else{sdkPromise=null;reject(Error("PayPal button unavailable."));}};
      script.onerror=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(Error("Unable to load PayPal."));};
      document.head.append(script);
    });
    return sdkPromise;
  }
  async function mount(root,{item,getOption,onComplete}){
    const version=++mountVersion;
    if(buttons){try{await buttons.close();}catch{}buttons=null;}
    root.innerHTML="<p class=\"sandbox-badge\">PayPal Sandbox · Test payment</p><p role=\"status\">Preparing checkout…</p>";
    let pending=read(),attempt=pending?.itemId===item.id?pending:null,capturing=false,creating=null,directBusy=false;
    function lock(yes){document.querySelectorAll('.checkout-options button').forEach(b=>b.disabled=yes);}
    function message(text){const p=root.querySelector('[data-payment-status]');if(p)p.textContent=text;}
    function recovery(visible){const b=root.querySelector('[data-payment-recover]');if(b)b.hidden=!visible;}
    async function ensureOrder(){
      if(capturing)throw Error("Please wait for payment verification.");
      if(creating)return creating;
      lock(true);message("Creating sandbox order…");
      if(!attempt){attempt={requestId:crypto.randomUUID(),itemId:item.id,name:item.name,option:getOption()};save(attempt);}
      creating=(async()=>{
        if(!attempt.id){const order=await api('orders',attempt);attempt={...attempt,...order};save(attempt);}
        recovery(true);return attempt;
      })();
      try{return await creating;}finally{creating=null;}
    }
    async function directCheckout(){
      if(directBusy||capturing)return;
      directBusy=true;const button=root.querySelector('[data-payment-direct]');button.disabled=true;
      try{
        await ensureOrder();
        const data=await api('approval',{orderId:attempt.id,checkoutToken:attempt.checkoutToken});
        if(['COMPLETED','APPROVED'].includes(data.status)){await complete();return;}
        if(data.status==='PENDING'){message("Payment is pending.");return;}
        const url=new URL(data.approvalUrl);
        if(url.protocol!=='https:'||!['www.sandbox.paypal.com','sandbox.paypal.com'].includes(url.hostname)||url.username||url.password||url.searchParams.get('token')!==attempt.id)throw Error("Invalid sandbox checkout URL.");
        if(!save(attempt))throw Error("Allow session storage before continuing.");
        if(!data.returnsToMomo){
          const link=root.querySelector('[data-payment-legacy-link]');link.href=url.href;link.hidden=false;
          message("Open PayPal, then return here to check this existing order.");return;
        }
        message("Opening PayPal sandbox…");
        location.assign(url.href);
      }catch(error){message(error.message);recovery(!!attempt?.id);}
      finally{directBusy=false;button.disabled=false;}
    }
    async function complete(){
      if(capturing||!attempt?.id||!attempt.checkoutToken)return;
      capturing=true;lock(true);recovery(false);message("Checking with PayPal…");
      try{
        const value=await api('capture',{orderId:attempt.id,checkoutToken:attempt.checkoutToken});
        if(value.status!=='COMPLETED'){message("Payment is pending.");recovery(true);return;}
        save(null);attempt=null;onComplete(value);
      }catch(error){message(error.message);recovery(true);}
      finally{capturing=false;}
    }
    try{
      const config=await api('config');if(version!==mountVersion)return;
      if(!config.configured){root.innerHTML="<p class=\"sandbox-badge\">PayPal Sandbox · Test payment</p><p>Configure sandbox credentials and restart.</p>";return;}
      if(pending&&pending.itemId!==item.id){
        root.innerHTML=`<p class="sandbox-badge">PayPal Sandbox · Test payment</p><p>Check the previous checkout first: ${e(window.MOMO_DISPLAY?.text(pending.name)||pending.name)}.</p><button class="primary-button" data-open-pending>View checkout</button>`;
        root.querySelector('[data-open-pending]').onclick=()=>window.MOMO_DEMO_UI.openAIItem(pending.itemId,{});return;
      }
      root.innerHTML="<p class=\"sandbox-badge\">PayPal Sandbox · Test payment</p><p class=\"sandbox-description\">Use a personal sandbox buyer. No booking or delivery.</p><div data-paypal-buttons></div><button type=\"button\" class=\"primary-button sandbox-direct\" data-payment-direct>Open checkout ↗</button><p class=\"sandbox-status\" data-payment-status role=\"status\"></p><a class=\"sandbox-recover\" data-payment-legacy-link target=\"_blank\" rel=\"noopener noreferrer\" hidden>Open existing checkout ↗</a><button type=\"button\" class=\"sandbox-recover\" data-payment-recover hidden>Check payment</button><button type=\"button\" class=\"sandbox-recover\" data-payment-reload hidden>Reload PayPal</button>";
      root.querySelector('[data-payment-recover]').onclick=complete;
      root.querySelector('[data-payment-direct]').onclick=directCheckout;
      if(config.apiVersion!==2){root.querySelector('[data-payment-direct]').disabled=true;message("Restart start-momo.cmd to load the latest backend, then refresh this page. Your existing order is preserved.");return;}
      const reload=root.querySelector('[data-payment-reload]');reload.onclick=()=>mount(root,{item,getOption,onComplete});
      if(attempt){lock(true);message("Resume or check the existing checkout.");recovery(!!attempt.id);}
      try{await loadSDK(config.clientId);}catch{if(version===mountVersion){message("Button unavailable. Use Open checkout above.");reload.hidden=false;}return;}
      if(version!==mountVersion)return;
      const instance=window.paypal.Buttons({
        fundingSource:window.paypal.FUNDING.PAYPAL,
        style:{layout:'vertical',color:'gold',shape:'rect',label:'pay',height:45},
        async createOrder(){
          try{
            await ensureOrder();
            recovery(true);message("Approve the sandbox payment in PayPal.");return attempt.id;
          }catch(error){message(error.message);throw error;}
        },
        async onApprove(data){if(data.orderID!==attempt?.id){message("Order ID mismatch.");return;}await complete();},
        onCancel(){if(capturing)return;save(null);attempt=null;lock(false);recovery(false);message("Cancelled. No payment confirmed.");},
        onError(){if(!root.querySelector('[data-payment-status]')?.textContent)message("Checkout did not complete.");recovery(!!attempt?.id);}
      });
      buttons=instance;try{await instance.render(root.querySelector('[data-paypal-buttons]'));}catch{message("Use Open checkout instead.");reload.hidden=false;}
    }catch(error){if(version===mountVersion){if(root.querySelector('[data-payment-direct]'))message("Use Open checkout instead.");else root.innerHTML=`<p class="sandbox-badge">PayPal Sandbox · Test payment</p><p role="alert">${e(error.message)}</p>`;}}
  }
  window.MOMO_PAYMENTS={mount};
})();
