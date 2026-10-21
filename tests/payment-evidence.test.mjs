import test from 'node:test';import assert from 'node:assert/strict';
import {originalPaidEvent} from '../netlify/operations/payment-evidence.mjs';
import {shippingDelayNotice} from '../src/business.js';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
const order={id:'qa',orderNumber:'DBM-PAID-EVIDENCE',sessionId:'cs_test_evidence123',status:'checkout_pending',createdAt:'2026-10-12T12:00:00Z',currency:'usd',subtotalCents:3000,shippingCents:700,totalCents:3700,items:[]};
const at=()=>Date.parse('2026-10-13T12:00:00Z');
function event(){return {id:'evt_original_paid',type:'checkout.session.completed',livemode:false,created:Date.parse(order.createdAt)/1000,data:{object:{id:order.sessionId,livemode:false,metadata:{order_id:order.id},payment_status:'paid',currency:'usd',amount_subtotal:3000,amount_total:3700,total_details:{amount_shipping:700,amount_tax:0},customer_details:{email:'synthetic@example.invalid'},collected_information:{shipping_details:{name:'Synthetic',address:{country:'US'}}},payment_intent:'pi_evidence'}}};}
test('provider payment evidence paginates, ignores unrelated/unpaid events, and chooses the earliest verified paid event',async()=>{
 const original=event(),calls=[];const stripe={events:{list:async p=>{calls.push(p);return p.starting_after?{data:[original],has_more:false}:{data:[{id:'evt_unrelated',data:{object:{id:'other'}}},{...original,id:'evt_pending',data:{object:{...original.data.object,payment_status:'unpaid'}}},{...original,id:'evt_later',created:original.created+60}],has_more:true};}}};
 assert.equal((await originalPaidEvent(stripe,order,{live:false,now:at})).id,original.id);assert.equal(calls[1].starting_after,'evt_later');assert.deepEqual(calls[0].types,['checkout.session.completed','checkout.session.async_payment_succeeded']);
 assert.equal(await originalPaidEvent({},order,{live:false,now:at}),null);await assert.rejects(originalPaidEvent({},order,{live:true,now:at}),{code:'payment_time_unverified'});
});
test('missing, mismatched, future, looping and unavailable provider evidence never invents a payment timestamp',async()=>{
 for(const patch of [{livemode:true},{type:'checkout.session.expired'},{created:1},{created:at()/1000+1},{id:'bad'}]){
  await assert.rejects(originalPaidEvent({events:{list:async()=>({data:[{...event(),...patch}],has_more:false})}},order,{live:false,now:at}),{code:'payment_time_unverified'});
 }
 for(const list of [async()=>({data:[],has_more:false}),async()=>({data:null}),async()=>{throw Error('private provider error');},async()=>({data:[],has_more:true}),async()=>({data:[{id:'evt_same'}],has_more:true})])await assert.rejects(originalPaidEvent({events:{list}},order,{live:false,now:at}),{code:'payment_time_unverified'});
 let n=0;await assert.rejects(originalPaidEvent({events:{list:async()=>({data:[{id:'evt_'+(++n)}],has_more:true})}},order,{live:false,now:at}));assert.equal(n,20);
 await assert.rejects(originalPaidEvent({events:{list:async()=>{throw Error('must not be called');}}},{...order,createdAt:'invalid'},{live:false,now:at}));
});
test('admin reconciliation preserves the original payment deadline and repairs an older unverified promise without re-selling or duplicate email',async()=>{
 const repository=createMemoryRepository({orders:{qa:structuredClone(order)}}),original=event();const stripe={checkout:{sessions:{retrieve:async()=>original.data.object}},events:{list:async()=>({data:[original],has_more:false})}};
 const env={SHIPPING_CALENDAR_APPROVED:'true',SHIPPING_BUSINESS_CALENDAR:JSON.stringify({timeZone:'America/New_York',weekdays:[1,2,3,4,5],holidays:[],reviewedThrough:'2026-12-31'})};
 const service=createOperationsService({repository,stripe,env,now:()=>new Date(at()),send:async()=>{throw Error('No delivery allowed');}}),admin={userId:'a',admin:true,mfa:true,email:'a@example.invalid'};
 await service.mutate(admin,{action:'reconcile',orderNumber:order.orderNumber});let o=await repository.transaction(s=>s.orders.qa);assert.equal(o.paidAt,'2026-10-12T12:00:00.000Z');assert.equal(o.shippingPromise.dueDate,'2026-10-19');
 await repository.transaction(s=>{s.orders.qa.paymentTimestampVerified=false;s.orders.qa.shippingPromise.verified=false;});
 await service.mutate(admin,{action:'reconcile',orderNumber:order.orderNumber});o=await repository.transaction(s=>s.orders.qa);assert.equal(o.paymentTimestampVerified,true);assert.equal(o.shippingPromise.verified,true);assert.equal(o.version,1);
 const state=await repository.transaction(s=>s);assert.equal(Object.keys(state.events).length,1);assert.equal(Object.values(state.audit).filter(a=>a.action==='payment').length,1);
 await repository.transaction(s=>{s.orders.qa.paymentTimestampVerified=false;s.orders.qa.paymentIntentId='pi_other';});await assert.rejects(service.mutate(admin,{action:'reconcile',orderNumber:order.orderNumber}),{code:'payment_time_unverified'});
});
test('customer delay deadline states an understandable date, time, offset and approved time zone',()=>{
 const text=shippingDelayNotice({orderNumber:'QA',reason:'Supply',revisedShipDate:'2026-10-16',replyBy:'2026-10-14T14:00:00Z',timeZone:'America/New_York'});assert.match(text,/October 14, 2026/);assert.match(text,/10:00 AM/);assert.match(text,/GMT-04:00/);assert.match(text,/America\/New_York/);assert.doesNotMatch(text,/Please reply by 2026-/);
 for(const input of [{},{replyBy:'invalid',timeZone:'UTC'},{replyBy:'2026-10-14T14:00:00Z',timeZone:'invalid'}])assert.match(shippingDelayNotice(input),/reply deadline and approved time zone required/);
});
