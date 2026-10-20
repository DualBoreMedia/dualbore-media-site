import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverOrderEmails,renderOrderEmail,deliverShipmentEmail,renderShipmentEmail,deliverLifecycleEmails,retryRecordedEmail} from '../netlify/commerce/order-email.mjs';

const order={id:'order-1',orderNumber:'DBM-1',status:'paid',customerEmail:'customer@example.com',items:[{name:'E92 Tee',size:'M',quantity:1,unitPriceCents:3000,lineTotalCents:3000}],subtotalCents:3000,shippingCents:700,taxCents:0,totalCents:3700,currency:'usd',shippingName:'Customer',shippingAddress:{line1:'1 Example St',city:'City',state:'OH',postal_code:'12345',country:'US'}};
const env={RESEND_API_KEY:'mock-key',RESEND_FROM:'orders@example.com'};
function repository(initial=order){const state={orders:{[initial.id]:structuredClone(initial)},emails:{}};let queue=Promise.resolve();return {state,transaction(fn){const result=queue.then(()=>fn(state));queue=result.catch(()=>{});return result;}};}
const sent=async()=>new Response(JSON.stringify({id:'email_1'}),{status:200});
test('paid order sends once, merchant optional, duplicate calls safe',async()=>{
  const repo=repository();let calls=0;const input={repository:repo,orderId:order.id,env,fetchImpl:async(...args)=>{calls++;assert.equal(args[0],'https://api.resend.com/emails');return sent();}};
  await Promise.all([deliverOrderEmails(input),deliverOrderEmails(input)]);
  await deliverOrderEmails(input);assert.equal(calls,1);assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'sent');assert.equal(repo.state.orders['order-1'].status,'paid');
});
test('unpaid orders and missing key/sender never send or mutate payment state',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;return sent();};
  for(const status of ['pending','cancelled','failed']) await deliverOrderEmails({repository:repository({...order,status}),orderId:order.id,env,fetchImpl});
  for(const values of [{},{...env,RESEND_API_KEY:''},{...env,RESEND_FROM:''}]) {const repo=repository();const result=await deliverOrderEmails({repository:repo,orderId:order.id,env:values,fetchImpl});assert.equal(result.results[0].status,'configuration-missing');assert.equal(repo.state.orders['order-1'].status,'paid');}
  assert.equal(calls,0);
});
test('provider failure is safely recorded and retry uses stable key and immutable payload',async()=>{
  const repo=repository();let time=Date.parse('2026-10-12T00:00:00Z');let calls=[];
  const fetchImpl=async(url,init)=>{calls.push(init);return calls.length===1?new Response('private-provider-diagnostic',{status:503}):sent();};
  const input={repository:repo,orderId:order.id,env,fetchImpl,now:()=>new Date(time)};
  await deliverOrderEmails(input);assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'queued');assert.equal(repo.state.emails['order-1:customer-confirmation'].lastError,'provider-rejected');
  await deliverOrderEmails(input);assert.equal(calls.length,1);time+=61_000;repo.state.orders['order-1'].shippingName='changed';
  await deliverOrderEmails(input);assert.equal(calls.length,2);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.equal(calls[0].body,calls[1].body);
});
test('ambiguous timeouts outside provider deduplication window require manual review',async()=>{
  const repo=repository();let time=Date.parse('2026-10-12T00:00:00Z');let calls=0;const input={repository:repo,orderId:order.id,env,fetchImpl:async()=>{calls++;throw new Error('secret-details');},now:()=>new Date(time)};
  await deliverOrderEmails(input);time+=24*60*60*1000;await deliverOrderEmails(input);assert.equal(calls,1);assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'manual-review');
});
test('expired claim after a crash also requires review outside idempotency window',async()=>{
  const repo=repository();repo.state.emails['order-1:customer-confirmation']={status:'sending',firstAttemptAt:'2026-10-10T00:00:00Z',leaseExpiresAt:'2026-10-10T00:01:00Z'};
  const result=await deliverOrderEmails({repository:repo,orderId:order.id,env,fetchImpl:()=>{throw Error('must not send');},now:()=>new Date('2026-10-12T00:00:00Z')});assert.equal(result.results[0].status,'manual-review');
});
test('provider acceptance followed by storage outage retries safely after lease expiry',async()=>{
  const repo=repository();const transact=repo.transaction.bind(repo);let transactions=0;let time=Date.parse('2026-10-12T00:00:00Z');let keys=[];
  repo.transaction=fn=>{transactions++;if(transactions===2)return Promise.reject(new Error('database unavailable'));return transact(fn);};
  const input={repository:repo,orderId:order.id,env,fetchImpl:async(url,init)=>{keys.push(init.headers['Idempotency-Key']);return sent();},now:()=>new Date(time)};
  assert.equal((await deliverOrderEmails(input)).status,'storage-or-order-unavailable');assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'sending');
  await deliverOrderEmails(input);assert.equal(keys.length,1);time+=61_000;await deliverOrderEmails(input);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'sent');
});
test('an explicit later rejection cannot erase uncertainty from an expired claim',async()=>{
  const repo=repository();repo.state.emails['order-1:customer-confirmation']={status:'sending',uncertain:false,firstAttemptAt:'2026-10-12T00:00:00Z',leaseExpiresAt:'2026-10-12T00:01:00Z'};
  let time=Date.parse('2026-10-12T00:02:00Z');let calls=0;const input={repository:repo,orderId:order.id,env,fetchImpl:async()=>{calls++;return new Response('',{status:403});},now:()=>new Date(time)};
  await deliverOrderEmails(input);assert.equal(repo.state.emails['order-1:customer-confirmation'].uncertain,true);time+=24*60*60*1000;await deliverOrderEmails(input);assert.equal(calls,1);assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'manual-review');
});
test('merchant paid-order notification has separate durable email event',async()=>{
  const repo=repository();let payloads=[];await deliverOrderEmails({repository:repo,orderId:order.id,env:{...env,RESEND_NOTIFY_TO:'crew@example.com'},fetchImpl:async(url,init)=>{payloads.push(JSON.parse(init.body));return sent();}});assert.equal(payloads.length,2);assert.deepEqual(payloads[1].to,['crew@example.com']);assert.equal(Object.keys(repo.state.emails).length,2);
});
test('templates escape customer/product HTML and include plain text totals/address',()=>{
  const result=renderOrderEmail({...order,shippingName:'<img src=x onerror=alert(1)>',items:[{...order.items[0],name:'<script>evil</script>'}]});assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img'));assert.match(result.html,/&lt;script&gt;/);assert.match(result.text,/Total: \$37.00/);assert.match(result.text,/1 Example St/);assert.match(result.text,/Size M/);assert.throws(()=>renderOrderEmail({...order,status:'pending'}));
});

const shipped={...order,status:'fulfilled',shippedAt:'2026-10-12T12:00:00Z',carrier:'Example Carrier',trackingNumber:'TRACK123',trackingUrl:'https://example.invalid/track/TRACK123'};
test('shipment emails require recorded fulfillment and safe tracking',async()=>{
 let calls=0;await deliverShipmentEmail({repository:repository(),orderId:order.id,env,fetchImpl:async()=>{calls++;return sent();}});assert.equal(calls,0);
 assert.throws(()=>renderShipmentEmail(order));assert.throws(()=>renderShipmentEmail({...shipped,trackingUrl:'javascript:alert(1)'}));
 const email=renderShipmentEmail({...shipped,carrier:'<script>bad</script>'});assert.match(email.text,/TRACK123/);assert.match(email.html,/&lt;script&gt;/);assert.ok(!email.html.includes('<script>'));
});
test('shipment notification sends once with its own durable idempotency key',async()=>{
 const repo=repository(shipped);let calls=[];const input={repository:repo,orderId:order.id,env,fetchImpl:async(url,init)=>{calls.push(init);return sent();}};
 await deliverOrderEmails(input);await Promise.all([deliverShipmentEmail(input),deliverShipmentEmail(input)]);await deliverShipmentEmail(input);
 assert.equal(calls.length,2);assert.notEqual(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);const payload=JSON.parse(calls[1].body);assert.deepEqual(payload.to,['customer@example.com']);assert.match(payload.text,/Track your package/);assert.equal(repo.state.emails['order-1:customer-shipment'].status,'sent');
});
test('shipment email failures preserve fulfillment and retry the saved payload safely',async()=>{
 const repo=repository(shipped);let time=Date.parse('2026-10-12T12:00:00Z');let calls=[];const input={repository:repo,orderId:order.id,env,now:()=>new Date(time),fetchImpl:async(url,init)=>{calls.push(init);return calls.length===1?new Response('',{status:503}):sent();}};
 await deliverShipmentEmail(input);assert.equal(repo.state.orders[order.id].status,'fulfilled');assert.equal(repo.state.emails['order-1:customer-shipment'].status,'queued');time+=61000;await deliverShipmentEmail(input);assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
});

test('real sandbox order and shipment messages cannot be mistaken for live fulfillment',async()=>{
 const sandbox={...order,sessionId:'cs_test_sandbox'};
 const confirmation=renderOrderEmail(sandbox);assert.match(confirmation.subject,/^\[TEST\]/);assert.match(confirmation.text,/No real payment was taken/);assert.match(confirmation.html,/Do not ship/);
 const payloads=[];await deliverOrderEmails({repository:repository(sandbox),orderId:sandbox.id,env:{...env,RESEND_NOTIFY_TO:'merchant@example.com'},fetchImpl:async(url,init)=>{payloads.push(JSON.parse(init.body));return sent();}});assert.ok(payloads.every(p=>/^\[TEST\]/.test(p.subject)));
 const shipment=renderShipmentEmail({...sandbox,status:'fulfilled',shippedAt:new Date().toISOString(),carrier:'Test carrier',trackingNumber:'TEST-NOT-A-PACKAGE',trackingUrl:'https://example.com/test'});assert.match(shipment.subject,/^\[TEST\]/);assert.match(shipment.text,/No real package was shipped/);
});

test('recorded retry handles missing events, invalid recipients and malformed provider acceptance safely',async()=>{
 const repo=repository();assert.deepEqual(await retryRecordedEmail({repository:repo,eventId:'missing'}),{status:'not-found'});
 repo.state.orders[order.id].customerEmail='not-an-email';let calls=0;
 const result=await deliverOrderEmails({repository:repo,orderId:order.id,env,fetchImpl:async()=>{calls++;return sent();}});assert.equal(result.results[0].status,'recipient-invalid');assert.equal(calls,0);
 repo.state.orders[order.id].customerEmail=order.customerEmail;
 const invalid=await deliverOrderEmails({repository:repo,orderId:order.id,env,fetchImpl:async()=>Response.json({accepted:true})});assert.equal(invalid.results[0].status,'retry-queued');assert.equal(repo.state.emails['order-1:customer-confirmation'].lastError,'provider-response-invalid');
 const retried=await retryRecordedEmail({repository:repo,eventId:'order-1:customer-confirmation',env,now:()=>new Date(Date.now()+61_000),fetchImpl:sent});assert.equal(retried.status,'sent');
});

test('email storage failures remain independent of order and shipment success',async()=>{
 const broken={transaction:async()=>{throw Error('Synthetic database outage');}};
 assert.deepEqual(await deliverLifecycleEmails({repository:broken,orderId:order.id,env}),[{status:'storage-or-order-unavailable'}]);
 assert.deepEqual(await deliverShipmentEmail({repository:broken,orderId:order.id,env}),{type:'customer-shipment',status:'storage-or-order-unavailable'});
});

test('a superseded sending lease cannot overwrite another worker delivery result',async()=>{
 const repo=repository();await deliverOrderEmails({repository:repo,orderId:order.id,env,fetchImpl:async()=>{repo.state.emails['order-1:customer-confirmation'].leaseToken='new-worker-token';return sent();}});
 assert.equal(repo.state.emails['order-1:customer-confirmation'].leaseToken,'new-worker-token');assert.equal(repo.state.emails['order-1:customer-confirmation'].status,'sending');
});
