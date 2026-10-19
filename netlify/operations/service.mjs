import {inventoryPolicy,madeToOrder,publicAvailableQuantity} from '../commerce/inventory.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {CommerceError,createCommerceService} from '../commerce/service.mjs';
import {requirePermission,roleOf,permissionsFor,staffActions,employeeTransitions} from './permissions.mjs';
import {enqueueLifecycle} from './lifecycle.mjs';
import {deliverLifecycleEmails,retryRecordedEmail} from '../commerce/order-email.mjs';
import {recordMarketingConsent,getMarketingPreference} from './marketing.mjs';

const fail=(code,message,status=400)=>{throw new CommerceError(code,message,status);};
const text=(v,max=600)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const record=(map,key)=>typeof key==='string'&&Object.hasOwn(map,key)?map[key]:undefined;
const paid=o=>['paid','fulfilled','refunded'].includes(o.status);
const fulfillable=o=>['paid','fulfilled'].includes(o.status)&&o.refundStatus!=='full';
const version=o=>o.version||0;
export const fulfillmentTransitions={received:['making','on_hold','cancelled'],making:['packing','on_hold','cancelled'],packing:['ready_to_ship','on_hold','cancelled'],ready_to_ship:['on_hold','cancelled'],shipped:[],delivered:[],cancelled:[],on_hold:[]};
export function safeTrackingUrl(input){
  try {if(typeof input!=='string'||input.length>2048||/[\s\\]/.test(input))throw 0;const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.port||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname)||/\.(local|internal|localhost)$/.test(url.hostname))throw 0;return url.href;}catch{fail('invalid_tracking','Use a public HTTPS carrier tracking link without embedded credentials.');}
}
function schema(input,required,optional=[]){if(!input||typeof input!=='object'||Array.isArray(input)||required.some(k=>!Object.hasOwn(input,k))||Object.keys(input).some(k=>!['action',...required,...optional].includes(k)))fail('invalid_input','Check the information and try again.');}
function checkVersion(record,expected){if(!Number.isSafeInteger(expected)||expected!==version(record))fail('stale_record','This record changed. Reload before saving.',409);}
function initialFulfillment(order){return order.fulfillmentStatus&&Object.hasOwn(fulfillmentTransitions,order.fulfillmentStatus)?order.fulfillmentStatus:order.fulfilledAt&&order.shippedAt?'shipped':'received';}
function audit(state,principal,action,target,metadata,now){const id=randomUUID();state.audit[id]={id,actor:principal.userId,action,target,createdAt:now,metadata};return id;}
function orderByNumber(state,number){if(!text(number,60))fail('not_found','Order not found.',404);const order=Object.values(state.orders).find(o=>o.orderNumber===number);if(!order)fail('not_found','Order not found.',404);return order;}
const cleanItems=items=>items.map(({variantId,name,size,quantity,unitPriceCents,lineTotalCents})=>({variantId,name,size,quantity,unitPriceCents,lineTotalCents}));
const shippingAddress=address=>Object.fromEntries(['line1','line2','city','state','postal_code','country'].filter(k=>typeof address?.[k]==='string').map(k=>[k,address[k].slice(0,200)]));
function employeeProjection(state,order){
 const base=projection(state,order,false);
 return {orderNumber:order.orderNumber,status:order.status,fulfillmentStatus:base.fulfillmentStatus,version:version(order),createdAt:order.createdAt,
  shippingName:order.shippingName,shippingAddress:shippingAddress(order.shippingAddress),
  items:order.items.map(({variantId,name,size,quantity})=>({variantId,name,size,quantity})),timeline:base.timeline,
  allowedTransitions:(fulfillmentTransitions[base.fulfillmentStatus]||[]).filter(s=>employeeTransitions.includes(s)),
  shipments:base.shipments.map(p=>({...p,items:(p.items||[]).map(({variantId,quantity})=>({variantId,quantity})),shipmentId:Object.values(state.shipments).find(s=>s.orderId===order.id&&s.packageNumber===p.packageNumber)?.id}))};
}
function projection(state,order,admin){
 const shipments=Object.values(state.shipments).filter(s=>s.orderId===order.id).map(s=>({...admin?{shipmentId:s.id,packedByUserId:s.packedByUserId,packedAt:s.packedAt,createdByUserId:s.createdByUserId,trackingEnteredByUserId:s.trackingEnteredByUserId}:{},packageNumber:s.packageNumber,carrier:s.carrier,service:s.service,status:s.status,trackingNumber:s.trackingNumber,trackingUrl:s.trackingUrl,version:version(s),items:s.items,weightOz:s.weightOz,dimensions:s.dimensions,createdAt:s.createdAt,shippedAt:s.shippedAt,deliveredAt:s.deliveredAt}));
 const history=Object.values(state.audit).filter(a=>a.target===order.orderNumber);
 const timeline=history.filter(a=>['fulfillment','shipment-status','payment'].includes(a.action)).map(a=>({status:a.metadata.next,previousStatus:a.metadata.previous,createdAt:a.createdAt,source:a.metadata.source||'garage'}));
 if(order.paidAt&&!timeline.some(e=>e.status==='paid'))timeline.unshift({status:'paid',createdAt:order.paidAt,source:'verified-payment'});
 if(!shipments.length&&order.shippedAt&&order.trackingUrl)shipments.push({packageNumber:'Earlier shipment',carrier:order.carrier,status:'shipped',trackingNumber:order.trackingNumber,trackingUrl:safeTrackingUrl(order.trackingUrl),shippedAt:order.shippedAt,items:order.items.map(({variantId,quantity})=>({variantId,quantity}))});
 const result={orderNumber:order.orderNumber,status:order.status,paymentStatus:order.refundStatus==='partial'?'partially_refunded':order.status==='fulfilled'?'paid':order.status,fulfillmentStatus:initialFulfillment(order),version:version(order),createdAt:order.createdAt,paidAt:order.paidAt,totalCents:order.totalCents,subtotalCents:order.subtotalCents,shippingCents:order.shippingCents,taxCents:order.taxCents,refundedCents:order.refundedCents||0,items:cleanItems(order.items),shipments,timeline};
 if(admin)Object.assign(result,{allowedTransitions:initialFulfillment(order)==='on_hold'?[order.holdPreviousStatus,'cancelled'].filter(Boolean):fulfillmentTransitions[initialFulfillment(order)]||[],customerEmail:order.customerEmail,shippingName:order.shippingName,shippingAddress:order.shippingAddress,notes:history.filter(a=>a.action==='note').map(a=>({text:a.metadata.note,actor:a.actor,createdAt:a.createdAt})),audit:history,sessionId:order.sessionId,paymentIntentId:order.paymentIntentId,emailEvents:Object.values(state.emails).filter(e=>e.orderId===order.id).map(e=>({eventId:e.id,emailType:e.emailType,status:e.status,attemptCount:e.attemptCount,lastError:e.lastError}))});
 return result;
}
export function createOperationsService({repository,stripe,env={},now=()=>new Date(),send=deliverLifecycleEmails,retryEmail=retryRecordedEmail}){
 const timestamp=()=>now().toISOString();
 async function authorize(principal,permission){
  try{return requirePermission(principal,permission);}catch(error){
   if(principal?.userId)await repository.transaction(s=>audit(s,principal,'authorization-denied','staff',{permission,code:error.code,sessionHash:createHash('sha256').update(String(principal.sessionId||'')).digest('hex')},timestamp()));
   throw error;
  }
 }
 async function read(principal,{admin=false,staff=false,orderNumber,search='',page=1,status='',fulfillmentStatus='',customer='',dateFrom='',dateTo='',sort='newest',shipmentStatus=''}={}){
  if(admin)await authorize(principal,'administration');
  else if(staff)await authorize(principal,'staff-read');
  if(!principal?.userId||!principal.email)fail('unauthorized','Sign in with a verified email.',401);
  return repository.transaction(s=>{
   const sessionHash=principal.sessionId?createHash('sha256').update(String(principal.sessionId)).digest('hex'):null;
   if(admin||staff){
    if(sessionHash&&!Object.values(s.audit).some(a=>a.action==='staff-session'&&a.actor===principal.userId&&a.metadata.sessionHash===sessionHash))audit(s,principal,'staff-session','staff',{sessionHash,role:roleOf(principal)},timestamp());
    audit(s,principal,orderNumber?'staff-order-opened':'staff-queue-viewed',orderNumber||'fulfillment-queue',{sessionHash,role:roleOf(principal)},timestamp());
   }
   if(staff&&!admin){
    let orders=Object.values(s.orders).filter(paid);const term=String(search).toLowerCase().slice(0,100);
    orders=orders.filter(o=>(!orderNumber||o.orderNumber===orderNumber)&&(!term||`${o.orderNumber} ${o.shippingName||''}`.toLowerCase().includes(term))&&(!status||o.status===status)&&(!fulfillmentStatus||initialFulfillment(o)===fulfillmentStatus)&&(!dateFrom||o.createdAt.slice(0,10)>=dateFrom)&&(!dateTo||o.createdAt.slice(0,10)<=dateTo)&&(!shipmentStatus||Object.values(s.shipments).some(p=>p.orderId===o.id&&p.status===shipmentStatus)));
    if(orderNumber&&!orders.length)fail('not_found','Order not found.',404);
    orders.sort((a,b)=>sort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));const total=orders.length,pageNumber=Math.max(1,Math.min(100000,Number.isSafeInteger(Number(page))?Number(page):1));
    const overview=Object.fromEntries(['received','making','packing','ready_to_ship','shipped','delivered','on_hold'].map(k=>[k,Object.values(s.orders).filter(o=>paid(o)&&initialFulfillment(o)===k).length]));
    return {role:roleOf(principal),permissions:permissionsFor(principal),overview,orders:orders.slice((pageNumber-1)*25,pageNumber*25).map(o=>employeeProjection(s,o)),pagination:{page:pageNumber,total,pageSize:25}};
   }
   let profile=s.profiles[principal.userId];
   if(!profile)profile=s.profiles[principal.userId]={id:principal.userId,marketingConsent:false,createdAt:timestamp()};
   if(profile.deletionRequestedAt&&!admin)fail('deletion_pending','Account deletion review is in progress. Contact support for help.',403);
   // A fresh, provider-verified primary address is the only ownership proof.
   for(const o of Object.values(s.orders))if(!o.customerUserId&&o.customerEmail?.toLowerCase()===principal.email.toLowerCase()&&paid(o)){
    o.customerUserId=principal.userId;audit(s,principal,'order-claimed',o.orderNumber,{method:'verified-primary-email'},timestamp());
   }
   if(admin&&sessionHash&&!Object.values(s.audit).some(a=>a.action==='admin-session'&&a.actor===principal.userId&&a.metadata.sessionHash===sessionHash))
    audit(s,principal,'admin-session','operations',{sessionHash},timestamp());
   let orders=Object.values(s.orders).filter(o=>admin||o.customerUserId===principal.userId);
   if(orderNumber){orders=orders.filter(o=>o.orderNumber===orderNumber);if(!orders.length)fail('not_found','Order not found.',404);}
   if(admin){const term=String(search).toLowerCase().slice(0,100);orders=orders.filter(o=>(!term||`${o.orderNumber} ${o.customerEmail||''} ${o.shippingName||''}`.toLowerCase().includes(term))&&(!status||o.status===status)&&(!fulfillmentStatus||initialFulfillment(o)===fulfillmentStatus)&&(!customer||(o.customerEmail||'').toLowerCase().includes(customer.toLowerCase()))&&(!dateFrom||o.createdAt.slice(0,10)>=dateFrom)&&(!dateTo||o.createdAt.slice(0,10)<=dateTo)&&(!shipmentStatus||Object.values(s.shipments).some(p=>p.orderId===o.id&&p.status===shipmentStatus)));}
   orders.sort((a,b)=>sort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));
   const total=orders.length;const pageNumber=Math.max(1,Math.min(100000,Number.isSafeInteger(Number(page))?Number(page):1));orders=orders.slice((pageNumber-1)*25,pageNumber*25);
   const all=Object.values(s.orders),variants=Object.values(s.variants);
   const lowThreshold=Number.isSafeInteger(Number(env.LOW_STOCK_THRESHOLD))?Number(env.LOW_STOCK_THRESHOLD):5;
   const failures=[...Object.values(s.emails).filter(e=>['failed','queued','manual-review'].includes(e.status)).map(e=>({eventId:e.id,type:'email',status:e.status,orderNumber:s.orders[e.orderId]?.orderNumber,reason:e.lastError})),...Object.values(s.events).filter(e=>e.status==='failed').map(e=>({eventId:e.id,type:'webhook',status:'failed',reason:'Webhook needs review.'})),...variants.filter(v=>!['availableQuantity','reservedQuantity','soldQuantity'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0)).map(v=>({type:'inventory',reason:`Review ${v.sku}`}))];
   for(const r of Object.values(s.reservations))if(r.status==='reserved'&&Date.parse(r.expiresAt)<now().getTime())failures.push({type:'reservation',status:'review',orderNumber:s.orders[r.orderId]?.orderNumber,safeMessage:'Reservation needs Stripe reconciliation. Never release stock based only on elapsed time.'});
   for(const r of Object.values(s.refundRequests))if(r.status!=='succeeded')failures.push({type:'refund',status:r.status,orderNumber:r.orderNumber,safeMessage:'Refund has not been confirmed. Retry the same request or reconcile with Stripe.'});
   for(const p of Object.values(s.shipments))if(['shipped','delivered'].includes(p.status)&&(!p.trackingNumber||!p.trackingUrl))failures.push({type:'shipment',status:'review',orderNumber:s.orders[p.orderId]?.orderNumber,safeMessage:'Shipment tracking needs review.'});
   for(const p of Object.values(s.profiles))if(p.deletionRequestedAt)failures.push({type:'account',status:'review',safeMessage:'An account deletion request requires retention review and managed-provider action.'});
   const staleHours=Number(env.FULFILLMENT_REVIEW_HOURS)||72;
   for(const o of all)if(['making','packing','ready_to_ship','on_hold'].includes(initialFulfillment(o))&&now().getTime()-Date.parse(o.paidAt||o.createdAt)>staleHours*3600000)failures.push({type:'fulfillment',status:'review',orderNumber:o.orderNumber,safeMessage:'This order exceeds the configured operations review interval. Review its progress.'});
   const supportTickets=Object.values(s.supportTickets).filter(t=>admin||t.userId===principal.userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100).map(({id,userId,customerEmail,note,...ticket})=>({...ticket,...admin?{customerEmail,note}:{}}));
   profile.marketingConsent=getMarketingPreference(s,principal.email).subscribed;
   for(const failure of failures)failure.safeMessage??=failure.type==='email'?'A recorded email needs safe retry or delivery review.':failure.type==='inventory'?failure.reason:'A verified webhook needs Stripe reconciliation.';
   return {role:roleOf(principal),permissions:permissionsFor(principal),supportTickets,profile:{displayName:principal.displayName,email:principal.email,verified:true,marketingConsent:profile.marketingConsent,marketingSuppressed:getMarketingPreference(s,principal.email).suppressed,deletionRequestedAt:profile.deletionRequestedAt},orders:orders.map(o=>projection(s,o,admin)),pagination:{page:pageNumber,total,pageSize:25},...(admin?{overview:{paid:all.filter(o=>['paid','fulfilled'].includes(o.status)).length,received:all.filter(o=>paid(o)&&initialFulfillment(o)==='received').length,...Object.fromEntries(['making','packing','ready_to_ship','shipped','delivered','on_hold'].map(k=>[k,all.filter(o=>paid(o)&&initialFulfillment(o)===k).length])),lowInventory:variants.filter(v=>!madeToOrder(v)&&v.availableQuantity<=lowThreshold).length,soldOut:variants.filter(v=>!madeToOrder(v)&&v.active&&v.availableQuantity===0).length,needsAttention:failures.length,failedEmails:failures.filter(e=>e.type==='email').length,webhookFailures:failures.filter(e=>e.type==='webhook').length},variants:variants.map(v=>({id:v.id,variantId:v.id,productId:v.productId,sku:v.sku,name:v.name,size:v.size,inventoryPolicy:inventoryPolicy(v),availableQuantity:publicAvailableQuantity(v),reservedQuantity:v.reservedQuantity,soldQuantity:v.soldQuantity,active:v.active,version:version(v),lowStock:!madeToOrder(v)&&v.active&&v.availableQuantity>0&&v.availableQuantity<=lowThreshold})),audit:Object.values(s.audit).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,250),failures}:{} )};
  });
 }
 async function mutate(principal,input){
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.action!=='string')fail('invalid_input','Select a supported action.');
  if(!principal?.userId||!principal.email)fail('unauthorized','Sign in with a verified email.',401);
  if(input.action==='support')return repository.transaction(s=>{
   schema(input,['category','message'],['orderNumber']);if(!['order','shipping','returns','account','general'].includes(input.category)||!text(input.message))fail('invalid_support','Choose a category and a message up to 600 characters.');
   if(input.orderNumber){const o=orderByNumber(s,input.orderNumber);if(o.customerUserId!==principal.userId&&o.customerEmail?.toLowerCase()!==principal.email.toLowerCase())fail('not_found','Order not found.',404);}
   const id=randomUUID(),ticketNumber='HELP-'+randomUUID().slice(0,8).toUpperCase();s.supportTickets[id]={id,ticketNumber,userId:principal.userId,customerEmail:principal.email,category:input.category,message:input.message,orderNumber:input.orderNumber||null,status:'open',version:0,createdAt:timestamp()};audit(s,principal,'support-request',ticketNumber,{category:input.category},timestamp());return {saved:true,ticketNumber};
  });
  if(['preferences','deletion-request'].includes(input?.action))return repository.transaction(s=>{
   schema(input,input.action==='preferences'?['marketingConsent']:[]);
   const p=s.profiles[principal.userId]??={id:principal.userId,marketingConsent:false,createdAt:timestamp()};
   if(input.action==='preferences'){if(typeof input.marketingConsent!=='boolean')fail('invalid_consent','Choose your email preference.');if(p.deletionRequestedAt)fail('deletion_pending','Account deletion review is in progress.',403);p.marketingConsent=recordMarketingConsent(s,{email:principal.email,consent:input.marketingConsent,source:'account-preferences',policyVersion:'prelaunch-v1',actorUserId:principal.userId,now:now()}).subscribed;p.consentUpdatedAt=timestamp();}
   else {p.deletionRequestedAt??=timestamp();p.marketingConsent=false;recordMarketingConsent(s,{email:principal.email,consent:false,source:'account-preferences',policyVersion:'prelaunch-v1',actorUserId:principal.userId,now:now()});}
   audit(s,principal,input.action,'account',{marketingConsent:p.marketingConsent},timestamp());return {saved:true};
  });
  await authorize(principal,staffActions.includes(input.action)?input.action==='packing-slip'?'packing-slip':'fulfillment':'administration');
  if(roleOf(principal)==='employee'&&((input.action==='transition'&&(!employeeTransitions.includes(input.status)||input.note!==undefined))||(input.action==='shipment-status'&&!['packed','shipped','delivered'].includes(input.status))||(['shipment','shipment-update'].includes(input.action)&&input.note!==undefined))){
   await repository.transaction(s=>audit(s,principal,'authorization-denied','staff',{permission:'fulfillment-exception',code:'admin_required'},timestamp()));fail('admin_required','Administrator access is required for this exception.',403);
  }
  if(input.action==='reconcile'){
   schema(input,['orderNumber']);const order=await repository.transaction(s=>orderByNumber(s,input.orderNumber));if(!order.sessionId||!stripe)fail('reconciliation_required','An operator must locate the original checkout in Stripe. No stock was released.',409);
   let session;try{session=await stripe.checkout.sessions.retrieve(order.sessionId);}catch{fail('provider_unavailable','Stripe is unavailable. No order or stock change was confirmed.',503);}
   const type=session.payment_status==='paid'?'checkout.session.completed':session.status==='expired'?'checkout.session.expired':null;
   if(!type)return {saved:false,status:'pending'};
   const result=await createCommerceService({repository,stripe,env}).webhook({id:'evt_reconcile_'+order.id.replaceAll('-','')+'_'+type.split('.').at(-1),type,livemode:env.COMMERCE_ENVIRONMENT==='production',data:{object:session}});
   await repository.transaction(s=>audit(s,principal,'reconciliation',order.orderNumber,{source:'stripe-retrieval'},timestamp()));return {saved:true,...result};
  }
  if(input?.action==='refund')return refund(principal,input);
  if(input?.action==='retry-email'){
   schema(input,['eventId']);if(!text(input.eventId,240))fail('invalid_email','Select a recorded email.');
   const event=await repository.transaction(s=>{const e=record(s.emails,input.eventId);if(!e||!['queued','failed'].includes(e.status))fail('invalid_email','This email cannot be retried.',409);audit(s,principal,'email-retry',s.orders[e.orderId]?.orderNumber||'email',{eventId:e.id},timestamp());return e;});
   return {result:await retryEmail({repository,eventId:event.id,env})};
  }
  const result=await repository.transaction(s=>{
   const time=timestamp();
   if(input.action==='packing-slip'){
    schema(input,['orderNumber'],['shipmentId']);const o=orderByNumber(s,input.orderNumber);if(!fulfillable(o)||['cancelled','on_hold'].includes(initialFulfillment(o)))fail('not_ready','A paid order that is not refunded, cancelled or on hold is required for a packing slip.',409);
    let items=o.items,packageNumber;
    if(input.shipmentId!==undefined){const p=record(s.shipments,input.shipmentId);if(!p||p.orderId!==o.id)fail('not_found','Package not found.',404);packageNumber=p.packageNumber;
     const allocated=Object.values(s.shipmentItems).filter(i=>i.shipmentId===p.id);if(!allocated.length)fail('invalid_package','Package allocations need review.',409);
     const quantities=new Map();for(const item of allocated){if(!Number.isSafeInteger(item.quantity)||item.quantity<1)fail('invalid_package','Package allocations need review.',409);quantities.set(item.variantId,(quantities.get(item.variantId)||0)+item.quantity);}
     items=[...quantities].map(([variantId,quantity])=>{const line=o.items.find(i=>i.variantId===variantId);const total=Object.values(s.shipmentItems).filter(i=>s.shipments[i.shipmentId]?.orderId===o.id&&i.variantId===variantId).reduce((n,i)=>n+i.quantity,0);if(!line||!Number.isSafeInteger(total)||total>line.quantity)fail('invalid_package','Package allocations need review.',409);return {...line,quantity};});
    }
    audit(s,principal,'packing-slip-generated',o.orderNumber,{packageNumber:packageNumber||null},time);
    return {packingSlip:{brand:'DualBoreMedia',website:'dualboremedia.com',orderNumber:o.orderNumber,orderDate:o.createdAt,shipTo:{name:o.shippingName,address:shippingAddress(o.shippingAddress)},...(packageNumber?{packageNumber}:{}),items:items.map(({name,size,quantity})=>({name,size,quantity}))}};
   }
   if(input.action==='support-status'){
    schema(input,['ticketNumber','status','note','expectedVersion']);const t=Object.values(s.supportTickets).find(t=>t.ticketNumber===input.ticketNumber);if(!t)fail('not_found','Request not found.',404);checkVersion(t,input.expectedVersion);if(!['open','resolved'].includes(input.status)||!text(input.note))fail('invalid_support','Choose a status and include an internal note.');audit(s,principal,'support-status',t.ticketNumber,{previous:t.status,next:input.status,note:input.note},time);t.status=input.status;t.note=input.note;t.version++;t.updatedAt=time;return {saved:true};
   }
   if(input.action==='inventory'){
    schema(input,['variantId','availableQuantity','active','reason','expectedVersion']);const v=record(s.variants,input.variantId);if(!v)fail('not_found','Variant not found.',404);checkVersion(v,input.expectedVersion);
    if(!Number.isSafeInteger(input.availableQuantity)||input.availableQuantity<0||input.availableQuantity>100000||typeof input.active!=='boolean'||!text(input.reason,300))fail('invalid_stock','Enter valid stock and a reason.');
    if(madeToOrder(v)&&input.availableQuantity!==0)fail('invalid_stock','Made-to-order products do not have finished stock counts. Use zero and control availability with the active switch.');
    audit(s,principal,'inventory',v.sku,{previous:{availableQuantity:v.availableQuantity,active:v.active},next:{availableQuantity:input.availableQuantity,active:input.active},reason:input.reason},time);v.availableQuantity=input.availableQuantity;v.active=input.active;v.version=version(v)+1;return {saved:true};
   }
   if(input.action==='note'){
    schema(input,['orderNumber','note']);if(!text(input.note))fail('invalid_note','Enter a note of up to 600 characters.');const o=orderByNumber(s,input.orderNumber);audit(s,principal,'note',o.orderNumber,{note:input.note},time);return {saved:true};
   }
   if(input.action==='transition'){
    schema(input,['orderNumber','status','expectedVersion'],['note','confirmed']);const o=orderByNumber(s,input.orderNumber);checkVersion(o,input.expectedVersion);if(!fulfillable(o))fail('not_paid','A non-refunded verified payment is required before fulfillment.',409);const previous=initialFulfillment(o);
    const allowed=previous==='on_hold'?[o.holdPreviousStatus,'cancelled']:fulfillmentTransitions[previous];
    if(!allowed?.includes(input.status))fail('invalid_transition','That fulfillment transition is not allowed.',409);
    if(input.note!==undefined&&!text(input.note))fail('invalid_note','Enter a valid note.');
    if(['cancelled','on_hold'].includes(input.status)&&(input.confirmed!==true||!text(input.note)))fail('confirmation_required','Confirm this action and include a reason.');
    if(input.status==='cancelled'&&Object.values(s.shipments).some(p=>p.orderId===o.id&&['shipped','delivered'].includes(p.status)))fail('already_shipped','A shipped order cannot be cancelled.',409);
    if(input.status==='on_hold')o.holdPreviousStatus=previous;
    o.fulfillmentStatus=input.status;o.version=version(o)+1;audit(s,principal,'fulfillment',o.orderNumber,{previous,next:input.status,note:input.note||'',version:o.version},time);
    if(['making','packing','ready_to_ship','cancelled'].includes(input.status))enqueueLifecycle(s,o,input.status,{now:time,env});return {saved:true,orderId:o.id};
   }
   if(input.action==='shipment'){
    schema(input,['orderNumber','carrier','service','trackingNumber','trackingUrl','items'],['weightOz','dimensions','note']);const o=orderByNumber(s,input.orderNumber);
    if(!fulfillable(o)||!['packing','ready_to_ship'].includes(initialFulfillment(o)))fail('not_ready','Pack the paid order before creating a package.',409);
    if(!text(input.carrier,80)||!text(input.service,80)||!text(input.trackingNumber,120))fail('invalid_shipment','Enter the carrier, service and tracking number.');const url=safeTrackingUrl(input.trackingUrl);
    if(!Array.isArray(input.items)||!input.items.length||input.items.length>15)fail('invalid_shipment','Choose items for this package.');const seen=new Set();
    for(const item of input.items){if(!item||Object.keys(item).sort().join()!=='quantity,variantId'||seen.has(item.variantId)||!Number.isSafeInteger(item.quantity)||item.quantity<1)fail('invalid_shipment','Choose valid package quantities.');seen.add(item.variantId);const line=o.items.find(l=>l.variantId===item.variantId);const allocated=Object.values(s.shipmentItems).filter(i=>s.shipments[i.shipmentId]?.orderId===o.id&&i.variantId===item.variantId).reduce((n,i)=>n+i.quantity,0);if(!line||allocated+item.quantity>line.quantity)fail('over_allocated','Package quantities exceed this order.',409);}
    if(input.weightOz!==undefined&&(!Number.isFinite(input.weightOz)||input.weightOz<=0||input.weightOz>10000))fail('invalid_weight','Use a positive package weight.');
    if(input.dimensions!==undefined&&(!input.dimensions||Object.keys(input.dimensions).sort().join()!=='height,length,width'||!Object.values(input.dimensions).every(n=>Number.isFinite(n)&&n>0&&n<=200)))fail('invalid_dimensions','Use positive length, width and height in inches.');
    if(input.note!==undefined&&!text(input.note))fail('invalid_note','Enter a valid note.');
    const id=randomUUID(),shipment={id,packageNumber:'PKG-'+randomUUID().slice(0,8).toUpperCase(),orderId:o.id,status:'draft',version:0,carrier:input.carrier,service:input.service,trackingNumber:input.trackingNumber,trackingUrl:url,items:input.items,createdAt:time,createdByUserId:principal.userId,trackingEnteredByUserId:principal.userId,...(input.weightOz?{weightOz:input.weightOz}:{}),...(input.dimensions?{dimensions:input.dimensions}:{})};s.shipments[id]=shipment;
    for(const item of input.items){const iid=randomUUID();s.shipmentItems[iid]={id:iid,shipmentId:id,...item};}
    audit(s,principal,'shipment-created',o.orderNumber,{packageNumber:shipment.packageNumber,note:input.note||''},time);return {saved:true,shipmentId:id};
   }
   if(input.action==='shipment-update'){
    schema(input,['shipmentId','carrier','service','trackingNumber','trackingUrl','expectedVersion'],['items']);const p=record(s.shipments,input.shipmentId);if(!p)fail('not_found','Package not found.',404);checkVersion(p,input.expectedVersion);const o=s.orders[p.orderId];
    if(!fulfillable(o)||!['draft','packed'].includes(p.status)||['cancelled','on_hold'].includes(initialFulfillment(o)))fail('not_ready','Only unshipped packages on active paid orders can be edited.',409);
    if(!text(input.carrier,80)||!text(input.service,80)||!text(input.trackingNumber,120))fail('invalid_shipment','Enter the carrier, service and tracking number.');const url=safeTrackingUrl(input.trackingUrl);
    if(input.items!==undefined){
     if(p.status!=='draft'||!Array.isArray(input.items)||!input.items.length||input.items.length>15)fail('invalid_shipment','Edit item allocations only while the package is a draft.');const seen=new Set();
     for(const item of input.items){if(!item||Object.keys(item).sort().join()!=='quantity,variantId'||seen.has(item.variantId)||!Number.isSafeInteger(item.quantity)||item.quantity<1)fail('invalid_shipment','Choose valid package quantities.');seen.add(item.variantId);const line=o.items.find(l=>l.variantId===item.variantId),allocated=Object.values(s.shipmentItems).filter(i=>i.shipmentId!==p.id&&s.shipments[i.shipmentId]?.orderId===o.id&&i.variantId===item.variantId).reduce((n,i)=>n+i.quantity,0);if(!line||allocated+item.quantity>line.quantity)fail('over_allocated','Package quantities exceed this order.',409);}
     for(const [id,item] of Object.entries(s.shipmentItems))if(item.shipmentId===p.id)delete s.shipmentItems[id];
     for(const item of input.items){const id=randomUUID();s.shipmentItems[id]={id,shipmentId:p.id,...item};}p.items=input.items;
    }
    Object.assign(p,{carrier:input.carrier,service:input.service,trackingNumber:input.trackingNumber,trackingUrl:url,version:version(p)+1,updatedAt:time,trackingEnteredByUserId:principal.userId});
    audit(s,principal,'shipment-updated',o.orderNumber,{packageNumber:p.packageNumber,version:p.version,itemsChanged:input.items!==undefined},time);return {saved:true};
   }
   if(input.action==='shipment-status'){
    schema(input,['shipmentId','status','expectedVersion'],['confirmed']);const p=record(s.shipments,input.shipmentId);if(!p)fail('not_found','Package not found.',404);checkVersion(p,input.expectedVersion);const o=s.orders[p.orderId];if(!fulfillable(o)||['cancelled','on_hold'].includes(initialFulfillment(o)))fail('not_ready','This order cannot be shipped.',409);
    if(!({draft:['packed'],packed:['shipped'],shipped:['delivered'],delivered:[]})[p.status]?.includes(input.status))fail('invalid_transition','That package transition is not allowed.',409);
    if(input.status==='shipped'&&initialFulfillment(o)!=='ready_to_ship'&&initialFulfillment(o)!=='shipped')fail('not_ready','Mark the order ready to ship first.',409);
    if(input.status==='delivered'&&input.confirmed!==true)fail('confirmation_required','Confirm that delivery was actually recorded.');
    const previous=p.status;p.status=input.status;p.version=version(p)+1;p[`${input.status}At`]=time;if(input.status==='packed')p.packedByUserId=principal.userId;
    const source=roleOf(principal)==='admin'?'manual-admin':'manual-employee';const tid=randomUUID();s.trackingEvents[tid]={id:tid,shipmentId:p.id,status:p.status,source,actorUserId:principal.userId,createdAt:time};
    audit(s,principal,'shipment-status',o.orderNumber,{previous,next:p.status,packageNumber:p.packageNumber,source},time);
    const packages=Object.values(s.shipments).filter(x=>x.orderId===o.id);
    const fullyAllocated=o.items.every(line=>Object.values(s.shipmentItems).filter(i=>s.shipments[i.shipmentId]?.orderId===o.id&&i.variantId===line.variantId).reduce((n,i)=>n+i.quantity,0)===line.quantity);
    if(fullyAllocated&&packages.every(x=>x.status==='delivered'))o.fulfillmentStatus='delivered';
    else if(fullyAllocated&&packages.every(x=>['shipped','delivered'].includes(x.status)))o.fulfillmentStatus='shipped';
    o.version=version(o)+1;
    if(['shipped','delivered'].includes(p.status))enqueueLifecycle(s,o,p.status,{shipment:p,now:time});return {saved:true,orderId:o.id};
   }
   fail('invalid_action','Select a supported action.');
  });
  if(result.orderId)await send({repository,orderId:result.orderId,env});
  const {orderId,...publicResult}=result;return publicResult;
 }
 async function refund(principal,input){
  schema(input,['orderNumber','amountCents','requestKey','confirmed']);
  if(input.confirmed!==true||!Number.isSafeInteger(input.amountCents)||input.amountCents<1||!/^[-a-f0-9]{36}$/i.test(input.requestKey||''))fail('invalid_refund','Confirm a valid refund amount.');
  if(env.COMMERCE_ENVIRONMENT==='production'&&env.PAYMENTS_ENABLED!=='true')fail('payments_disabled','Payments and refunds are disabled before launch.',503);
  const request=await repository.transaction(s=>{
   const existing=s.refundRequests[input.requestKey];if(existing){if(existing.orderNumber!==input.orderNumber||existing.amountCents!==input.amountCents)fail('request_conflict','Refund request has changed.',409);if(existing.status==='failed'){const o=s.orders[existing.orderId];const pending=Object.values(s.refundRequests).filter(r=>r.orderId===o.id&&['pending','manual-review'].includes(r.status)).reduce((n,r)=>n+r.amountCents,0);if(existing.amountCents+(o.refundedCents||0)+pending>o.totalCents)fail('invalid_refund','Refund exceeds the remaining paid amount.',409);existing.status='pending';audit(s,principal,'refund-retry',o.orderNumber,{amountCents:existing.amountCents},timestamp());}return existing;}
   const o=orderByNumber(s,input.orderNumber);if(!paid(o)||!o.paymentIntentId)fail('invalid_refund','A verified paid order is required.',409);
   const pending=Object.values(s.refundRequests).filter(r=>r.orderId===o.id&&['pending','manual-review'].includes(r.status)).reduce((n,r)=>n+r.amountCents,0);
   if(input.amountCents+(o.refundedCents||0)+pending>o.totalCents)fail('invalid_refund','Refund exceeds the remaining paid amount.',409);
   const r={id:input.requestKey,orderId:o.id,orderNumber:o.orderNumber,paymentIntentId:o.paymentIntentId,amountCents:input.amountCents,status:'pending',createdAt:timestamp(),actor:principal.userId,params:{payment_intent:o.paymentIntentId,amount:input.amountCents,metadata:{dbm_request_id:input.requestKey}}};s.refundRequests[r.id]=r;audit(s,principal,'refund-requested',o.orderNumber,{amountCents:r.amountCents},timestamp());return r;
  });
  if(request.status==='succeeded')return {saved:true};
  const age=now().getTime()-Date.parse(request.firstAttemptAt||request.createdAt);
  if((!Number.isFinite(age)||age>=23*3600000)&&!request.refundId){await repository.transaction(s=>{if(s.refundRequests[request.id].status!=='succeeded')s.refundRequests[request.id].status='manual-review';});fail('refund_reconciliation_required','This refund needs Stripe reconciliation before retrying. No new refund was issued.',409);}
  const claim=await repository.transaction(s=>{const r=s.refundRequests[request.id];r.firstAttemptAt??=timestamp();r.attemptCount=(r.attemptCount||0)+1;return r;});
  let response;
  try{const intent=await stripe.paymentIntents.retrieve(request.paymentIntentId);if(intent.livemode!==(env.COMMERCE_ENVIRONMENT==='production')||intent.currency!=='usd'||intent.status!=='succeeded')fail('refund_unverified','The original payment needs reconciliation.',409);response=request.refundId?await stripe.refunds.retrieve(request.refundId):await stripe.refunds.create(request.params||{payment_intent:request.paymentIntentId,amount:request.amountCents},{idempotencyKey:'dbm-refund-'+request.id});}
  catch(error){const confirmed=await repository.transaction(s=>{const r=s.refundRequests[request.id];if(r.status==='succeeded')return true;if(!claim.uncertain&&claim.attemptCount===1&&['StripeInvalidRequestError','StripeAuthenticationError','StripePermissionError'].includes(error.type))r.status='failed';else r.uncertain=true;return false;});if(confirmed)return {saved:true};fail('refund_unavailable','Refund could not be confirmed. Retry the same request.',503);}
  // Refund has no livemode field. Verify mode on the original PaymentIntent,
  // then verify the authoritative refund's currency, amount and payment binding.
  if(response.currency!=='usd'||response.payment_intent!==request.paymentIntentId||response.amount!==request.amountCents||!/^re_[A-Za-z0-9]+$/.test(response.id))fail('refund_unverified','Refund needs reconciliation.',409);
  if(response.status!=='succeeded'){const confirmed=await repository.transaction(s=>{const r=s.refundRequests[request.id];if(r.status==='succeeded')return true;r.refundId=response.id;r.status=response.status==='failed'||response.status==='canceled'?'failed':'pending';return false;});return confirmed?{saved:true}:{saved:false,status:response.status==='failed'||response.status==='canceled'?'failed':'pending'};}
  await repository.transaction(s=>{
   const r=s.refundRequests[request.id],o=s.orders[r.orderId];if(r.status==='succeeded')return;
   o.stripeRefundIds??=[];if(!o.stripeRefundIds.includes(response.id)){o.stripeRefundIds.push(response.id);o.refundedCents=(o.refundedCents||0)+response.amount;}
   o.refundStatus=o.refundedCents===o.totalCents?'full':'partial';if(o.refundStatus==='full')o.status='refunded';r.status='succeeded';r.refundId=response.id;
   audit(s,principal,'refund-confirmed',o.orderNumber,{amountCents:response.amount,refundId:response.id},timestamp());enqueueLifecycle(s,o,'refund',{eventKey:response.id,now:timestamp()});
  });
  await send({repository,orderId:request.orderId,env});return {saved:true};
 }
 return {read,mutate};
}
