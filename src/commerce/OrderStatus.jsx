import {useEffect,useRef,useState} from 'react';
import {money,variantById,validateItems} from './catalog.js';
import {validSessionId,removePurchased,cartSignature} from './checkout-client.js';

export function OrderStatus({cart,onBack,mode="test"}){
  const test=mode!=="production";
  const sessionId=new URLSearchParams(window.location.search).get('session_id');
  const cancellationReturn=window.location.pathname.endsWith('/cancel');
  const [verificationRun,setVerificationRun]=useState(0);
  const latestCart=useRef(cart);latestCart.current=cart;
  const [order,setOrder]=useState(null);const [error,setError]=useState('');const [checking,setChecking]=useState(true);
  const [mock,setMock]=useState(()=>{try{return sessionStorage.getItem(`dbm-order-mock:${sessionId}`)==='1';}catch{return false;}});
  useEffect(()=>{
    const active=new AbortController();let timer;let attempts=0;setChecking(true);setError('');setOrder(null);
    const stop=message=>{setError(message);setChecking(false);};
    if(!validSessionId(sessionId,mode)){stop('No valid checkout session was provided. Your cart is unchanged.');return()=>active.abort();}
    let token;
    try{token=sessionStorage.getItem(`dbm-order-access:${sessionId}`);}catch{}
    if(!token){stop('This browser does not have access to verify this order. Your cart is unchanged.');return()=>active.abort();}
    const poll=async()=>{
      attempts++;
      try{
        const response=await fetch(`/api/commerce/order?session_id=${encodeURIComponent(sessionId)}`,{headers:{'X-Order-Token':token},cache:'no-store',signal:AbortSignal.any([active.signal,AbortSignal.timeout(10000)])});
        let payload;try{payload=await response.json();}catch{throw new Error('Order verification returned an unreadable response. Your cart stays saved.');}
        if(!response.ok){const failure=new Error(typeof payload?.error==='string'?payload.error:'Order verification is unavailable.');failure.permanent=[400,401,403,404].includes(response.status);throw failure;}
        if(active.signal.aborted)return;
        setMock(payload.mock===true);
        if(!['pending','paid','fulfilled','cancelled','failed','expired','refunded'].includes(payload.status))throw new Error('The order status could not be verified.');
        if(['paid','fulfilled'].includes(payload.status)){
          const items=validateItems(payload.items?.map(({variantId,quantity})=>({variantId,quantity})));
          if(typeof payload.orderNumber!=='string'||!['subtotalCents','shippingCents','taxCents','totalCents'].every(key=>Number.isSafeInteger(payload[key])&&payload[key]>=0)||payload.totalCents!==payload.subtotalCents+payload.shippingCents+payload.taxCents)throw new Error('Order totals could not be verified.');
          if(!payload.items.every(line=>Number.isSafeInteger(line.unitPriceCents)&&line.unitPriceCents>=0&&line.lineTotalCents===line.quantity*line.unitPriceCents)||payload.items.reduce((sum,line)=>sum+line.lineTotalCents,0)!==payload.subtotalCents)throw new Error('Order items could not be verified.');
          let snapshot;try{snapshot=validateItems(JSON.parse(sessionStorage.getItem(`dbm-order-cart:${sessionId}`)));}catch{throw new Error('Saved checkout details could not be verified. Your cart is unchanged.');}
          if(JSON.stringify([...snapshot].sort((a,b)=>a.variantId.localeCompare(b.variantId)))!==JSON.stringify([...items].sort((a,b)=>a.variantId.localeCompare(b.variantId))))throw new Error('The purchased items do not match this browser checkout. Your cart is unchanged.');
          if(!sessionStorage.getItem(`dbm-order-cleared:${sessionId}`)){
            sessionStorage.setItem(`dbm-order-cleared:${sessionId}`,'1');
            try{latestCart.current.replace(removePurchased(latestCart.current.items,items));}
            catch(failure){sessionStorage.removeItem(`dbm-order-cleared:${sessionId}`);throw failure;}
          }
          try{const attempt=JSON.parse(sessionStorage.getItem(test?'dbm-checkout-attempt':'dbm-production-checkout-attempt')||'null');if(attempt?.signature===cartSignature(snapshot))sessionStorage.removeItem(test?'dbm-checkout-attempt':'dbm-production-checkout-attempt');}catch{}
          setOrder(payload);setError('');setChecking(false);return;
        }
        setOrder(payload);setError('');
        if(payload.status!=='pending'){setChecking(false);return;}
      }catch(failure){if(active.signal.aborted)return;setError(failure.name==='TimeoutError'?'Verification timed out. Your cart stays saved.':failure.message);if(failure.permanent){setChecking(false);return;}}
      if(attempts<10)timer=setTimeout(poll,2000);else setChecking(false);
    };
    poll();return()=>{active.abort();clearTimeout(timer);};
  },[sessionId,verificationRun,mode]);
  const paid=order&&['paid','fulfilled'].includes(order.status);
  return <section className="store-page order-preview"><span className="eyebrow">{mock?'Local simulation / No Stripe payment':test?'Stripe sandbox / Test order':'DualBore Media / Order status'}</span><h1>{paid?(mock?'Simulated order result.':test?'Test payment verified.':'Payment confirmed.'):cancellationReturn?'Checkout closed.':checking?(mock?'Checking the simulated order.':test?'Verifying your test order.':'Verifying your order.'):test?'Test order status.':'Your order status.'}</h1>
    <p role="status">{paid?(mock?'The local mock event completed. No Stripe payment was verified and no money was charged.':test?'The server has verified this test payment. No real money was charged.':'Your payment has been verified. Thank you for backing the garage.'):cancellationReturn?'You left checkout. No paid order has been verified here. Your cart stays saved.':checking?(mock?'Waiting for local simulated server state. Your cart stays saved.':'Waiting for verified server payment state. Your cart stays saved.'):order?.status==='pending'?(mock?'The simulated payment remains pending. Your cart stays saved.':'Verification is still pending. Your cart stays saved.'):(mock?'The simulated order is not paid. Your cart stays saved.':'No paid order has been verified on this screen. Your cart stays saved.')}</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {paid&&<div className="example-order"><h2>{test?"Test order":"Order"} {order.orderNumber}</h2><ul>{order.items.map(line=><li key={line.variantId}>{variantById(line.variantId)?.sku} / Quantity {line.quantity} / {money(line.lineTotalCents)}</li>)}</ul><p>Subtotal {money(order.subtotalCents)}</p><p>Shipping {money(order.shippingCents)}</p><p>Tax {money(order.taxCents)}</p><strong>Total {money(order.totalCents)}</strong><p>{mock?'No real order email is sent by this simulation.':order.emailStatus==='sent'?test?'The server reports that the test order email was sent.':'Your order email was sent.':'Order email delivery has not been confirmed.'}</p></div>}
    {!paid&&!checking&&validSessionId(sessionId,mode)&&(order?.status==='pending'||error)&&<button className="button" onClick={()=>setVerificationRun(value=>value+1)}>Check payment status again</button>}
    {paid&&<p><a className="text-link" href="/account">View orders and tracking in My Garage</a></p>}
    <button className="button" onClick={onBack}>Back to the garage store</button>
  </section>;
}
