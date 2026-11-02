import {useEffect,useRef,useState} from 'react';
import './storefront.css';
import {FaBagShopping,FaXmark,FaPlus,FaMinus,FaCheck,FaArrowRight,FaPlay} from 'react-icons/fa6';
import {merch,previewSizes} from '../content.js';
import {money,variantById,variants} from './catalog.js';
import {addItem,updateQuantity} from './cart.js';
import {fixtures,fixtureById,variantState,checkAvailability} from './fixtures.js';
import {cartSignature,checkoutRequest,rememberCheckout} from './checkout-client.js';

function TestCheckout({cart}){
  const [config,setConfig]=useState(null);const [error,setError]=useState('');const [pending,setPending]=useState(false);const [review,setReview]=useState(null);const busy=useRef(false);const controller=useRef(null);
  const signature=JSON.stringify(cart.items);const request=useRef(null);
  useEffect(()=>{const active=new AbortController();fetch('/api/commerce/config',{signal:AbortSignal.any([active.signal,AbortSignal.timeout(10000)]),cache:'no-store'}).then(response=>{if(!response.ok)throw new Error();return response.json();}).then(value=>{if(value.mode!=='test'||!Number.isSafeInteger(value.shippingCents)||value.shippingCents<0||typeof value.enabled!=='boolean')throw new Error();if(!active.signal.aborted)setConfig(value);}).catch(()=>{if(!active.signal.aborted)setConfig({enabled:false});});return()=>active.abort();},[]);
  useEffect(()=>{controller.current?.abort();busy.current=false;setPending(false);setReview(null);setError('');request.current=null;return()=>controller.current?.abort();},[signature,cart.scenario]);
  const checkout=async(accept=false)=>{
    if(busy.current||!config?.enabled||!cart.items.length||!['in-stock','empty-cart'].includes(cart.scenario))return;
    busy.current=true;setPending(true);setError('');const active=new AbortController();controller.current=active;
    try{
      const normalized=cartSignature(cart.items);
      if(!request.current){let saved=null;try{saved=JSON.parse(sessionStorage.getItem('dbm-checkout-attempt'));}catch{}request.current=saved?.signature===normalized&&/^[0-9a-f-]{36}$/i.test(saved.key)?saved:{signature:normalized,key:crypto.randomUUID()};sessionStorage.setItem('dbm-checkout-attempt',JSON.stringify(request.current));}
      const response=await checkoutRequest({items:cart.items,key:request.current.key,quoteToken:accept?review?.quoteToken:undefined,signal:AbortSignal.any([active.signal,AbortSignal.timeout(15000)])});
      if(active.signal.aborted)return;
      if(response.changed){setReview(response);return;}
      rememberCheckout(sessionStorage,response,cart.items);
      if(config.mock===true&&response.mock===true){sessionStorage.setItem(`dbm-order-mock:${response.sessionId}`,'1');window.location.assign(`/order/test-checkout?session_id=${encodeURIComponent(response.sessionId)}`);}
      else if(config.mock===true||response.mock===true)throw new Error('The checkout mode could not be verified. Your cart is saved.');
      else window.location.assign(response.url);
    }catch(failure){if(!active.signal.aborted){if(failure.code==='checkout_failed'){request.current=null;try{sessionStorage.removeItem('dbm-checkout-attempt');}catch{}}setError(failure.name==='TimeoutError'?'Checkout timed out. Your cart is saved. Retry safely with the same request.':failure.message||'Checkout could not connect. Your cart is saved.');}}
    finally{if(!active.signal.aborted){busy.current=false;setPending(false);}}
  };
  const fixtureAllowed=['in-stock','empty-cart'].includes(cart.scenario);
  return <div className="test-checkout"><p className="fine-print">{config?.enabled?(config.mock===true?'Local simulation only. No Stripe payment or card details are collected.':'Stripe test checkout only. Use test payment details. No real charge.'):config?'Test checkout is not configured. Your cart stays saved.':'Checking test checkout availability...'}</p>
    {!fixtureAllowed&&<p className="fine-print">Return to the In stock demo scenario to test checkout. Error fixtures cannot create sessions.</p>}
    {review&&<div className="price-review" role="alert"><h3>Review current server prices.</h3>{review.lines.map(line=><p key={line.variantId}>{variantById(line.variantId)?.sku}: {line.quantity} x {money(line.unitPriceCents)}</p>)}<p>{config.mock===true?'Amounts are for the local simulation only.':'Shipping and applicable tax are shown in Stripe test checkout.'}</p><button className="button" disabled={pending} onClick={()=>checkout(true)}>Accept prices and open test checkout</button></div>}
    {!review&&<button className="button" disabled={!config?.enabled||pending||!cart.items.length||!fixtureAllowed} onClick={()=>checkout()}>{pending?'Opening test checkout...':config?.enabled?(config.mock===true?'Checkout / Local simulation':'Continue to Stripe test checkout'):'Checkout / Not connected'}</button>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function FixtureTools({cart}) {
  return <details className="fixture-tools"><summary>Store test controls <span>No live data</span></summary><div className="fixture-controls"><label>Commerce scenario<select value={cart.scenario} onChange={event=>cart.loadFixture(event.target.value)}>{fixtures.map(fixture=><option value={fixture.id} key={fixture.id}>{fixture.label}</option>)}</select></label><p role="status">{fixtureById(cart.scenario).note} Loading a fixture replaces only your local demo cart.</p><div className="fixture-links"><a href="/order/pending">Pending order UI</a><a href="/order/success">Success order UI</a><a href="/order/cancel">Cancelled order UI</a></div></div></details>;
}

export function ProductOptions({item,cart,onAdded,onReview,compact=false}) {
  const [size,setSize]=useState(''); const [quantity,setQuantity]=useState(1); const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const variant=variants.find(v=>v.productId===item.id&&v.size===size);
  const state=variantState(variant?.id || `${item.id}-m`,cart.scenario);
  const submit=event=>{
    event.preventDefault(); setMessage(''); setError('');
    if (!variant) {setError('Choose a size to continue.'); return;}
    try {const next=addItem(cart.items,variant.id,quantity);checkAvailability(next,cart.scenario);cart.add(variant.id,quantity);setMessage(`${size} added. Keep exploring or open your cart.`);onAdded(`${item.name}, ${size}: added to test cart.`);}
    catch(failure){setError(failure.message);}
  };
  return <form className={`product-purchase${compact?' compact':''}`} onSubmit={submit}>
    <div className="product-price"><strong>{money(variantById(`${item.id}-m`).unitAmount)}</strong><span>Test price</span><small className={state.available?'availability':'availability unavailable'}>{state.label}</small></div>
    <fieldset><legend>Choose size <span>Provisional sizing</span></legend><div className="size-options">{previewSizes.map(value=><button key={value} type="button" aria-label={`${item.name}, size ${value}`} aria-pressed={size===value} onClick={()=>{setSize(value);setMessage('');setError('');}}>{value}</button>)}</div></fieldset>
    <div className="purchase-row"><label>Quantity for {item.name}<select aria-label={`Quantity to add for ${item.name}`} value={quantity} onChange={event=>setQuantity(Number(event.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><button type="submit" className="button" disabled={!state.available}><FaBagShopping aria-hidden="true" />{state.available?'Add to test cart':'Unavailable (demo)'}</button></div>
    {message&&<p className="added-message" role="status"><FaCheck aria-hidden="true" />{message}<button type="button" className="text-link" onClick={onReview}>View cart</button></p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!compact&&<p className="fine-print">USA shipping is confirmed at checkout. The normal preview does not accept payments.</p>}
  </form>;
}

export function RetailMerch({cart,onAdded,onReview,onDetails,onAlert}) {
  return <><div className="retail-heading"><span className="eyebrow">Drop 01 / Local store preview</span><h1>Made for the<br/><span>garage days.</span></h1><p>Three designs. The machines behind the channel.<br/>Wear the build, wherever the next day takes you.</p><div className="retail-promises"><span>Applied by us</span><span>Shipped by us</span><span>USA only</span></div></div>
    <FixtureTools cart={cart}/>
    <div className="retail-grid">{merch.map((item,index)=><article className="retail-product" key={item.id}><button className="retail-image" aria-label={`View ${item.name} design details`} onClick={()=>onDetails(item)}><img src={item.image.replace('.jpg','-768.jpg')} srcSet={`${item.image.replace('.jpg','-480.jpg')} 480w, ${item.image.replace('.jpg','-768.jpg')} 768w`} sizes="(max-width:700px) 92vw, 44vw" alt={`${item.name} official supplied design mockup`} width="1290" height="2796" loading={index===0?'eager':'lazy'} decoding="async"/><span>DBM / 0{index+1}</span></button><div className="retail-copy"><span className="eyebrow">{item.type} / Drop 01</span><h2>{item.name}</h2><p>{item.detail}</p><ProductOptions compact item={item} cart={cart} onAdded={onAdded} onReview={onReview}/><button className="text-link product-details" onClick={()=>onDetails(item)}>Design details & size guide <FaArrowRight aria-hidden="true"/></button></div></article>)}</div>
    <section className="drop-acquisition"><div><span className="eyebrow">From the garage to your inbox</span><h2>Catch the first drop.</h2><p>Get the release details before the gear goes live. Joining the list is optional and separate from future orders.</p></div><button className="button" onClick={()=>onAlert()}>Join Drop 01 alerts <FaArrowRight aria-hidden="true"/></button></section>
    <a className="build-to-merch" href="/#garage"><img src="/assets/n54.jpg" alt="BMW N54 channel build thumbnail" width="480" height="360" loading="lazy" decoding="async"/><span><small>Every design starts with a machine</small><strong>Meet the builds.</strong><span><FaPlay aria-hidden="true"/> Back to the garage</span></span></a>
    <p className="shop-note">Local test mode. Prices, demo availability and order screens are examples. Final garments, measurements, inventory and release details still need owner approval.</p></>;
}

function CartContent({cart,onContinue}) {
  const [result,setResult]=useState(null);const [accepted,setAccepted]=useState(false);const [error,setError]=useState('');const [pending,setPending]=useState(false);const controller=useRef(null);
  const signature=JSON.stringify([cart.items,cart.scenario]); const quote=result?.signature===signature?result.quote:null;
  useEffect(()=>{controller.current?.abort();setPending(false);setError('');setAccepted(false);return()=>controller.current?.abort();},[signature]);
  const priceChanged=quote?.lines.some(line=>line.unitAmount!==variantById(line.variantId).unitAmount);
  const unitPrice=id=>accepted&&quote?quote.lines.find(line=>line.variantId===id)?.unitAmount:variantById(id).unitAmount;
  const subtotal=cart.items.reduce((sum,item)=>sum+unitPrice(item.variantId)*item.quantity,0);
  const mutate=(id,quantity,newSize)=>{
    try {
      if(newSize){const existing=variantById(id);const destination=`${existing.productId}-${newSize.toLowerCase()}`;let next=updateQuantity(cart.items,id,0);next=addItem(next,destination,quantity);checkAvailability(next,cart.scenario);cart.replace(next);}
      else {const next=updateQuantity(cart.items,id,quantity);if(quantity)checkAvailability(next,cart.scenario);cart.replace(next);}
      setError('');
    }catch(failure){setError(failure.message);}
  };
  const estimate=async()=>{
    controller.current?.abort();const active=new AbortController();controller.current=active;setPending(true);setError('');setResult(null);setAccepted(false);
    try{const response=await fetch('/api/cart-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country:'US',items:cart.items,scenario:cart.scenario}),signal:AbortSignal.any([active.signal,AbortSignal.timeout(10000)])});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Estimate unavailable.');if(payload.mode!=='test'||payload.checkoutAvailable!==false)throw new Error('Invalid estimate response.');if(!active.signal.aborted)setResult({signature,quote:payload});}
    catch(failure){if(!active.signal.aborted)setError(failure instanceof TypeError||failure.name==='TimeoutError'?'We could not reach the estimate service. Your cart is saved. Please retry.':failure.message);}
    finally{if(!active.signal.aborted)setPending(false);}
  };
  return <><div className="cart-scroll"><p className="cart-mode">Local test mode. No payment will be taken.</p>
    {!cart.items.length?<div className="cart-empty"><FaBagShopping aria-hidden="true"/><h3>Room for garage gear.</h3><p>Pick a design and your size. We will keep them here while you explore.</p><button className="button" onClick={onContinue}>Explore Drop 01</button></div>:<>
    <ul className="drawer-items">{cart.items.map(line=>{const variant=variantById(line.variantId);const product=merch.find(item=>item.id===variant.productId);const state=variantState(line.variantId,cart.scenario);return <li key={line.variantId}><img src={product.image.replace('.jpg','-480.jpg')} alt={`${product.name} mockup`} width="88" height="112"/><div className="drawer-item-body"><h3>{product.name}</h3><span>{money(unitPrice(line.variantId))} each / Test price</span><label>Size for {product.name}<select aria-label={`Edit size for ${product.name}, ${variant.size}`} value={variant.size} onChange={event=>mutate(line.variantId,line.quantity,event.target.value)}>{previewSizes.map(size=><option key={size}>{size}</option>)}</select></label><div className="quantity-stepper" role="group" aria-label={`Quantity for ${product.name}, ${variant.size}`}><button aria-label={`Decrease ${product.name}, ${variant.size}`} disabled={line.quantity===1} onClick={()=>mutate(line.variantId,line.quantity-1)}><FaMinus aria-hidden="true"/></button><output aria-label={`Current quantity for ${product.name}, ${variant.size}`}>{line.quantity}</output><button aria-label={`Increase ${product.name}, ${variant.size}`} disabled={line.quantity>=10||line.quantity>=state.limit} onClick={()=>mutate(line.variantId,line.quantity+1)}><FaPlus aria-hidden="true"/></button></div><button className="text-link remove-item" aria-label={`Remove ${product.name}, ${variant.size}`} onClick={()=>mutate(line.variantId,0)}>Remove</button>{(!state.available||line.quantity>state.limit)&&<p className="item-warning">{!state.available?state.label:`Only ${state.limit} available in this demo. Reduce the quantity.`}</p>}</div><strong>{money(unitPrice(line.variantId)*line.quantity)}</strong></li>;})}</ul>
    <div className="cart-estimate"><button className="text-link" disabled={pending} onClick={estimate}>{pending?'Checking...':'Check server estimate'} <FaArrowRight aria-hidden="true"/></button>{quote&&(!priceChanged||accepted)&&<p role="status" className="quote-success">Server estimate: {money(quote.estimateBeforeTax)} before tax, including {money(quote.shipping)} USA shipping. No order created.</p>}{priceChanged&&!accepted&&<div className="price-review" role="alert"><h3>A test price changed.</h3><p>The server now estimates {money(quote.estimateBeforeTax)} before tax, including shipping. Review the $35 demo price before continuing.</p><button className="button" onClick={()=>setAccepted(true)}>Accept updated test prices</button></div>}</div>
    </>}{error&&<div className="form-error" role="alert"><p>{error}</p><p>No order was created. Your cart is unchanged.</p><button className="text-link" onClick={estimate}>Retry estimate</button></div>}{cart.storageWarning&&<p className="fine-print" role="status">{cart.storageWarning}</p>}</div>
    <footer className="cart-sticky"><div><span>Subtotal ({cart.count} items)</span><strong>{money(subtotal)}</strong></div><p>Shipping and tax are confirmed by the server at checkout. USA destinations only.</p><TestCheckout cart={cart}/><button className="text-link" onClick={onContinue}>Continue shopping</button><small>Guest checkout. No account needed.</small><nav aria-label="Checkout policies" className="checkout-policy-links"><a href="/shipping">Shipping draft</a><a href="/returns">Returns draft</a><a href="/terms">Terms draft</a></nav></footer></>;
}

export function CartDrawer({cart,onClose}) {
  const dialog=useRef(null);const close=useRef(null);
  const dismiss=()=>{dialog.current?.close();onClose();};
  useEffect(()=>{const trigger=document.activeElement;const element=dialog.current;const overflow=document.body.style.overflow;const rootOverflow=document.documentElement.style.overflow;document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';dialog.current.showModal();close.current.focus();return()=>{if(element.open)element.close();document.body.style.overflow=overflow;document.documentElement.style.overflow=rootOverflow;if(trigger?.isConnected)trigger.focus();};},[]);
  return <dialog ref={dialog} className="cart-drawer" aria-labelledby="cart-title" onCancel={event=>{event.preventDefault();dismiss();}} onClick={event=>{if(event.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dismiss();}}}><div className="cart-drawer-layout"><header className="cart-drawer-heading"><div><span className="eyebrow">Drop 01 / Test store</span><h2 id="cart-title">Your garage gear <span>({cart.count})</span></h2></div><button ref={close} className="icon-button" aria-label="Close test cart" onClick={dismiss}><FaXmark aria-hidden="true"/></button></header><CartContent cart={cart} onContinue={dismiss}/></div></dialog>;
}
