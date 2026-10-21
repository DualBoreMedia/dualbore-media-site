import {createHash,randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {inventoryPolicy,madeToOrder} from './inventory.mjs';
import {validateItems} from '../../src/commerce/catalog.js';
import {deliverOrderEmails,deliverShipmentEmail} from './order-email.mjs';
import {enqueueLifecycle} from '../operations/lifecycle.mjs';
import {deliverLifecycleEmails} from './order-email.mjs';
import {approvedShippingCalendar,captureShippingPromise,assertCarrierHandoff} from '../operations/shipping-compliance.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
export class CommerceError extends Error {constructor(code,message,status=400,details={}){super(message);Object.assign(this,{code,status,details});}}
const bad=(code,message,status=400,details)=>{throw new CommerceError(code,message,status,details);};
const iso=now=>new Date(now()).toISOString();
const paid=o=>['paid','fulfilled','refunded'].includes(o.status);
export const transitions={checkout_pending:['payment_pending','paid','expired','payment_failed','cancelled'],payment_pending:['paid','payment_failed'],paid:['fulfilled','refunded'],fulfilled:['refunded'],expired:[],payment_failed:[],cancelled:[],refunded:[]};
export function transition(order,next){if(order.status===next)return false;if(!transitions[order.status]?.includes(next))bad('invalid_transition','Order transition rejected.',409);order.status=next;return true;}
export function createCommerceService({repository,stripe,env={},now=Date.now}) {
 const live=env.COMMERCE_ENVIRONMENT==='production';
 const sessionPattern=live?/^cs_live_[A-Za-z0-9]{8,240}$/:/^cs_test_[A-Za-z0-9]{8,240}$/;
 const origin=env.SITE_ORIGIN||'http://127.0.0.1:4176';
 if(live?(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin):!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))throw new Error('Configure a valid store origin.');
 const shipping=live?Number(env.SHIPPING_RATE_CENTS||0):Number(env.TEST_SHIPPING_RATE_CENTS||700);
 if(!Number.isSafeInteger(shipping)||shipping<0||shipping>100000)throw new Error('Invalid test shipping.');
 const settle=(state,order,status)=>{for(const r of Object.values(state.reservations).filter(r=>r.orderId===order.id&&r.status==='reserved')){const v=state.variants[r.variantId];if(!v||v.reservedQuantity<r.quantity)bad('inventory_integrity','Inventory reconciliation required.',409);v.reservedQuantity-=r.quantity;r.status=status;if(status==='sold'){v.soldQuantity+=r.quantity;r.convertedAt=iso(now);}else{if(!madeToOrder(r))v.availableQuantity+=r.quantity;r.releasedAt=iso(now);}}};
 const view=o=>({orderNumber:o.orderNumber,status:o.status,items:o.items.map(({variantId,name,size,quantity,unitPriceCents,lineTotalCents})=>({variantId,name,size,quantity,unitPriceCents,lineTotalCents})),subtotalCents:o.subtotalCents,shippingCents:o.shippingCents,taxCents:o.taxCents,totalCents:o.totalCents});
 const inFlightCheckouts=new Map();
 async function checkout(input,options={}) {
  if(live&&(env.PAYMENTS_ENABLED!=='true'||!stripe||!approvedShippingCalendar(env)||!captureShippingPromise({paidAt:iso(now)},env).verified||['LIVE_CATALOG_APPROVED','SHIPPING_CONFIGURATION_APPROVED','TAX_CONFIGURATION_APPROVED','POLICIES_APPROVED','FULFILLMENT_CAPACITY_VERIFIED','SHIPPING_DELAY_WORKFLOW_VERIFIED','BUSINESS_ADDRESS_CONFIRMED','APPAREL_LABELS_VERIFIED','ARTWORK_RIGHTS_VERIFIED'].some(k=>env[k]!=='true')))bad('payments_disabled','Orders are not open yet. Your cart is saved.',503);
  if(!input||Object.keys(input).length!==1||!Object.hasOwn(input,'items'))bad('invalid_cart','Send only variants and quantities.');
  let validated;try{validated=validateItems(input.items);}catch{bad('invalid_cart','Choose valid sizes and quantities.');}
  const signature=digest(JSON.stringify([[...validated].sort((a,b)=>a.variantId.localeCompare(b.variantId)),options.quoteToken??null]));
  const active=inFlightCheckouts.get(options.requestKey);
  if(active){if(active.signature!==signature)bad('request_conflict','This request belongs to a different cart.',409);return active.promise;}
  const promise=executeCheckout(input,options);
  inFlightCheckouts.set(options.requestKey,{signature,promise});
  try{return await promise;}finally{if(inFlightCheckouts.get(options.requestKey)?.promise===promise)inFlightCheckouts.delete(options.requestKey);}
 }
 async function executeCheckout(input,{requestKey,quoteToken,customer}={}) {
  if(!input||Object.keys(input).length!==1||!Object.hasOwn(input,'items'))bad('invalid_cart','Send only variants and quantities.');
  let items;try{items=validateItems(input.items);}catch{bad('invalid_cart','Choose valid sizes and quantities.');}
  if(!/^[a-f0-9-]{36}$/i.test(requestKey||''))bad('invalid_key','A checkout request key is required.');
  const cartHash=digest(JSON.stringify([...items].sort((a,b)=>a.variantId.localeCompare(b.variantId))));
  const accessToken=digest('dbm-access:'+requestKey); // request key is random UUID, never exposed by order API
  const attemptToken=randomUUID();
  const leaseUntil=new Date(now()+120000).toISOString();
  let work=await repository.transaction(state=>{
   const existing=Object.values(state.orders).find(o=>o.requestKey===requestKey);
   if(existing){if(existing.cartHash!==cartHash)bad('request_conflict','This request belongs to a different cart.',409);if(existing.sessionUrl)return {order:existing,reused:true};if(existing.status!=='checkout_pending')bad('checkout_failed','Start a new checkout request.',409);if(existing.checkoutLeaseToken&&Date.parse(existing.checkoutLeaseUntil)>now())bad('checkout_in_progress','Checkout is already starting. Retry this request shortly.',409);existing.checkoutLeaseToken=attemptToken;existing.checkoutLeaseUntil=leaseUntil;return{order:existing,recovery:true};}
   const lines=items.map(i=>{const v=state.variants[i.variantId];if(!v?.active)bad('inactive_variant','A selected design is no longer available.',409);if(!madeToOrder(v)&&v.availableQuantity<i.quantity)bad('insufficient_stock','A selected size has insufficient stock. Update your cart.',409);const priceId=live?v.liveStripePriceId:v.stripePriceId,amount=live?v.productionPriceCents:v.priceCents;if(!priceId||!Number.isSafeInteger(amount)||amount<1)bad('catalog_not_synced','The approved catalog is not configured.',503);return {...i,sku:v.sku,name:v.name,size:v.size,unitPriceCents:amount,lineTotalCents:amount*i.quantity,stripePriceId:priceId};});
   const hash=digest(JSON.stringify(lines));
   if((live||lines.some(l=>l.unitPriceCents!==3000))&&quoteToken!==hash)bad('cart_changed','Review the current prices before checkout.',409,{quoteToken:hash,lines:lines.map(({stripePriceId,...line})=>line)});
   const id=randomUUID();const order={id,isTest:!live,testProvider:env.COMMERCE_MOCK==='true'?'mock':'stripe',orderNumber:'DBM-'+randomBytes(6).toString('hex').toUpperCase(),requestKey,cartHash,accessTokenHash:digest(accessToken),status:'checkout_pending',currency:'usd',subtotalCents:lines.reduce((s,l)=>s+l.lineTotalCents,0),shippingCents:shipping,taxCents:null,totalCents:null,items:lines,createdAt:iso(now),expiresAt:new Date(now()+35*60*1000).toISOString(),sessionId:null,customerEmail:null,fulfillmentStatus:'received',refundStatus:'none',refundedCents:0,stripeRefundIds:[]};
   state.orders[id]=order;
   if(customer?.userId&&customer.email){order.verifiedCustomerCandidate={userId:customer.userId,email:customer.email};}
   order.checkoutLeaseToken=attemptToken;order.checkoutLeaseUntil=leaseUntil;
   for(const line of lines){const v=state.variants[line.variantId];if(!madeToOrder(v))v.availableQuantity-=line.quantity;v.reservedQuantity+=line.quantity;const rid=randomUUID();state.reservations[rid]={id:rid,orderId:id,sessionId:null,variantId:line.variantId,quantity:line.quantity,inventoryPolicy:inventoryPolicy(v),status:'reserved',expiresAt:order.expiresAt,createdAt:order.createdAt};}
   return{order};
  });
  const order=work.order;
  if(work.reused)return {url:order.sessionUrl,sessionId:order.sessionId,orderAccessToken:accessToken};
  // Stripe idempotency is scoped to one immutable pending order. Concurrent retries reuse the same session.
  let params={mode:'payment',customer_creation:'always',line_items:order.items.map(l=>({price:l.stripePriceId,quantity:l.quantity})),shipping_address_collection:{allowed_countries:['US']},shipping_options:[{shipping_rate_data:{type:'fixed_amount',fixed_amount:{amount:order.shippingCents,currency:'usd'},display_name:live?'USA flat shipping':'USA flat shipping (TEST)',tax_behavior:'exclusive'}}],automatic_tax:{enabled:env.STRIPE_AUTOMATIC_TAX==='true'},expires_at:Math.floor(new Date(order.expiresAt).getTime()/1000),success_url:origin+'/order/success?session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/order/cancel?session_id={CHECKOUT_SESSION_ID}',metadata:{order_id:order.id,source:'dualbore-media-site'},integration_identifier:'dbm-checkout-'+order.id.replace(/[^a-z]/g,'').padEnd(8,'a').slice(0,8)};
  let session;
  if(order.verifiedCustomerCandidate)params.customer_email=order.verifiedCustomerCandidate.email;
   params=await repository.transaction(s=>{const o=s.orders[order.id];o.checkoutParams??=params;return o.checkoutParams;});

  try {
   if(params.automatic_tax.enabled){const registrations=await stripe.tax.registrations.list({status:'active',limit:1});if(!registrations.data.length)bad('tax_not_configured','Configure active sandbox tax registration first.',503);}
   for(const l of order.items){const price=await stripe.prices.retrieve(l.stripePriceId);if(price.livemode!==live||!price.active||price.currency!=='usd'||price.unit_amount!==l.unitPriceCents)bad('stripe_price_mismatch','The payment price differs from the trusted catalog.',409);}
   session=await stripe.checkout.sessions.create(params,{idempotencyKey:'dbm-checkout-'+order.id});
   if(session.livemode!==live||!sessionPattern.test(session.id)||new URL(session.url).origin!=='https://checkout.stripe.com')throw new Error('Invalid payment session.');
  }catch(error){
   // Ambiguous transport failures may have created a Stripe session: retain reservation for idempotent recovery.
   const definitive=error instanceof CommerceError||['StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error.type);
   await repository.transaction(s=>{const o=s.orders[order.id];if(o.checkoutLeaseToken!==attemptToken)return;if(!work.recovery&&definitive&&o.status==='checkout_pending'&&!o.sessionId){settle(s,o,'released');transition(o,'payment_failed');}o.checkoutLeaseToken=null;o.checkoutLeaseUntil=null;});
   if(error instanceof CommerceError)throw error;
   bad('stripe_unavailable','Test checkout could not start. Your cart is saved. Retry the same request.',503);
  }
  await repository.transaction(s=>{const o=s.orders[order.id];if(o.sessionId&&o.sessionId!==session.id)bad('session_conflict','Checkout needs reconciliation.',409);o.sessionId=session.id;o.sessionUrl=session.url;if(o.checkoutLeaseToken===attemptToken){o.checkoutLeaseToken=null;o.checkoutLeaseUntil=null;}for(const r of Object.values(s.reservations).filter(r=>r.orderId===o.id))r.sessionId=session.id;});
  return{url:session.url,sessionId:session.id,orderAccessToken:accessToken};
 }
 async function webhook(event){
  if(!event||event.livemode!==live||!/^evt_[A-Za-z0-9_]+$/.test(event.id||'')||typeof event.type!=='string')bad('invalid_event','Invalid payment event.');
  // Charge IDs are durable receipt lookup keys, never public receipt URLs.
  // Checkout remains the authority for payment state and inventory settlement.
  if(event.type==='charge.succeeded'){
   const charge=event.data?.object;
   if(!charge||charge.livemode!==live||charge.paid!==true||charge.currency!=='usd'||!/^ch_[A-Za-z0-9]+$/.test(charge.id||'')||typeof charge.payment_intent!=='string')bad('invalid_event','Invalid payment reference event.');
   await repository.transaction(s=>{
    if(s.events[event.id]?.status==='processed')return;
    const o=Object.values(s.orders).find(x=>x.paymentIntentId===charge.payment_intent);
    if(!o||!paid(o))bad('unknown_order','Payment reference awaits checkout reconciliation.',409);
    if(charge.amount!==o.totalCents||(o.chargeId&&o.chargeId!==charge.id))bad('payment_reference_mismatch','Payment reference needs reconciliation.',409);
    o.chargeId=charge.id;
    s.events[event.id]={id:event.id,type:event.type,orderId:o.id,status:'processed',createdAt:iso(now),processedAt:iso(now)};
   });return {received:true};
  }
  if(['refund.created','refund.updated','refund.failed'].includes(event.type)){
   const object=event.data?.object;if(!object||object.currency!=='usd'||!/^re_[A-Za-z0-9]+$/.test(object.id||''))bad('invalid_event','Invalid refund event.');
   if(object.status!=='succeeded'){if(['failed','canceled'].includes(object.status))await repository.transaction(s=>{for(const r of Object.values(s.refundRequests))if(r.refundId===object.id||r.id===object.metadata?.dbm_request_id){if(r.status!=='succeeded'){r.status='failed';r.refundId=object.id;}}});return {ignored:true};}
   const order=await repository.transaction(s=>Object.values(s.orders).find(o=>o.paymentIntentId===object.payment_intent));
   if(!order)bad('unknown_order','Refund needs reconciliation.',409);
   await recordVerifiedRefund(order.id,{refundId:object.id,amountCents:object.amount});
   await repository.transaction(s=>{for(const r of Object.values(s.refundRequests))if(r.orderId===order.id&&r.amountCents===object.amount&&(r.refundId===object.id||r.id===object.metadata?.dbm_request_id)){r.status='succeeded';r.refundId=object.id;}});
   await repository.transaction(s=>{s.events[event.id]={id:event.id,type:event.type,orderId:order.id,status:'processed',createdAt:iso(now),processedAt:iso(now)};});
   await deliverLifecycleEmails({repository,orderId:order.id,env});return {received:true};
  }
  const types=['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'];
  if(!types.includes(event.type))return{ignored:true};
  const session=event.data?.object;
  if(!session||session.livemode!==live||!sessionPattern.test(session.id||''))bad('invalid_event','Invalid payment session event.');
  const orderId=await repository.transaction(s=>{
   if(s.events[event.id]?.status==='processed')return s.events[event.id].orderId;
   const o=s.orders[session.metadata?.order_id];if(!o)bad('unknown_order','Order link is not ready. Retry webhook.',409);
   if(o.sessionId&&o.sessionId!==session.id)bad('session_mismatch','Session mismatch.',409);
   if(!o.sessionId){o.sessionId=session.id;for(const r of Object.values(s.reservations).filter(r=>r.orderId===o.id))r.sessionId=session.id;}
   if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
    if(session.payment_status==='paid'){
     if(!paid(o)){
      const subtotal=session.amount_subtotal,shippingAmount=session.total_details?.amount_shipping,tax=session.total_details?.amount_tax,total=session.amount_total;
      if(![subtotal,shippingAmount,tax,total].every(Number.isSafeInteger)||subtotal!==o.subtotalCents||shippingAmount!==o.shippingCents||tax<0||total!==subtotal+shippingAmount+tax||session.currency!=='usd')bad('amount_mismatch','Payment totals require reconciliation.',409);
      const address=session.collected_information?.shipping_details||session.shipping_details;
      if(address?.address?.country!=='US'||!session.customer_details?.email)bad('shipping_missing','USA shipping details are required.',409);
      const paymentTime=Number.isSafeInteger(event.created)&&event.created>=Math.floor(Date.parse(o.createdAt)/1000)&&event.created*1000<=now();
      transition(o,'paid');settle(s,o,'sold');Object.assign(o,{paidAt:paymentTime?new Date(event.created*1000).toISOString():o.createdAt,paymentTimestampVerified:paymentTime,customerEmail:session.customer_details.email,shippingName:address.name,shippingAddress:address.address,stripeCustomerId:typeof session.customer==='string'?session.customer:session.customer?.id,paymentIntentId:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id,taxCents:tax,totalCents:total});
      o.shippingPromise=captureShippingPromise(o,env);
      const aid=randomUUID();s.audit[aid]={id:aid,actor:'stripe',action:'payment',target:o.orderNumber,createdAt:iso(now),metadata:{previous:'pending',next:'paid',source:'verified-webhook'}};
      if(o.verifiedCustomerCandidate?.email.toLowerCase()===o.customerEmail.toLowerCase())o.customerUserId=o.verifiedCustomerCandidate.userId;
     }
    }else if(o.status==='checkout_pending')transition(o,'payment_pending');
   }else if(!paid(o)){
    if(event.type==='checkout.session.expired'&&o.status==='checkout_pending'){transition(o,'expired');settle(s,o,'released');}
    if(event.type==='checkout.session.async_payment_failed'&&['checkout_pending','payment_pending'].includes(o.status)){transition(o,'payment_failed');settle(s,o,'released');}
   }
   s.events[event.id]={id:event.id,type:event.type,orderId:o.id,status:'processed',createdAt:iso(now),processedAt:iso(now)};return o.id;
  });
  await deliverOrderEmails({repository,orderId,env,now:()=>new Date(now())});
  return{received:true};
 }
 async function status(sessionId,token){
  if(!sessionPattern.test(sessionId||'')||!/^([a-f0-9]{64})$/.test(token||''))bad('not_found','Order not found.',404);
  return repository.transaction(s=>{const o=Object.values(s.orders).find(x=>x.sessionId===sessionId);if(!o||!timingSafeEqual(Buffer.from(o.accessTokenHash,'hex'),Buffer.from(digest(token),'hex')))bad('not_found','Order not found.',404);const email=Object.values(s.emails).find(e=>e.orderId===o.id&&e.emailType==='customer-confirmation');return{...view(o),emailStatus:email?.status||'not_sent'};});
 }
 async function fulfill(orderId,{carrier,trackingNumber,trackingUrl,carrierAccepted}){let url;try{url=new URL(trackingUrl);if(url.protocol!=='https:')throw 0;}catch{bad('invalid_tracking','Use an HTTPS tracking URL.');}await repository.transaction(s=>{const o=s.orders[orderId];if(!o)bad('not_found','Order not found.',404);assertCarrierHandoff(o,{carrierAccepted},new Date(now()),env);transition(o,'fulfilled');Object.assign(o,{carrier:String(carrier).slice(0,80),trackingNumber:String(trackingNumber).slice(0,120),trackingUrl:url.href,shippedAt:iso(now),fulfilledAt:iso(now),fulfillmentStatus:'shipped'});});return deliverShipmentEmail({repository,orderId,env,now:()=>new Date(now())});}
 async function recordVerifiedRefund(orderId,{refundId,amountCents}){
  if(!/^re_[A-Za-z0-9]+$/.test(refundId||'')||!Number.isSafeInteger(amountCents)||amountCents<1)bad('invalid_refund','Invalid verified refund.');
  return repository.transaction(s=>{const o=s.orders[orderId];if(!o||!paid(o))bad('invalid_refund','A paid order is required.',409);o.stripeRefundIds??=[];if(o.stripeRefundIds.includes(refundId))return false;const amount=(o.refundedCents||0)+amountCents;if(amount>o.totalCents)bad('invalid_refund','Refund exceeds order total.',409);o.stripeRefundIds.push(refundId);o.refundedCents=amount;o.refundStatus=amount===o.totalCents?'full':'partial';if(o.refundStatus==='full')transition(o,'refunded');const aid=randomUUID();s.audit[aid]={id:aid,actor:'stripe',action:'refund-confirmed',target:o.orderNumber,createdAt:iso(now),metadata:{refundId,amountCents}};enqueueLifecycle(s,o,'refund',{eventKey:refundId,now:iso(now)});return true;});
 }
 return{checkout,webhook,status,fulfill,recordVerifiedRefund};
}
