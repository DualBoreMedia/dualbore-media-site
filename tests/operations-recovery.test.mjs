import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';

const admin={userId:'admin-fixture',email:'admin@example.invalid',admin:true,mfa:true,sessionId:'admin-session'};
const employee={userId:'employee-fixture',email:'staff@example.invalid',role:'employee',mfa:true,sessionId:'staff-session'};
const customer={userId:'customer-fixture',email:'customer@example.invalid'};
function setup(){
 const order={id:'order-fixture',orderNumber:'DBM-RECOVERY',status:'paid',fulfillmentStatus:'packing',version:0,createdAt:'2026-10-01T00:00:00Z',paidAt:'2026-10-01T00:00:00Z',customerEmail:customer.email,customerUserId:customer.userId,shippingName:'Synthetic Customer',shippingAddress:{line1:'Synthetic',country:'US',privateField:'must not escape'},paymentIntentId:'pi_fixture',sessionId:'cs_test_fixture',subtotalCents:6000,shippingCents:700,taxCents:0,totalCents:6700,items:[{variantId:'tee-m',sku:'TEE-M',name:'Synthetic Tee',size:'M',quantity:2,unitPriceCents:3000,lineTotalCents:6000}]};
 const repository=createMemoryRepository({orders:{[order.id]:order},variants:{'tee-m':{id:'tee-m',sku:'TEE-M',name:'Synthetic Tee',size:'M',availableQuantity:2,reservedQuantity:0,soldQuantity:2,active:true}}});
 const calls=[];const stripe={paymentIntents:{retrieve:async()=>({livemode:false,currency:'usd',status:'succeeded'})},refunds:{create:async(params,options)=>{calls.push({params,options});return {id:'re_Synthetic',currency:'usd',payment_intent:'pi_fixture',amount:params.amount,status:'succeeded'};},retrieve:async()=>({id:'re_Synthetic',currency:'usd',payment_intent:'pi_fixture',amount:1000,status:'succeeded'})},checkout:{sessions:{retrieve:async()=>({payment_status:'unpaid',status:'open'})}}};
 const service=createOperationsService({repository,stripe,now:()=>new Date('2026-10-19T00:00:00Z'),send:async()=>{},retryEmail:async()=>({status:'sent'})});
 return {repository,stripe,service,calls};
}
const draft={action:'shipment',orderNumber:'DBM-RECOVERY',carrier:'USPS',service:'Ground',trackingNumber:'SYNTHETIC',trackingUrl:'https://tools.usps.com/track',items:[{variantId:'tee-m',quantity:1}]};

test('admin attention aggregates actionable failures while customer and employee views minimize data',async()=>{
 const f=setup();await f.repository.transaction(s=>{
  s.emails.failed={id:'failed',orderId:'order-fixture',status:'failed',lastError:'provider detail'};
  s.emails.queued={id:'queued',status:'queued'};s.events.failed={status:'failed'};
  s.variants['tee-m'].reservedQuantity=-1;
  s.reservations.stale={status:'reserved',expiresAt:'2026-10-01T00:00:00Z',orderId:'order-fixture'};
  s.refundRequests.pending={status:'pending',orderNumber:'DBM-RECOVERY'};
  s.shipments.missing={id:'missing',orderId:'order-fixture',status:'shipped',items:[]};
  s.profiles.deletion={id:'deletion',deletionRequestedAt:'2026-10-01T00:00:00Z'};
 });
 const result=await f.service.read(admin,{admin:true,search:'SYNTHETIC',status:'paid',fulfillmentStatus:'packing',customer:'customer@',dateFrom:'2026-10-01',dateTo:'2026-10-19',shipmentStatus:'shipped',sort:'oldest',page:'invalid'});
 assert.equal(result.orders.length,1);assert.equal(result.pagination.page,1);
 for(const type of ['email','webhook','inventory','reservation','refund','shipment','account','fulfillment'])assert.ok(result.failures.some(f=>f.type===type),type);
 assert.ok(result.failures.every(f=>typeof f.safeMessage==='string'));
 assert.equal(result.overview.webhookFailures,1);
 const minimal=await f.service.read(employee,{staff:true,search:'SYNTHETIC',status:'paid',fulfillmentStatus:'packing',dateFrom:'2026-10-01',dateTo:'2026-10-19',shipmentStatus:'shipped',sort:'oldest',page:'bad'});
 assert.equal(minimal.orders.length,1);assert.equal(minimal.orders[0].customerEmail,undefined);assert.equal(minimal.orders[0].shippingAddress.privateField,undefined);assert.equal(minimal.orders[0].totalCents,undefined);
 assert.equal(minimal.failures,undefined);assert.equal((await f.service.read(customer)).failures,undefined);
 await assert.rejects(f.service.read(employee,{staff:true,orderNumber:'DBM-MISSING'}),{code:'not_found'});
 await assert.rejects(f.service.read(null),{code:'unauthorized'});
});

test('legacy shipment and hold projection preserve valid tracking and recoverable transitions',async()=>{
 const f=setup();await f.repository.transaction(s=>{Object.assign(s.orders['order-fixture'],{fulfillmentStatus:'on_hold',holdPreviousStatus:'packing',shippedAt:'2026-10-02T00:00:00Z',fulfilledAt:'2026-10-02T00:00:00Z',trackingUrl:'https://www.ups.com/track',carrier:'UPS',trackingNumber:'SYNTHETIC'});});
 let result=await f.service.read(admin,{admin:true});assert.deepEqual(result.orders[0].allowedTransitions,['packing','cancelled']);assert.equal(result.orders[0].shipments[0].packageNumber,'Earlier shipment');
 await f.repository.transaction(s=>{delete s.orders['order-fixture'].fulfillmentStatus;});
 result=await f.service.read(admin,{admin:true});assert.equal(result.orders[0].fulfillmentStatus,'shipped');
});

test('package allocation editing is versioned and cannot consume another package or order',async()=>{
 const f=setup();const first=await f.service.mutate(admin,draft),second=await f.service.mutate(admin,draft);
 const edit={action:'shipment-update',shipmentId:first.shipmentId,carrier:'UPS',service:'Ground',trackingNumber:'NEW',trackingUrl:'https://www.ups.com/track',expectedVersion:0,items:[{variantId:'tee-m',quantity:2}]};
 await assert.rejects(f.service.mutate(admin,edit),{code:'over_allocated'});
 await f.service.mutate(admin,{...edit,items:[{variantId:'tee-m',quantity:1}]});
 const state=await f.repository.transaction(s=>s);assert.equal(state.shipments[first.shipmentId].version,1);assert.equal(Object.values(state.shipmentItems).filter(i=>i.shipmentId===second.shipmentId).length,1);
 await assert.rejects(f.service.mutate(admin,edit),{code:'stale_record'});
 await f.service.mutate(employee,{action:'shipment-status',shipmentId:first.shipmentId,status:'packed',expectedVersion:1});
 await assert.rejects(f.service.mutate(admin,{...edit,expectedVersion:2}),{code:'invalid_shipment'});
 await f.service.mutate(admin,{...edit,expectedVersion:2,items:undefined});
 await f.repository.transaction(s=>{s.orders['order-fixture'].fulfillmentStatus='on_hold';});
 await assert.rejects(f.service.mutate(admin,{...edit,expectedVersion:3}),{code:'not_ready'});
});

test('malformed package metadata is rejected without changing allocations',async()=>{
 const f=setup();for(const [patch,code] of [
  [{carrier:''},'invalid_shipment'],[{trackingUrl:'https://user:pass@example.com'},'invalid_tracking'],[{items:[]},'invalid_shipment'],
  [{items:[{variantId:'tee-m',quantity:1},{variantId:'tee-m',quantity:1}]},'invalid_shipment'],[{items:[{variantId:'tee-m',quantity:0}]},'invalid_shipment'],
  [{weightOz:0},'invalid_weight'],[{weightOz:10001},'invalid_weight'],[{dimensions:{length:1,width:2}},'invalid_dimensions'],[{dimensions:{length:1,width:2,height:0}},'invalid_dimensions'],[{note:''},'invalid_note'],
 ])await assert.rejects(f.service.mutate(admin,{...draft,...patch}),{code});
 assert.equal(await f.repository.transaction(s=>Object.keys(s.shipments).length),0);
 const packageResult=await f.service.mutate(admin,{...draft,weightOz:12,dimensions:{length:12,width:8,height:2},note:'Synthetic package'});
 const payload={action:'shipment-update',shipmentId:packageResult.shipmentId,carrier:'USPS',service:'Ground',trackingNumber:'NEW',trackingUrl:'https://usps.com/track',expectedVersion:0};
 for(const items of [[],[{variantId:'tee-m',quantity:-1}],[{variantId:'tee-m',quantity:1},{variantId:'tee-m',quantity:1}]])await assert.rejects(f.service.mutate(admin,{...payload,items}),{code:'invalid_shipment'});
 await assert.rejects(f.service.mutate(admin,{...payload,carrier:''}),{code:'invalid_shipment'});
});

test('reconciliation and retry never invent provider success',async()=>{
 const f=setup();assert.deepEqual(await f.service.mutate(admin,{action:'reconcile',orderNumber:'DBM-RECOVERY'}),{saved:false,status:'pending'});
 f.stripe.checkout.sessions.retrieve=async()=>{throw Error('provider failure');};
 await assert.rejects(f.service.mutate(admin,{action:'reconcile',orderNumber:'DBM-RECOVERY'}),{code:'provider_unavailable'});
 await f.repository.transaction(s=>{delete s.orders['order-fixture'].sessionId;s.emails.failed={id:'failed',orderId:'order-fixture',status:'failed'};s.emails.review={id:'review',status:'manual-review'};});
 await assert.rejects(f.service.mutate(admin,{action:'reconcile',orderNumber:'DBM-RECOVERY'}),{code:'reconciliation_required'});
 assert.deepEqual(await f.service.mutate(admin,{action:'retry-email',eventId:'failed'}),{result:{status:'sent'}});
 for(const eventId of ['review','missing',''])await assert.rejects(f.service.mutate(admin,{action:'retry-email',eventId}),{code:'invalid_email'});
});

test('refund retries retrieve a pending provider refund rather than creating another',async()=>{
 const f=setup();f.stripe.refunds.create=async(params,options)=>{f.calls.push({params,options});return {id:'re_Synthetic',currency:'usd',payment_intent:'pi_fixture',amount:1000,status:'pending'};};
 const input={action:'refund',orderNumber:'DBM-RECOVERY',amountCents:1000,requestKey:randomUUID(),confirmed:true};
 assert.deepEqual(await f.service.mutate(admin,input),{saved:false,status:'pending'});
 assert.deepEqual(await f.service.mutate(admin,input),{saved:true});assert.equal(f.calls.length,1);
 const order=await f.repository.transaction(s=>s.orders['order-fixture']);assert.equal(order.refundedCents,1000);assert.equal(order.refundStatus,'partial');
});

test('refund definitive rejection can retry but ambiguous old refunds require manual review',async()=>{
 const f=setup();const input={action:'refund',orderNumber:'DBM-RECOVERY',amountCents:1000,requestKey:randomUUID(),confirmed:true};
 f.stripe.refunds.create=async()=>{throw Object.assign(Error('synthetic rejection'),{type:'StripeInvalidRequestError'});};
 await assert.rejects(f.service.mutate(admin,input),{code:'refund_unavailable'});assert.equal(await f.repository.transaction(s=>s.refundRequests[input.requestKey].status),'failed');
 f.stripe.refunds.create=async params=>({id:'re_Retry',currency:'usd',payment_intent:'pi_fixture',amount:params.amount,status:'succeeded'});
 assert.deepEqual(await f.service.mutate(admin,input),{saved:true});
 const another={...input,requestKey:randomUUID()};await f.repository.transaction(s=>{s.refundRequests[another.requestKey]={id:another.requestKey,orderId:'order-fixture',orderNumber:'DBM-RECOVERY',paymentIntentId:'pi_fixture',amountCents:1000,status:'pending',createdAt:'2026-10-01T00:00:00Z'};});
 await assert.rejects(f.service.mutate(admin,another),{code:'refund_reconciliation_required'});assert.equal(await f.repository.transaction(s=>s.refundRequests[another.requestKey].status),'manual-review');
});

test('invalid support, consent and unsupported actions do not write records',async()=>{
 const f=setup();for(const input of [null,[],{}, {action:1}])await assert.rejects(f.service.mutate(admin,input),{code:'invalid_input'});
 await assert.rejects(f.service.mutate(null,{action:'note'}),{code:'unauthorized'});
 await assert.rejects(f.service.mutate(admin,{action:'unknown'}),{code:'invalid_action'});
 for(const input of [{action:'support',category:'unknown',message:'Synthetic request'},{action:'support',category:'order',message:'\u0000'}])await assert.rejects(f.service.mutate(customer,input),{code:'invalid_support'});
 await assert.rejects(f.service.mutate(customer,{action:'preferences',marketingConsent:'yes'}),{code:'invalid_consent'});
 await f.service.mutate(customer,{action:'deletion-request'});await assert.rejects(f.service.mutate(customer,{action:'preferences',marketingConsent:true}),{code:'deletion_pending'});
 await assert.rejects(f.service.mutate(admin,{action:'support-status',ticketNumber:'missing',status:'resolved',note:'Synthetic',expectedVersion:0}),{code:'not_found'});
});

test('ordered queues, private notes and multi-ticket sorting use stable projections',async()=>{
 const f=setup();await f.repository.transaction(s=>{s.orders.second={...structuredClone(s.orders['order-fixture']),id:'second',orderNumber:'DBM-SECOND',createdAt:'2026-10-02T00:00:00Z'};});
 await f.service.mutate(admin,{action:'note',orderNumber:'DBM-RECOVERY',note:'Private synthetic note'});
 await f.service.mutate(customer,{action:'support',category:'general',message:'First synthetic request'});await f.service.mutate(customer,{action:'support',category:'shipping',message:'Second synthetic request'});
 for(const principal of [admin,employee])for(const sort of ['newest','oldest']){
  const result=await f.service.read(principal,{...(principal===admin?{admin:true}:{staff:true}),sort});assert.equal(result.orders[0].orderNumber,sort==='newest'?'DBM-SECOND':'DBM-RECOVERY');
 }
 const result=await f.service.read(admin,{admin:true});assert.equal(result.supportTickets.length,2);assert.equal(result.orders.find(o=>o.orderNumber==='DBM-RECOVERY').notes[0].text,'Private synthetic note');
 await assert.rejects(f.service.mutate(admin,{action:'note',orderNumber:'DBM-RECOVERY',note:''}),{code:'invalid_note'});
 for(const number of ['','DBM-MISSING'])await assert.rejects(f.service.mutate(admin,{action:'note',orderNumber:number,note:'Synthetic'}),{code:'not_found'});
 const ticket=result.supportTickets[0];await assert.rejects(f.service.mutate(admin,{action:'support-status',ticketNumber:ticket.ticketNumber,status:'invalid',note:'Synthetic',expectedVersion:0}),{code:'invalid_support'});
});

test('package and order guards reject held, corrupt, prematurely shipped and cancelled fulfillment',async()=>{
 const f=setup();const p=await f.service.mutate(admin,draft);
 await assert.rejects(f.service.mutate(admin,{action:'shipment-status',shipmentId:p.shipmentId,status:'delivered',expectedVersion:0}),{code:'invalid_transition'});
 await f.service.mutate(employee,{action:'shipment-status',shipmentId:p.shipmentId,status:'packed',expectedVersion:0});
 await assert.rejects(f.service.mutate(employee,{action:'shipment-status',shipmentId:p.shipmentId,status:'shipped',carrierAccepted:true,expectedVersion:1}),{code:'not_ready'});
 await assert.rejects(f.service.mutate(admin,{action:'shipment-update',shipmentId:'missing',carrier:'UPS',service:'Ground',trackingNumber:'Synthetic',trackingUrl:'https://ups.com',expectedVersion:0}),{code:'not_found'});
 await f.repository.transaction(s=>{s.orders['order-fixture'].fulfillmentStatus='on_hold';});
 await assert.rejects(f.service.mutate(employee,{action:'shipment-status',shipmentId:p.shipmentId,status:'shipped',carrierAccepted:true,expectedVersion:1}),{code:'not_ready'});
 await f.repository.transaction(s=>{s.orders['order-fixture'].fulfillmentStatus='packing';s.shipments[p.shipmentId].status='shipped';});
 await assert.rejects(f.service.mutate(admin,{action:'transition',orderNumber:'DBM-RECOVERY',status:'cancelled',expectedVersion:1,confirmed:true,note:'Synthetic cancellation'}),{code:'already_shipped'});
 await assert.rejects(f.service.mutate(admin,{action:'transition',orderNumber:'DBM-RECOVERY',status:'ready_to_ship',expectedVersion:1,note:''}),{code:'invalid_note'});
 await f.repository.transaction(s=>{s.shipmentItems={};});
 await assert.rejects(f.service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-RECOVERY',shipmentId:p.shipmentId}),{code:'invalid_package'});
 await f.repository.transaction(s=>{s.shipmentItems.corrupt={shipmentId:p.shipmentId,variantId:'tee-m',quantity:0};});
 await assert.rejects(f.service.mutate(employee,{action:'packing-slip',orderNumber:'DBM-RECOVERY',shipmentId:p.shipmentId}),{code:'invalid_package'});
});

test('refund mode, binding and full-refund limits reject unverified changes',async()=>{
 for(const kind of ['mode','binding','uncertain','full']){
  const f=setup(),input={action:'refund',orderNumber:'DBM-RECOVERY',amountCents:kind==='full'?6700:1000,requestKey:randomUUID(),confirmed:true};
  if(kind==='mode')f.stripe.paymentIntents.retrieve=async()=>({livemode:true,currency:'usd',status:'succeeded'});
  if(kind==='binding')f.stripe.refunds.create=async()=>({id:'re_Wrong',currency:'usd',payment_intent:'pi_other',amount:1000,status:'succeeded'});
  if(kind==='uncertain')f.stripe.refunds.create=async()=>{throw Error('network ambiguity');};
  if(kind==='full'){await f.service.mutate(admin,input);assert.equal(await f.repository.transaction(s=>s.orders['order-fixture'].status),'refunded');}
  else await assert.rejects(f.service.mutate(admin,input),{code:kind==='binding'?'refund_unverified':'refund_unavailable'});
  if(kind==='uncertain')assert.equal(await f.repository.transaction(s=>s.refundRequests[input.requestKey].uncertain),true);
 }
 const f=setup();for(const patch of [{confirmed:false},{amountCents:0},{requestKey:'invalid'}])await assert.rejects(f.service.mutate(admin,{action:'refund',orderNumber:'DBM-RECOVERY',amountCents:1000,requestKey:randomUUID(),confirmed:true,...patch}),{code:'invalid_refund'});
 await f.repository.transaction(s=>{s.orders['order-fixture'].status='checkout_pending';});
 await assert.rejects(f.service.mutate(admin,{action:'refund',orderNumber:'DBM-RECOVERY',amountCents:1000,requestKey:randomUUID(),confirmed:true}),{code:'invalid_refund'});
});
