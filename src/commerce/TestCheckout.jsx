import {useEffect,useRef,useState} from 'react';
import {validSessionId} from './checkout-client.js';

export function TestCheckout({onBack,navigate=url=>window.location.assign(url)}){
  const sessionId=new URLSearchParams(window.location.search).get('session_id');
  const [enabled,setEnabled]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');const busy=useRef(false);const controller=useRef(null);
  let token;try{token=validSessionId(sessionId)?sessionStorage.getItem(`dbm-order-access:${sessionId}`):null;}catch{}
  useEffect(()=>{const active=new AbortController();fetch('/api/commerce/config',{cache:'no-store',signal:AbortSignal.any([active.signal,AbortSignal.timeout(10000)])}).then(response=>{if(!response.ok)throw new Error('Local simulation is unavailable.');return response.json();}).then(config=>{if(config.enabled!==true||config.mode!=='test'||config.mock!==true)throw new Error('Local simulation is not enabled.');if(!active.signal.aborted)setEnabled(true);}).catch(failure=>{if(!active.signal.aborted)setError(failure.message);});return()=>{active.abort();controller.current?.abort();};},[]);
  const simulate=async action=>{
    if(busy.current||!enabled||!token||!validSessionId(sessionId))return;
    busy.current=true;setPending(true);setError('');const active=new AbortController();controller.current=active;
    try{
      const response=await fetch('/api/commerce/simulate',{method:'POST',headers:{'Content-Type':'application/json','X-Order-Token':token},body:JSON.stringify({sessionId,action}),signal:AbortSignal.any([active.signal,AbortSignal.timeout(10000)])});
      const payload=await response.json();if(!response.ok)throw new Error(payload.error||'The local event could not complete. Your cart stays saved.');
      if(payload.simulated!==true)throw new Error('The local event was not confirmed. Your cart stays saved.');
      if(active.signal.aborted)return;
      const page=action==='paid'?'success':action==='pending'?'pending':'cancel';
      navigate(`/order/${page}?session_id=${encodeURIComponent(sessionId)}`);
    }catch(failure){if(!active.signal.aborted)setError(failure.name==='TimeoutError'?'The local simulation timed out. Your cart stays saved.':failure.message);}
    finally{if(!active.signal.aborted){busy.current=false;setPending(false);}}
  };
  return <section className="store-page order-preview"><span className="eyebrow">Local payment simulator / No Stripe payment</span><h1>Test the order journey.</h1><p>This is a local server simulation. No Stripe payment is created or verified. No money, card details or shipping address are collected, and no real order email is sent.</p><p>These buttons exercise the local order record. Only a completed simulated paid event can remove its purchased quantities from the test cart.</p>
    {(!token||!validSessionId(sessionId))&&<p role="alert" className="form-error">This browser does not have access to this test session. Your cart is unchanged.</p>}
    <div className="order-actions">{[['paid','Simulate paid event'],['pending','Simulate pending payment'],['failed','Simulate failed payment'],['expired','Simulate expired checkout']].map(([action,label])=><button key={action} className="button" disabled={!enabled||!token||!validSessionId(sessionId)||pending} onClick={()=>simulate(action)}>{label}</button>)}<button className="text-link" disabled={pending} onClick={()=>navigate('/order/cancel')}>Cancel simulation</button>{onBack&&<button className="text-link" disabled={pending} onClick={onBack}>Back to the store</button>}</div>
    {pending&&<p role="status">Applying the local simulated event...</p>}{error&&<p role="alert" className="form-error">{error}</p>}
  </section>;
}
