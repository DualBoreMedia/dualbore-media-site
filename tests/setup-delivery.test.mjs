import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {deliverOrderEmails,retryRecordedEmail} from '../netlify/commerce/order-email.mjs';
import {renderOrderEmail} from '../netlify/commerce/order-email.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';
import {setupDeliveryRefs,setupEmailAttachments,renderSetupEmail} from '../netlify/setups/delivery.mjs';
const env={RESEND_API_KEY:'synthetic-only',RESEND_FROM:'orders@example.invalid',TRANSACTIONAL_EMAILS_ENABLED:'true',DIGITAL_DELIVERY_ENABLED:'true'};
const file=()=>{const b=Buffer.alloc(244);Buffer.from('c85393451601','hex').copy(b);b.write('MX1OEM_2023_Yamaha_YZ450F',6);return b;};
async function fixture(){
 const repository=createMemoryRepository();
 const order=await repository.transaction(async(s,assets)=>{
  const meta=await assets.put(file(),{filename:'Synthetic YZ450.stp',actor:'qa-admin',createdAt:new Date().toISOString()});
  const o={id:'qa-order',orderNumber:'DBM-QA',status:'paid',sessionId:'cs_test_deliveryfixture',testProvider:'stripe',isTest:true,customerEmail:'customer@example.invalid',currency:'usd',shippingName:'Synthetic customer',shippingAddress:{country:'US'},subtotalCents:200,shippingCents:0,taxCents:0,totalCents:200,refundStatus:'none',items:[{type:'mx_setup',variantId:'fixture',name:'Synthetic YZ450',quantity:1,size:'Digital',lineTotalCents:200,unitPriceCents:200,oemBike:'Synthetic YZ450',bikeVersion:'QA-only',gameVersion:'QA-only',setupFile:{assetId:meta.id,sha256:meta.sha256,embeddedBikeId:meta.embeddedBikeId,sizeBytes:meta.sizeBytes,filename:meta.filename}}]};
  s.orders[o.id]=o;s.events.original={id:'original',orderId:o.id,status:'processed',type:'checkout.session.completed'};return o;
 });return{repository,order,orderId:order.id,env};
}
const accepted=()=>Response.json({id:'synthetic_email'});
test('paid setup delivery attaches exact private bytes once; duplicate events/recovery reuse durable outbox',async()=>{
 const f=await fixture(),requests=[];const input={...f,fetchImpl:async(_,init)=>{requests.push(init);return accepted();}};
 await Promise.all([deliverOrderEmails(input),deliverOrderEmails(input)]);await deliverOrderEmails(input);
 assert.equal(requests.length,2);const payloads=requests.map(r=>JSON.parse(r.body)),delivery=payloads.find(p=>p.attachments);
 assert.deepEqual(Buffer.from(delivery.attachments[0].content,'base64'),file());assert.equal(delivery.attachments[0].filename,'1-Synthetic YZ450.stp');assert.match(delivery.subject,/^\[TEST\]/);assert.deepEqual(delivery.to,['customer@example.invalid']);assert.equal(payloads.filter(p=>p.attachments).length,1);
 const events=await f.repository.transaction(s=>s.emails);assert.equal(events['qa-order:customer-setup-files'].status,'sent');assert.equal(JSON.stringify(events).includes(file().toString('base64')),false);assert.equal(events['qa-order:customer-setup-files'].payload.attachments,undefined);
});
test('unpaid, refunded, held, unproven and mock orders never deliver setups; every gate remains fail closed',async()=>{
 for(const patch of [{status:'checkout_pending'},{status:'refunded'},{fulfillmentStatus:'on_hold'},{fulfillmentStatus:'cancelled'},{refundStatus:'partial'},{refundedCents:1},{testProvider:'mock'}]){
  const f=await fixture();await f.repository.transaction(s=>Object.assign(s.orders[f.orderId],patch));const payloads=[];await deliverOrderEmails({...f,fetchImpl:async(_,init)=>{payloads.push(JSON.parse(init.body));return accepted();}});assert.ok(payloads.every(p=>!p.attachments));
 }
 for(const patch of [{DIGITAL_DELIVERY_ENABLED:'false'},{DIGITAL_DELIVERY_ENABLED:undefined},{TRANSACTIONAL_EMAILS_ENABLED:'false'},{AUTH_ACCESS_MODE:'staff-only'}]){
  const f=await fixture(),payloads=[];await deliverOrderEmails({...f,env:{...env,...patch},fetchImpl:async(_,init)=>{payloads.push(JSON.parse(init.body));return accepted();}});assert.ok(payloads.every(p=>!p.attachments));
 }
 const f=await fixture();await f.repository.transaction(s=>{s.events={};});const result=await deliverOrderEmails({...f,fetchImpl:accepted});assert.equal(result.results.at(-1).status,'payment-or-fulfillment-review-required');
});
test('setup retry pins old bytes and payload through catalog changes, with no duplicate after provider ambiguity',async()=>{
 const f=await fixture(),requests=[];let time=Date.parse('2026-11-06T12:00:00Z');
 const input={...f,now:()=>new Date(time),fetchImpl:async(_,init)=>{if(JSON.parse(init.body).attachments){requests.push(init);return requests.length===1?new Response('',{status:503}):accepted();}return accepted();}};
 await deliverOrderEmails(input);assert.equal((await f.repository.transaction(s=>s.emails['qa-order:customer-setup-files'])).status,'queued');
 await f.repository.transaction(s=>{s.products.new={id:'new',draft:{name:'Unrelated new file'}};});
 time+=61000;await retryRecordedEmail({...input,eventId:'qa-order:customer-setup-files'});assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
 await retryRecordedEmail({...input,eventId:'qa-order:customer-setup-files'});assert.equal(requests.length,2);
});
test('missing or mismatched file versions create an actionable email failure without undoing paid order',async()=>{
 for(const patch of [{assetId:randomUUID()},{sha256:'0'.repeat(64)},{embeddedBikeId:'MX2OEM_wrong'},{sizeBytes:245},{filename:'../private.stp'},{assetId:'bad'}]){
  const f=await fixture();await f.repository.transaction(s=>Object.assign(s.orders[f.orderId].items[0].setupFile,patch));let attached=0;const result=await deliverOrderEmails({...f,fetchImpl:async(_,init)=>{if(JSON.parse(init.body).attachments)attached++;return accepted();}});assert.equal(attached,0);assert.equal(result.results.at(-1).status,'manual-review');const state=await f.repository.transaction(s=>s);assert.equal(state.orders[f.orderId].status,'paid');assert.equal(state.emails['qa-order:customer-setup-files'].lastError,'setup-integrity-review-required');
 }
});
test('verified checkout webhook invokes digital delivery, replay does not resend; return page alone never sends',async()=>{
 const f=await fixture();await f.repository.transaction(s=>{s.orders[f.orderId].status='checkout_pending';s.orders[f.orderId].createdAt=new Date().toISOString();s.events={};});
 // Synthetic provider event through the real service. HTTP signature checks are
 // covered separately. No real Stripe payment or Resend delivery is claimed.
 const calls=[];const originalFetch=globalThis.fetch;globalThis.fetch=async(_,init)=>{calls.push(JSON.parse(init.body));return accepted();};
 try{
  const service=createCommerceService({repository:f.repository,stripe:null,env:{...env,SITE_ORIGIN:'http://127.0.0.1:4320'}});
  const event={id:'evt_synthetic_setup',type:'checkout.session.completed',livemode:false,data:{object:{id:f.order.sessionId,livemode:false,metadata:{order_id:f.orderId},payment_status:'paid',currency:'usd',amount_subtotal:200,amount_total:200,total_details:{amount_shipping:0,amount_tax:0},customer_details:{email:f.order.customerEmail},shipping_details:{name:'Synthetic customer',address:{country:'US'}}}}};
  assert.equal(calls.length,0);await service.webhook(event);await service.webhook(event);assert.equal(calls.filter(p=>p.attachments).length,1);assert.equal((await f.repository.transaction(s=>s.orders[f.orderId])).status,'paid');
 }finally{globalThis.fetch=originalFetch;}
});
test('setup templates escape HTML and attachment validation bounds size, count and content',async()=>{
 const f=await fixture(),order={...f.order,items:[{...f.order.items[0],name:'<script>bad</script>'}]};const email=renderSetupEmail(order);assert.match(email.html,/&lt;script&gt;/);assert.ok(!email.html.includes('<script>'));assert.match(email.text,/.stp files are attached/);
 const refs=setupDeliveryRefs(f.order);for(const value of [[],null,Array(21).fill(refs[0]),[{...refs[0],sizeBytes:9*1024*1024}]])await assert.rejects(setupEmailAttachments({},value));
 await assert.rejects(setupEmailAttachments(null,refs));for(const items of [[],Array(21).fill(order.items[0])])assert.throws(()=>setupDeliveryRefs({...order,items}));
 const receipt=renderOrderEmail(order);assert.match(receipt.text,/No physical package/);assert.ok(!receipt.text.includes('Ship to:'));assert.ok(!receipt.html.includes('<h2>Ship to</h2>'));
});
