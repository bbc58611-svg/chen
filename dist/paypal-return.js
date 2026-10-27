/* Return navigation alone is never evidence that a payment succeeded. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),key='momo-paypal-pending-v1';
  const query=new URLSearchParams(location.search),cancelled=query.get('flow')==='cancel';
  let pending=null,busy=false;
  try{pending=JSON.parse(sessionStorage.getItem(key));}catch{}
  const title=$('#paymentReturnTitle'),status=$('#paymentReturnStatus'),retry=$('#paymentReturnRetry');
  const matches=pending?.id&&pending.checkoutToken&&query.get('token')===pending.id;
  if(!matches){title.textContent="Check the original order";status.textContent="No matching checkout session. Return to the original browser and order.";return;}
  async function check(){
    if(busy)return;busy=true;retry.hidden=true;
    title.textContent="Checking payment";status.textContent="Checking the existing order, not creating another payment.";
    try{
      const response=await fetch('/api/paypal/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:pending.id,checkoutToken:pending.checkoutToken}),signal:AbortSignal.timeout(90000)});
      const value=await response.json();
      if(!response.ok)throw Error(value.error?.message||"Unable to verify payment.");
      if(value.status!=='COMPLETED'){title.textContent="Payment pending";status.textContent="PayPal has not confirmed completion.";retry.hidden=false;return;}
      title.textContent="Sandbox payment completed";status.textContent="Verified with PayPal by the backend.";
      const receipt=$('#paymentReturnReceipt');
      for(const line of [value.name,value.option,`${value.amount} ${value.currency}`,`Order: ${value.id}`,`Capture: ${value.captureId}`]){const p=document.createElement('p');p.textContent=window.MOMO_DISPLAY.text(line);receipt.append(p);}
      try{let orders=JSON.parse(localStorage.getItem('momo-orders-v1')||'[]');if(!Array.isArray(orders))orders=[];if(!orders.some(o=>o.id===value.id)){orders.push({id:value.id,name:value.name,option:value.option,price:Number(value.amount),captureId:value.captureId,environment:'sandbox',kind:"Sandbox test",createdAt:value.createdAt});localStorage.setItem('momo-orders-v1',JSON.stringify(orders));}sessionStorage.removeItem(key);}catch{}
    }catch(error){title.textContent="Payment not confirmed";status.textContent=error.name==='TimeoutError'?"Check timed out. Retry this order.":error.message;retry.hidden=false;}
    finally{busy=false;}
  }
  retry.onclick=check;
  if(cancelled){title.textContent="Returned to Momo";status.textContent="Returned via Cancel. No payment has been confirmed; check the original order if needed.";retry.hidden=false;}
  else check();
})();
