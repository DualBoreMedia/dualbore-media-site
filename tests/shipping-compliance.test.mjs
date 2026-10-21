import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedShippingCalendar,captureShippingPromise,shippingReview,assertCarrierHandoff,changeShippingDelay} from '../netlify/operations/shipping-compliance.mjs';
import {shippingCommitment,shippingDelayNotice} from '../src/business.js';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';

// Explicit synthetic calendar, never an assertion about the owner's calendar.
const calendar={timeZone:'America/New_York',weekdays:[1,2,3,4,5],holidays:['2026-10-12'],reviewedThrough:'2026-12-31'};
const env={SHIPPING_CALENDAR_APPROVED:'true',SHIPPING_BUSINESS_CALENDAR:JSON.stringify(calendar)};
const clock='2026-10-13T14:00:00.000Z';
function order(){const o={id:'o',orderNumber:'DBM-DELAY-TEST',status:'paid',isTest:true,version:0,fulfillmentStatus:'making',paidAt:'2026-10-09T23:59:00.000Z',createdAt:'2026-10-09T23:59:00.000Z',totalCents:5995,shippingCents:995,taxCents:0,items:[]};o.shippingPromise=captureShippingPromise(o,env);return o;}
function notice(overrides={}){const input={operation:'notice',reason:'Verified blank supply delay',basis:'Supplier confirmed replacement stock',reference:'synthetic-message-id',revisedShipDate:'2026-10-20',sentAt:'2026-10-13T13:00:00.000Z',replyBy:'2026-10-14T16:00:00.000Z',confirmed:true,...overrides};input.noticeText=shippingDelayNotice({orderNumber:'DBM-DELAY-TEST',timeZone:calendar.timeZone,...input});return input;}
const state=()=>({shipments:{}});
test('business-day promise requires an explicit calendar, respects its holidays/timezone, and never treats transit as processing',()=>{
 assert.equal(shippingCommitment.businessDays,5);assert.match(shippingCommitment.processing,/5 business days after payment confirmation/);assert.match(shippingCommitment.processing,/transit time is additional/);
 assert.equal(order().shippingPromise.dueDate,'2026-10-19');
 for(const c of [null,{}, {...calendar,timeZone:'invalid'}, {...calendar,weekdays:[]},{...calendar,weekdays:[1,1]},{...calendar,weekdays:[7]},{...calendar,holidays:['2026-02-30']},{...calendar,reviewedThrough:'wrong'}])assert.equal(approvedShippingCalendar({...env,SHIPPING_BUSINESS_CALENDAR:JSON.stringify(c)}),null);
 assert.equal(approvedShippingCalendar({...env,SHIPPING_BUSINESS_CALENDAR:'{'}),null);assert.equal(approvedShippingCalendar({}),null);
 assert.equal(captureShippingPromise({...order(),paidAt:'invalid'},env).verified,false);
 assert.equal(captureShippingPromise({...order(),paymentTimestampVerified:false},env).verified,false);
 assert.equal(captureShippingPromise(order(),{...env,SHIPPING_BUSINESS_CALENDAR:JSON.stringify({...calendar,reviewedThrough:'2026-10-14'})}).verified,false);
 assert.equal(captureShippingPromise(order(),{...env,SHIPPING_BUSINESS_CALENDAR:JSON.stringify({...calendar,weekdays:[0],holidays:['2026-10-11','2026-10-18','2026-10-25','2026-11-01','2026-11-08','2026-11-15']})}).verified,false);
 const midnight=captureShippingPromise({...order(),paidAt:'2026-10-10T02:00:00Z'},env);assert.equal(midnight.dueDate,'2026-10-19');
});
test('review and handoff distinguish a label from physical shipment and surface expired/unverified promises',()=>{
 const o=order();assert.equal(shippingReview(o,clock).status,'upcoming');assert.equal(shippingReview(o,'2026-10-19T16:00:00Z').status,'due_today');assert.equal(shippingReview(o,'2026-10-20T16:00:00Z').status,'cancel_refund_due');
 assert.throws(()=>assertCarrierHandoff(o,{},clock),{code:'carrier_handoff_required'});assert.doesNotThrow(()=>assertCarrierHandoff(o,{carrierAccepted:true},clock));
 assert.throws(()=>assertCarrierHandoff(o,{carrierAccepted:true},'2026-10-20T16:00:00Z'),{code:'shipping_review_required'});
 assert.equal(shippingReview({...o,shippingPromise:null},clock).status,'calendar_unconfirmed');
 assert.throws(()=>assertCarrierHandoff({...o,shippingPromise:null},{carrierAccepted:true},clock,{COMMERCE_ENVIRONMENT:'production'}));
 for(const patch of [{status:'refunded'},{status:'payment_pending'},{refundStatus:'full'},{fulfillmentStatus:'on_hold'},{fulfillmentStatus:'cancelled'}])assert.throws(()=>assertCarrierHandoff({...o,...patch},{carrierAccepted:true},clock));
 for(const fulfillmentStatus of ['shipped','delivered'])assert.equal(shippingReview({...o,fulfillmentStatus},clock).status,'shipped');
 assert.equal(shippingReview({...o,status:'refunded'},clock).status,'closed');assert.equal(shippingReview({...o,fulfillmentStatus:'cancelled'},clock).status,'refund_required');assert.equal(shippingReview({...o,status:'expired',fulfillmentStatus:'cancelled'},clock).status,'closed');assert.equal(shippingReview({...o,refundedCents:o.totalCents,fulfillmentStatus:'cancelled'},clock).status,'closed');
});
test('delay requires complete notice, supported revised date, timely choices and actual evidence',()=>{
 const bad=[{confirmed:false},{reason:''},{basis:''},{reference:''},{revisedShipDate:'2026-10-14'},{revisedShipDate:'2026-10-17'},{revisedShipDate:'2027-01-01'},{sentAt:'2026-10-14T00:00:00Z'},{sentAt:'2026-10-08T00:00:00Z'},{replyBy:'2026-10-20T05:00:00Z'},{replyBy:'2026-10-13T12:00:00Z'}];
 for(const b of bad)assert.throws(()=>changeShippingDelay(state(),order(),notice(b),clock),{code:'invalid_delay_notice'},JSON.stringify(b));
 assert.throws(()=>changeShippingDelay(state(),order(),{...notice(),noticeText:'Please wait.'},clock),{code:'invalid_delay_notice'});
 assert.throws(()=>changeShippingDelay(state(),{...order(),shippingPromise:null},notice(),clock));
 assert.throws(()=>changeShippingDelay(state(),{...order(),status:'payment_pending'},notice(),clock));
 const o=order();changeShippingDelay(state(),o,notice(),clock);assert.equal(o.fulfillmentStatus,'on_hold');assert.equal(shippingReview(o,clock).status,'awaiting_consent');assert.match(o.shipmentDelay.noticeText,/silence as consent/);assert.match(o.shipmentDelay.noticeText,/before actual shipment even after agreeing/);
 assert.throws(()=>assertCarrierHandoff(o,{carrierAccepted:true},clock));
});
test('only a recorded affirmative response before the deadline extends the promise; cancellation remains available',()=>{
 const o=order();changeShippingDelay(state(),o,notice(),clock);
 const reply={operation:'response',decision:'consent',receivedAt:clock,reference:'actual-customer-reply'};
 for(const b of [{decision:'silence'},{reference:''},{receivedAt:'wrong'},{receivedAt:'2026-10-13T12:00:00Z'},{receivedAt:'2026-10-14T12:00:00Z'}])assert.throws(()=>changeShippingDelay(state(),structuredClone(o),{...reply,...b},clock),{code:'invalid_delay_response'});
 assert.throws(()=>changeShippingDelay(state(),structuredClone(o),reply,'2026-10-14T17:00:00Z'),{code:'invalid_delay_response'});
 changeShippingDelay(state(),o,reply,clock);assert.equal(o.fulfillmentStatus,'making');assert.equal(shippingReview(o,'2026-10-20T16:00:00Z').status,'due_today');assert.throws(()=>changeShippingDelay(state(),o,reply,clock));
 const repeated=structuredClone(o);changeShippingDelay(state(),repeated,notice({revisedShipDate:'2026-10-21'}),clock);assert.equal(repeated.shipmentDelay.history[0].status,'consented');assert.equal(repeated.shipmentDelay.history[0].responseReference,'actual-customer-reply');
 assert.throws(()=>changeShippingDelay(state(),structuredClone(o),{...reply,decision:'cancel'},clock),{code:'confirmation_required'});
 changeShippingDelay(state(),o,{...reply,decision:'cancel',confirmed:true},clock);assert.equal(o.fulfillmentStatus,'cancelled');assert.equal(o.shipmentDelay.refundAmountCents,5995);assert.equal(o.shipmentDelay.status,'refund_required');assert.equal(shippingReview(o,clock).status,'refund_required');
});
test('unanswered or missed deadlines cancel unshipped orders with full remaining refund; split shipments require reviewed allocation',()=>{
 assert.throws(()=>changeShippingDelay(state(),order(),{operation:'review'},'2026-10-20T16:00:00Z'),{code:'confirmation_required'});
 const o=order();changeShippingDelay(state(),o,notice(),clock);assert.throws(()=>changeShippingDelay(state(),o,{operation:'review',confirmed:true},clock));
 assert.equal(shippingReview(o,'2026-10-14T16:00:00Z').status,'cancel_refund_due');changeShippingDelay(state(),o,{operation:'review',confirmed:true},'2026-10-14T16:00:00Z');assert.equal(o.shipmentDelay.refundAmountCents,5995);assert.throws(()=>assertCarrierHandoff(o,{carrierAccepted:true},clock));
 const split=order();split.refundedCents=1000;changeShippingDelay({shipments:{p:{orderId:'o',status:'shipped'}}},split,{operation:'review',confirmed:true},'2026-10-20T16:00:00Z');assert.equal(split.fulfillmentStatus,'on_hold');assert.equal(split.shipmentDelay.partial,true);assert.equal(split.shipmentDelay.refundAmountCents,null);assert.equal(shippingReview(split,clock).status,'refund_required');
 const expired=order();expired.refundedCents=1000;changeShippingDelay(state(),expired,{operation:'review',confirmed:true},'2026-10-20T16:00:00Z');assert.equal(expired.shipmentDelay.refundAmountCents,4995);
 assert.throws(()=>changeShippingDelay(state(),order(),{operation:'unknown'},clock));
});
test('delay actions are admin/MFA-only, versioned, persisted, audited, private and never send email',async()=>{
 const repository=createMemoryRepository({orders:{o:order()}});let sends=0;const service=createOperationsService({repository,now:()=>new Date(clock),send:async()=>sends++});const admin={userId:'a',admin:true,mfa:true,email:'a@example.invalid',sessionId:'s'};
 const input={action:'shipping-delay',orderNumber:'DBM-DELAY-TEST',expectedVersion:0,...notice()};
 for(const principal of [{...admin,admin:false,role:'employee'},{...admin,mfa:false}])await assert.rejects(service.mutate(principal,input));
 await service.mutate(admin,input);await assert.rejects(service.mutate(admin,input),{code:'stale_record'});
 const saved=await repository.transaction(s=>s);assert.equal(saved.orders.o.version,1);assert.equal(saved.orders.o.shipmentDelay.status,'awaiting_consent');assert.equal(Object.values(saved.audit).filter(a=>a.action==='shipping-delay').length,1);assert.equal(sends,0);assert.equal(Object.keys(saved.emails).length,0);
 const dashboard=await service.read(admin,{admin:true});assert.ok(dashboard.failures.some(f=>f.type==='shipment_delay'));assert.equal(dashboard.orders[0].shippingDelay.basis,notice().basis);
 assert.deepEqual(dashboard.orders[0].allowedTransitions,[]);
 await repository.transaction(s=>{s.orders.o.holdPreviousStatus='making';});
 for(const status of ['making','cancelled'])await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:input.orderNumber,status,expectedVersion:1,confirmed:true,note:'Generic bypass attempt'}),{code:'shipping_review_required'});
 await service.mutate(admin,{action:'shipping-delay',operation:'response',decision:'cancel',confirmed:true,receivedAt:clock,reference:'actual-cancel',orderNumber:input.orderNumber,expectedVersion:1});const cancelled=await service.read(admin,{admin:true});assert.equal(cancelled.orders[0].shippingReview.status,'refund_required');assert.ok(cancelled.failures.some(f=>f.type==='shipment_delay'&&f.status==='refund_required'));
});

test('consented and expired delays cannot bypass the dedicated cancellation/refund path through generic fulfillment controls',async()=>{
 let at=clock;const o=order();changeShippingDelay(state(),o,notice(),clock);const repository=createMemoryRepository({orders:{o}}),service=createOperationsService({repository,now:()=>new Date(at)}),admin={userId:'a',admin:true,mfa:true,email:'a@example.invalid'};
 await service.mutate(admin,{action:'shipping-delay',operation:'response',orderNumber:o.orderNumber,expectedVersion:0,decision:'consent',receivedAt:clock,reference:'customer-consent'});
 const dashboard=await service.read(admin,{admin:true});assert.ok(!dashboard.orders[0].allowedTransitions.includes('cancelled'));assert.ok(dashboard.orders[0].allowedTransitions.includes('packing'));
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:o.orderNumber,expectedVersion:1,status:'cancelled',confirmed:true,note:'Generic cancel bypass'}),{code:'shipping_review_required'});
 await service.mutate(admin,{action:'transition',orderNumber:o.orderNumber,expectedVersion:1,status:'packing'});
 at='2026-10-21T16:00:00Z';await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:o.orderNumber,expectedVersion:2,status:'ready_to_ship'}),{code:'shipping_review_required'});
});

test('Needs Attention excludes expired unpaid checkouts from overdue fulfillment work',async()=>{
 const repository=createMemoryRepository({orders:{o:order(),unpaid:{...order(),id:'unpaid',orderNumber:'DBM-UNPAID',status:'expired',fulfillmentStatus:undefined,shippingPromise:undefined}}});const service=createOperationsService({repository,now:()=>new Date('2026-10-20T14:00:00Z')});const dashboard=await service.read({userId:'a',admin:true,mfa:true,email:'a@example.invalid'},{admin:true});assert.ok(dashboard.failures.some(f=>f.type==='fulfillment'&&f.orderNumber==='DBM-DELAY-TEST'));assert.ok(!dashboard.failures.some(f=>f.type==='fulfillment'&&f.orderNumber==='DBM-UNPAID'));
});

test('ordinary merchant cancellation of an unshipped paid order also keeps the refund review visible',async()=>{
 const o=order();delete o.shippingPromise;const repository=createMemoryRepository({orders:{o}}),service=createOperationsService({repository,now:()=>new Date(clock)}),admin={userId:'a',admin:true,mfa:true,email:'a@example.invalid'};
 await service.mutate(admin,{action:'transition',orderNumber:o.orderNumber,status:'cancelled',note:'Cannot obtain suitable blanks',confirmed:true,expectedVersion:0});
 const result=await service.read(admin,{admin:true});assert.equal(result.orders[0].shippingReview.status,'refund_required');assert.ok(result.failures.some(f=>f.type==='shipment_delay'&&f.status==='refund_required'));
});

test('production checkout rejects an expired or too-short calendar horizon before touching Stripe or reserving inventory',async()=>{
 const approval=Object.fromEntries(['LIVE_CATALOG_APPROVED','SHIPPING_CONFIGURATION_APPROVED','TAX_CONFIGURATION_APPROVED','POLICIES_APPROVED','FULFILLMENT_CAPACITY_VERIFIED','SHIPPING_DELAY_WORKFLOW_VERIFIED','BUSINESS_ADDRESS_CONFIRMED','APPAREL_LABELS_VERIFIED','ARTWORK_RIGHTS_VERIFIED'].map(k=>[k,'true']));
 for(const reviewedThrough of ['2026-10-01','2026-10-14']){
  const repository=createMemoryRepository();let calls=0;const stripe={checkout:{sessions:{create:()=>{calls++;throw Error('No provider call allowed');}}}};
  const service=createCommerceService({repository,stripe,now:()=>Date.parse(clock),env:{...env,...approval,SITE_ORIGIN:'https://site.invalid',COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'true',SHIPPING_BUSINESS_CALENDAR:JSON.stringify({...calendar,reviewedThrough})}});
  await assert.rejects(service.checkout({items:[{variantId:'tee-m',quantity:1}]}),{code:'payments_disabled'});assert.equal(calls,0);assert.equal(await repository.transaction(s=>Object.keys(s.orders).length),0);
 }
});
