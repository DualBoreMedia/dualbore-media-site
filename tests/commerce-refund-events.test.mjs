import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommerceService,transition} from '../netlify/commerce/service.mjs';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
const order={id:'order-fixture',orderNumber:'DBM-REFUND-QA',status:'paid',isTest:true,customerEmail:'fixture@example.invalid',paymentIntentId:'pi_fixture',subtotalCents:6000,shippingCents:700,taxCents:0,totalCents:6700,currency:'usd',items:[{variantId:'tee-m',name:'Synthetic Tee',size:'M',quantity:2,lineTotalCents:6000}]};
function fixture(){const repository=createMemoryRepository({orders:{[order.id]:structuredClone(order)},refundRequests:{request_fixture:{id:'request_fixture',orderId:order.id,orderNumber:order.orderNumber,amountCents:1000,status:'pending'}}});return {repository,service:createCommerceService({repository,stripe:{}})};}
const event=(type,object,id='evt_refundFixture')=>({id,type,livemode:false,data:{object}});
const refund={id:'re_Fixture',currency:'usd',payment_intent:'pi_fixture',amount:1000,status:'succeeded',metadata:{dbm_request_id:'request_fixture'}};

test('verified refund event and replay reconcile the durable request once without restocking',async()=>{
 const f=fixture();await f.service.webhook(event('refund.created',refund));await f.service.webhook(event('refund.updated',refund,'evt_refundUpdated'));
 const state=await f.repository.transaction(s=>s);assert.equal(state.orders[order.id].refundedCents,1000);assert.equal(state.orders[order.id].refundStatus,'partial');assert.deepEqual(state.orders[order.id].stripeRefundIds,['re_Fixture']);assert.equal(state.refundRequests.request_fixture.status,'succeeded');assert.equal(Object.values(state.audit).filter(a=>a.action==='refund-confirmed').length,1);assert.equal(Object.keys(state.emails).length,1);
 assert.equal(state.events.evt_refundFixture.status,'processed');assert.equal(Object.keys(state.reservations).length,0);
});

test('failed and pending refund notifications never reverse an already confirmed refund',async()=>{
 const f=fixture();assert.deepEqual(await f.service.webhook(event('refund.created',{...refund,status:'pending'})),{ignored:true});
 assert.equal(await f.repository.transaction(s=>s.refundRequests.request_fixture.status),'pending');
 await f.service.webhook(event('refund.failed',{...refund,status:'failed'}));assert.equal(await f.repository.transaction(s=>s.refundRequests.request_fixture.status),'failed');
 await f.service.webhook(event('refund.updated',refund));await f.service.webhook(event('refund.failed',{...refund,status:'canceled'},'evt_lateRefundFailure'));
 assert.equal(await f.repository.transaction(s=>s.refundRequests.request_fixture.status),'succeeded');
});

test('malformed refunds and payment references fail without writing verified events',async()=>{
 const f=fixture();for(const object of [null,{}, {...refund,currency:'eur'},{...refund,id:'invalid'}])await assert.rejects(f.service.webhook(event('refund.created',object)),{code:'invalid_event'});
 await assert.rejects(f.service.webhook(event('refund.created',{...refund,payment_intent:'pi_missing'})),{code:'unknown_order'});
 await assert.rejects(f.service.webhook(event('refund.created',{...refund,amount:10000})),{code:'invalid_refund'});
 for(const patch of [{paid:false},{currency:'eur'},{id:'invalid'},{payment_intent:null},{livemode:true}])await assert.rejects(f.service.webhook(event('charge.succeeded',{id:'ch_Fixture',livemode:false,paid:true,currency:'usd',payment_intent:'pi_fixture',amount:6700,...patch})),{code:'invalid_event'});
 assert.equal(await f.repository.transaction(s=>Object.keys(s.events).length),0);
});

test('configuration, transition and verified-refund validation fail closed',async()=>{
 const f=fixture();for(const env of [{SITE_ORIGIN:'https://remote.invalid'},{COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'http://localhost:4320'},{TEST_SHIPPING_RATE_CENTS:'-1'},{TEST_SHIPPING_RATE_CENTS:'1.5'}])assert.throws(()=>createCommerceService({repository:f.repository,stripe:{},env}));
 assert.equal(transition({status:'paid'},'paid'),false);assert.throws(()=>transition({status:'expired'},'paid'),{code:'invalid_transition'});
 for(const args of [{refundId:'invalid',amountCents:1},{refundId:'re_Test',amountCents:0},{refundId:'re_Test',amountCents:1.5}])await assert.rejects(f.service.recordVerifiedRefund(order.id,args),{code:'invalid_refund'});
 await assert.rejects(f.service.recordVerifiedRefund('missing',{refundId:'re_Test',amountCents:1}),{code:'invalid_refund'});
});
