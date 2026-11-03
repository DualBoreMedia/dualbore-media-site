import {validateItems} from './catalog.js';

export const validSessionId=(value,mode='test')=>typeof value==='string'&&(mode==='production'?/^cs_live_[A-Za-z0-9]{8,240}$/:/^cs_test_[A-Za-z0-9]{8,240}$/).test(value);
export const cartSignature=items=>JSON.stringify(validateItems(items).sort((a,b)=>a.variantId.localeCompare(b.variantId)));
export function validateCheckoutUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.port||url.username||url.password)throw new Error('Checkout returned an invalid destination.');
  return url.href;
}
export async function checkoutRequest({items,key,quoteToken,signal,fetcher=fetch,mode='test',token}){
  const body=JSON.stringify({items:validateItems(items)});
  const deadline=AbortSignal.timeout(15000);
  const requestSignal=signal?AbortSignal.any([signal,deadline]):deadline;
  let response;
  try{
    response=await fetcher('/api/commerce/checkout',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','Idempotency-Key':key,...(token?{Authorization:`Bearer ${token}`}:{}),...(quoteToken?{'X-Cart-Quote':quoteToken}:{})},body,signal:requestSignal});
  }catch(failure){
    // Cart edits deliberately abort a test checkout; the caller handles that cancellation.
    if(failure?.name==='AbortError'&&signal?.aborted)throw failure;
    const timedOut=failure?.name==='TimeoutError'||deadline.aborted;
    const error=new Error(timedOut?'Checkout timed out. Your cart is saved. Retry with the same request.':'Checkout could not connect. Your cart is saved. Please retry.');
    error.code=timedOut?'checkout_timeout':'checkout_network';
    throw error;
  }
  let payload;
  try{payload=await response.json();}catch{throw new Error('Checkout returned an unreadable response. Your cart is saved. Please retry.');}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Checkout could not be verified. Your cart is saved.');
  if(response.status===409&&payload.code==='cart_changed'){
    if(typeof payload.quoteToken!=='string'||!Array.isArray(payload.lines)||payload.lines.length!==items.length||!payload.lines.every(line=>items.some(item=>item.variantId===line.variantId&&item.quantity===line.quantity)&&Number.isSafeInteger(line.unitPriceCents)&&line.unitPriceCents>=0&&line.lineTotalCents===line.unitPriceCents*line.quantity)||new Set(payload.lines.map(line=>line.variantId)).size!==items.length)throw new Error('Price review is unavailable. Your cart is saved.');
    return {changed:true,...payload};
  }
  if(!response.ok){const error=new Error(typeof payload.error==='string'&&payload.error.trim()?payload.error:'Checkout is unavailable. Your cart is saved.');error.code=payload.code;throw error;}
  if(!validSessionId(payload.sessionId,mode)||typeof payload.orderAccessToken!=='string'||payload.orderAccessToken.length<16)throw new Error('Checkout verification is unavailable. Your cart is saved.');
  return {...payload,url:validateCheckoutUrl(payload.url)};
}
export function removePurchased(current,purchased){
  validateItems(current,{allowEmpty:true});validateItems(purchased,{allowEmpty:true});
  return current.map(item=>({...item,quantity:Math.max(0,item.quantity-(purchased.find(line=>line.variantId===item.variantId)?.quantity||0))})).filter(item=>item.quantity>0);
}
export function rememberCheckout(storage,response,items){
  storage.setItem(`dbm-order-access:${response.sessionId}`,response.orderAccessToken);
  storage.setItem(`dbm-order-cart:${response.sessionId}`,JSON.stringify(validateItems(items)));
}
