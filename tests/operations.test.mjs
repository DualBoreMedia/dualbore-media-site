import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService,safeTrackingUrl} from '../netlify/operations/service.mjs';
import {deliverLifecycleEmails} from '../netlify/commerce/order-email.mjs';
import {consumeLimit,operationsHttp} from '../netlify/operations/http.mjs';
const admin={userId:'admin',email:'admin@example.invalid',admin:true,mfa:true,sessionId:'session-admin'};
const customer={userId:'customer',email:'owner@example.invalid',displayName:'Owner',sessionId:'session-customer'};
function setup(options={}){
 const order={id:'o1',orderNumber:'DBM-TEST',customerEmail:customer.email,status:'paid',isTest:true,version:0,fulfillmentStatus:'received',createdAt:'2026-10-13T00:00:00.000Z',paidAt:'2026-10-13T00:00:00.000Z',currency:'usd',subtotalCents:6000,shippingCents:700,taxCents:0,totalCents:6700,paymentIntentId:'pi_test',items:[{variantId:'tee-m',sku:'TEE-M',name:'E92 Tee',size:'M',quantity:2,unitPriceCents:3000,lineTotalCents:6000}]};
 const repository=createMemoryRepository({orders:{o1:order},variants:{'tee-m':{id:'tee-m',sku:'TEE-M',name:'E92 Tee',size:'M',availableQuantity:2,reservedQuantity:0,soldQuantity:2,active:true}}});
 const calls=[];const stripe={paymentIntents:{retrieve:async()=>({livemode:false,currency:'usd',status:'succeeded'})},refunds:{create:async(p,o)=>{calls.push({p,o});return {id:'re_Test',currency:'usd',payment_intent:'pi_test',amount:p.amount,status:'succeeded'};}}};
 return {repository,calls,stripe,service:createOperationsService({repository,stripe,send:async()=>{},...options})};
}
test('verified email claims guest order once, prevents cross-account IDOR and hides internal data',async()=>{
 const {repository,service}=setup();const first=await service.read(customer);assert.equal(first.orders.length,1);assert.equal(first.orders[0].orderNumber,'DBM-TEST');assert.equal(first.orders[0].id,undefined);assert.equal(first.orders[0].customerEmail,undefined);assert.equal(first.orders[0].paymentIntentId,undefined);assert.equal(first.profile.marketingConsent,false);
 await service.read(customer);assert.equal(await repository.transaction(s=>Object.values(s.audit).filter(a=>a.action==='order-claimed').length),1);
 await assert.rejects(service.read({...customer,userId:'other',email:'other@example.invalid'},{orderNumber:'DBM-TEST'}),{code:'not_found'});
 await assert.rejects(service.read(customer,{admin:true}),{code:'admin_required'});
 await assert.rejects(service.mutate({...admin,mfa:false},{action:'inventory'}),{code:'mfa_required'});
 await service.mutate(customer,{action:'deletion-request'});await assert.rejects(service.read(customer),{code:'deletion_pending'});
});
test('central fulfillment workflow rejects skipped, stale, destructive and unpaid changes',async()=>{
 const {service,repository}=setup();
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'packing',expectedVersion:0}),{code:'invalid_transition'});
 await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'making',expectedVersion:0});
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'packing',expectedVersion:0}),{code:'stale_record'});
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'cancelled',expectedVersion:1}),{code:'confirmation_required'});
 await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'on_hold',note:'Material check',confirmed:true,expectedVersion:1});
 await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'making',expectedVersion:2});
 assert.equal(await repository.transaction(s=>Object.values(s.emails).filter(e=>e.emailType==='lifecycle-making').length),1);
 await repository.transaction(s=>{s.orders.o1.status='payment_pending';});
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'packing',expectedVersion:3}),{code:'not_paid'});
});
test('split packages enforce allocation and truthful shipping/delivery, with distinct durable email events',async()=>{
 const {service,repository}=setup();
 for(const [i,status]of ['making','packing','ready_to_ship'].entries())await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status,expectedVersion:i});
 const input={action:'shipment',orderNumber:'DBM-TEST',carrier:'USPS',service:'Ground',trackingNumber:'TEST123',trackingUrl:'https://tools.usps.com/go/TrackConfirmAction',items:[{variantId:'tee-m',quantity:1}]};
 const a=await service.mutate(admin,input),b=await service.mutate(admin,{...input,trackingNumber:'TEST456'});
 await assert.rejects(service.mutate(admin,input),{code:'over_allocated'});
 for(const id of [a.shipmentId,b.shipmentId]){await service.mutate(admin,{action:'shipment-status',shipmentId:id,status:'packed',expectedVersion:0});await service.mutate(admin,{action:'shipment-status',shipmentId:id,status:'shipped',expectedVersion:1});}
 assert.equal(await repository.transaction(s=>s.orders.o1.fulfillmentStatus),'shipped');
 await assert.rejects(service.mutate(admin,{action:'shipment-status',shipmentId:a.shipmentId,status:'delivered',expectedVersion:2}),{code:'confirmation_required'});
 await service.mutate(admin,{action:'shipment-status',shipmentId:a.shipmentId,status:'delivered',expectedVersion:2,confirmed:true});assert.equal(await repository.transaction(s=>s.orders.o1.fulfillmentStatus),'shipped');
 await service.mutate(admin,{action:'shipment-status',shipmentId:b.shipmentId,status:'delivered',expectedVersion:2,confirmed:true});assert.equal(await repository.transaction(s=>s.orders.o1.fulfillmentStatus),'delivered');
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'making',expectedVersion:await repository.transaction(s=>s.orders.o1.version)}),{code:'invalid_transition'});
 assert.equal(await repository.transaction(s=>Object.keys(s.trackingEvents).length),6);
 assert.equal(await repository.transaction(s=>Object.values(s.emails).filter(e=>e.emailType==='lifecycle-shipped').length),2);
});
test('safe tracking rejects script/data/http/embedded credentials and malformed URLs',()=>{
 for(const url of ['javascript:alert(1)','data:text/plain,x','http://ups.com','https://name:pass@ups.com','https://localhost/x','https://127.0.0.1/x','https://ups.com:444/x','https://ups.com\\@evil.com','https://ups.com/a b'])assert.throws(()=>safeTrackingUrl(url),{code:'invalid_tracking'});
 assert.equal(safeTrackingUrl('https://www.ups.com/track?tracknum=123'),'https://www.ups.com/track?tracknum=123');
});
test('stock changes preserve sold/reserved, reject races and require reasons, customer cannot mutate',async()=>{
 const {service,repository}=setup();const action={action:'inventory',variantId:'tee-m',availableQuantity:7,active:true,reason:'Counted seven blanks',expectedVersion:0};
 await assert.rejects(service.mutate(customer,action),{code:'admin_required'});
 const outcomes=await Promise.allSettled([service.mutate(admin,action),service.mutate(admin,action)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const v=await repository.transaction(s=>s.variants['tee-m']);assert.deepEqual([v.availableQuantity,v.reservedQuantity,v.soldQuantity],[7,0,2]);
 await assert.rejects(service.mutate(admin,{...action,expectedVersion:1,reason:''}),{code:'invalid_stock'});
 await assert.rejects(service.mutate(admin,{...action,expectedVersion:1,availableQuantity:-1}),{code:'invalid_stock'});
});
test('refunds require confirmed MFA admin and authoritative Stripe amount, preserve idempotency',async()=>{
 const {service,repository,calls}=setup();const input={action:'refund',orderNumber:'DBM-TEST',amountCents:3000,requestKey:randomUUID(),confirmed:true};await service.mutate(admin,input);await service.mutate(admin,input);assert.equal(calls.length,1);assert.equal(await repository.transaction(s=>s.orders.o1.refundedCents),3000);
 await assert.rejects(service.mutate(admin,{...input,requestKey:randomUUID(),amountCents:4000}),{code:'invalid_refund'});
 await assert.rejects(service.mutate(admin,{...input,amountCents:1}),{code:'request_conflict'});
 const disabled=setup({env:{COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'false'}});await assert.rejects(disabled.service.mutate(admin,input),{code:'payments_disabled'});assert.equal(disabled.calls.length,0);
});
test('transactional lifecycle is escaped, immutable, idempotent and failure-independent',async()=>{
 const {service,repository}=setup();await repository.transaction(s=>{s.orders.o1.items[0].name='<script>alert(1)</script>';});
 await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'making',expectedVersion:0});
 const rows=await repository.transaction(s=>Object.values(s.emails));assert.ok(rows[0].template.html.includes('&lt;script&gt;'));assert.ok(!rows[0].template.html.includes('<script>'));assert.ok(rows[0].template.text.includes('<script>'));assert.ok(rows[0].template.subject.startsWith('[TEST]'));
 let calls=0;const args={repository,orderId:'o1',env:{RESEND_API_KEY:'mock',RESEND_FROM:'test@example.invalid'},fetchImpl:async()=>{calls++;return Response.json({id:'test_message'});}};
 await deliverLifecycleEmails(args);await deliverLifecycleEmails(args);assert.equal(calls,1);
 await deliverLifecycleEmails({...args,env:{...args.env,COMMERCE_ENVIRONMENT:'production',TRANSACTIONAL_EMAILS_ENABLED:'false'}});assert.equal(calls,1);
});
test('durable identity rate limiting and HTTP rejection have no auth bypass',async()=>{
 const {repository}=setup();assert.equal(await consumeLimit(repository,'user','write',{limit:1,now:1}),true);assert.equal(await consumeLimit(repository,'user','write',{limit:1,now:2}),false);assert.equal(await consumeLimit(repository,'other','write',{limit:1,now:2}),true);
 const env={SITE_ORIGIN:'https://site.invalid'},runtime=async()=>({repository});
 const wrong=await operationsHttp(new Request('https://site.invalid/api/operations',{headers:{Origin:'https://evil.invalid'}}),{env,runtime});assert.equal(wrong.status,403);
 const auth=async()=>customer;const res=await operationsHttp(new Request('https://site.invalid/api/operations?admin=true'),{env,runtime,auth});assert.equal(res.status,403);
});
test('inherited map names cannot mutate prototypes or impersonate records',async()=>{
 const {service}=setup();for(const variantId of ['__proto__','constructor','toString'])await assert.rejects(service.mutate(admin,{action:'inventory',variantId,availableQuantity:7,active:true,reason:'Count',expectedVersion:0}),{code:'not_found'});
 assert.equal({}.availableQuantity,undefined);
 await assert.rejects(service.mutate(admin,{action:'shipment-status',shipmentId:'__proto__',status:'packed',expectedVersion:0}),{code:'not_found'});
});
test('fully refunded orders cannot move forward or create packages; confirmation must be boolean',async()=>{
 const {service,repository}=setup();await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'cancelled',confirmed:'false',note:'Reason',expectedVersion:0}),{code:'confirmation_required'});
 await repository.transaction(s=>{s.orders.o1.status='refunded';s.orders.o1.refundStatus='full';s.orders.o1.fulfillmentStatus='packing';});
 await assert.rejects(service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status:'ready_to_ship',expectedVersion:0}),{code:'not_paid'});
 await assert.rejects(service.mutate(admin,{action:'shipment',orderNumber:'DBM-TEST',carrier:'USPS',service:'Ground',trackingNumber:'TEST',trackingUrl:'https://usps.com',items:[{variantId:'tee-m',quantity:1}]}),{code:'not_ready'});
});
test('support binds the verified account, hides other tickets and keeps admin notes private',async()=>{
 const {service}=setup();const ticket=await service.mutate(customer,{action:'support',category:'order',orderNumber:'DBM-TEST',message:'Please check this order.'});
 await assert.rejects(service.mutate({...customer,userId:'other',email:'other@example.invalid'},{action:'support',category:'order',orderNumber:'DBM-TEST',message:'Guessing another order'}),{code:'not_found'});
 assert.equal((await service.read({...customer,userId:'other',email:'other@example.invalid'})).supportTickets.length,0);
 await service.mutate(admin,{action:'support-status',ticketNumber:ticket.ticketNumber,status:'resolved',note:'Private internal assessment',expectedVersion:0});
 assert.equal((await service.read(customer)).supportTickets[0].note,undefined);assert.equal((await service.read(admin,{admin:true})).supportTickets[0].note,'Private internal assessment');
 await assert.rejects(service.mutate(admin,{action:'support-status',ticketNumber:ticket.ticketNumber,status:'open',note:'Review',expectedVersion:0}),{code:'stale_record'});
});
test('account opt-out stays suppressed across later preference saves and purchases',async()=>{
 const {service}=setup();await service.mutate(customer,{action:'preferences',marketingConsent:true});assert.equal((await service.read(customer)).profile.marketingConsent,true);
 await service.mutate(customer,{action:'preferences',marketingConsent:false});await service.mutate(customer,{action:'preferences',marketingConsent:true});const profile=(await service.read(customer)).profile;assert.equal(profile.marketingConsent,false);assert.equal(profile.marketingSuppressed,true);
});
test('uncertain refunds outside provider deduplication window cannot create another refund',async()=>{
 const{service,repository,calls}=setup();const requestKey=randomUUID();await repository.transaction(s=>{s.refundRequests[requestKey]={id:requestKey,orderId:'o1',orderNumber:'DBM-TEST',paymentIntentId:'pi_test',amountCents:3000,status:'pending',createdAt:new Date(Date.now()-24*3600000).toISOString(),uncertain:true};});
 await assert.rejects(service.mutate(admin,{action:'refund',orderNumber:'DBM-TEST',amountCents:3000,requestKey,confirmed:true}),{code:'refund_reconciliation_required'});assert.equal(calls.length,0);assert.equal(await repository.transaction(s=>s.refundRequests[requestKey].status),'manual-review');
 await assert.rejects(service.mutate(admin,{action:'refund',orderNumber:'DBM-TEST',amountCents:4000,requestKey:randomUUID(),confirmed:true}),{code:'invalid_refund'});
});
test('late pending refund API response cannot undo confirmed webhook state',async()=>{
 const{service,repository,stripe}=setup();const requestKey=randomUUID();let resolve,started;const ready=new Promise(r=>started=r);stripe.refunds.create=async()=>{started();return new Promise(r=>resolve=r);};
 const work=service.mutate(admin,{action:'refund',orderNumber:'DBM-TEST',amountCents:1000,requestKey,confirmed:true});await ready;
 await repository.transaction(s=>{s.refundRequests[requestKey].status='succeeded';s.refundRequests[requestKey].refundId='re_Verified';s.orders.o1.refundedCents=1000;});
 resolve({id:'re_Verified',currency:'usd',payment_intent:'pi_test',amount:1000,status:'pending'});assert.deepEqual(await work,{saved:true});assert.equal(await repository.transaction(s=>s.refundRequests[requestKey].status),'succeeded');
});

test('split package packing attribution comes from authenticated staff and remains private and historical',async()=>{
 const {service,repository}=setup();
 for(const [i,status]of ['making','packing','ready_to_ship'].entries())await service.mutate(admin,{action:'transition',orderNumber:'DBM-TEST',status,expectedVersion:i});
 const employee={userId:'workos:packer-two',role:'employee',email:'packer@example.invalid',mfa:true,sessionId:'packer-session'};
 const input={action:'shipment',orderNumber:'DBM-TEST',carrier:'USPS',service:'Ground',trackingNumber:'TEST123',trackingUrl:'https://tools.usps.com/',items:[{variantId:'tee-m',quantity:1}]};
 const a=await service.mutate(admin,input),b=await service.mutate(employee,input);
 await assert.rejects(service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'packed',expectedVersion:0,packedByUserId:'spoofed'}),{code:'invalid_input'});
 for(const [shipmentId,principal]of [[a.shipmentId,admin],[b.shipmentId,employee]])await service.mutate(principal,{action:'shipment-status',shipmentId,status:'packed',expectedVersion:0});
 await service.mutate(employee,{action:'shipment-status',shipmentId:a.shipmentId,status:'shipped',expectedVersion:1});
 const state=await repository.transaction(s=>s);
 assert.equal(state.shipments[a.shipmentId].packedByUserId,admin.userId);
 assert.equal(state.shipments[b.shipmentId].packedByUserId,employee.userId);
 assert.ok(state.shipments[a.shipmentId].packedAt);
 assert.equal(state.shipments[b.shipmentId].createdByUserId,employee.userId);
 assert.equal(state.shipments[b.shipmentId].trackingEnteredByUserId,employee.userId);
 assert.ok(Object.values(state.trackingEvents).every(e=>[admin.userId,employee.userId].includes(e.actorUserId)));
 const history=Object.values(state.audit).filter(e=>e.action==='shipment-status'&&e.metadata.next==='packed');assert.deepEqual(history.map(e=>e.actor),[admin.userId,employee.userId]);
 const adminOrder=(await service.read(admin,{admin:true,orderNumber:'DBM-TEST'})).orders[0];assert.equal(adminOrder.shipments[0].packedByUserId,admin.userId);
 const customerOrder=(await service.read(customer)).orders[0];assert.equal(customerOrder.shipments[0].packedByUserId,undefined);
});
