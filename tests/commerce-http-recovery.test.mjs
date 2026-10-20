import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceHttp,readBounded} from '../netlify/commerce/http.mjs';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {CommerceError} from '../netlify/commerce/service.mjs';

const origin='http://127.0.0.1:4176',env={COMMERCE_TEST_ENABLED:'true'};
const request=(route,init={})=>new Request(`${origin}/api/commerce/${route}`,init);
const post=(data,headers={})=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
const call=(route,init={},options={})=>commerceHttp(request(route,init),{env,...options});

test('config and production catalog expose only approved sellable fields from a fixture repository',async()=>{
 const repository=createMemoryRepository({variants:{finite:{id:'finite',productId:'tee',name:'Fixture',size:'M',sku:'FIX-M',active:true,liveStripePriceId:'price_fixture',productionPriceCents:3000,availableQuantity:0,reservedQuantity:1,soldQuantity:2},mto:{id:'mto',productId:'tee',active:true,liveStripePriceId:'price_mto',productionPriceCents:5000,inventoryPolicy:'made_to_order',availableQuantity:0},inactive:{active:false,liveStripePriceId:'price_hidden',productionPriceCents:3000},unmapped:{active:true,productionPriceCents:3000}}});
 const runtime=async()=>({repository,mock:false});
 assert.equal((await call('config',{method:'POST'},{runtime})).status,405);
 assert.equal((await (await call('config',{}, {runtime})).json()).enabled,true);
 assert.equal((await (await call('config',{}, {runtime:async()=>{throw Error('missing config');}})).json()).enabled,false);
 const settings={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://fixture.invalid',PAYMENTS_ENABLED:'true',LIVE_CATALOG_APPROVED:'true',SHIPPING_RATE_CENTS:'995'};
 const prod=(route,init={},patch={})=>commerceHttp(new Request('https://fixture.invalid/api/commerce/'+route,init),{env:{...settings,...patch},runtime});
 assert.equal((await prod('catalog',{method:'POST'})).status,405);
 const catalog=await (await prod('catalog')).json();assert.equal(catalog.variants.length,2);assert.equal(catalog.variants[0].available,false);assert.equal(catalog.variants[1].available,true);assert.equal(catalog.shippingCents,995);
 assert.equal(catalog.variants[0].liveStripePriceId,undefined);assert.equal(catalog.variants[0].reservedQuantity,undefined);
 assert.deepEqual(await (await prod('catalog',{}, {LIVE_CATALOG_APPROVED:'false'})).json(),{enabled:false,variants:[]});
 assert.equal((await (await prod('config',{}, {PAYMENTS_ENABLED:'false'})).json()).enabled,false);
 assert.equal((await prod('checkout',post({items:[]}),{PAYMENTS_ENABLED:'false'})).status,503);
 assert.equal((await commerceHttp(new Request('http://fixture.invalid/api/commerce/config'),{env:settings,runtime})).status,404);
 assert.equal((await commerceHttp(new Request('https://other.invalid/api/commerce/config'),{env:settings,runtime})).status,404);
});

test('simulation checks mode, method, origin, exact payload, access token and restart availability',async()=>{
 const repository=createMemoryRepository(),events=[];const session={id:'cs_test_synthetic',metadata:{order_id:'fixture'}};
 let available=true,verified=0;const runtime=async()=>({repository,mock:true,stripe:{checkout:{sessions:{retrieve:async()=>available?session:null}}},service:{status:async(id,token)=>{assert.equal(id,'cs_test_synthetic');assert.equal(token,'synthetic-token');verified++;},webhook:async event=>events.push(structuredClone(event))}});
 const options={env:{...env,COMMERCE_MOCK:'true'},runtime};const init=action=>post({sessionId:'cs_test_synthetic',action},{'X-Order-Token':'synthetic-token'});
 assert.equal((await call('simulate',{},options)).status,405);
 assert.equal((await call('simulate',{...init('paid'),headers:{Origin:'https://wrong.invalid'}},options)).status,403);
 for(const payload of [null,{},[],{sessionId:'cs_test_synthetic',action:'unknown'},{sessionId:'cs_test_synthetic',action:'paid',extra:true}])assert.equal((await call('simulate',post(payload),options)).status,400);
 assert.equal((await call('simulate',{...init('paid'),body:'not json'},options)).status,400);
 for(const action of ['paid','pending','failed','expired'])assert.deepEqual(await (await call('simulate',init(action),options)).json(),{simulated:true});
 assert.equal(verified,4);assert.deepEqual(events.map(e=>e.type),['checkout.session.completed','checkout.session.completed','checkout.session.async_payment_failed','checkout.session.expired']);
 assert.equal(events[0].data.object.payment_status,'paid');assert.equal(events[1].data.object.payment_status,'unpaid');assert.equal(events[3].data.object.status,'expired');
 available=false;assert.equal((await call('simulate',init('paid'),options)).status,409);
 assert.equal((await call('simulate',init('paid'),{runtime})).status,404);
});

test('order status and checkout limits use trusted caller identity and return safe failure messages',async()=>{
 const repository=createMemoryRepository();let count=0;
 const runtime=async()=>({repository,mock:true,service:{status:async()=>({status:'payment_pending',orderNumber:'DBM-QA'}),checkout:async()=>{count++;throw new CommerceError('insufficient_stock','This size is unavailable.',409);}}});
 assert.equal((await call('order',{method:'POST'},{runtime})).status,405);
 assert.equal((await (await call('order?session_id=cs_test_synthetic',{}, {runtime})).json()).status,'pending');
 assert.equal((await call('checkout',{...post({}),headers:{Origin:origin,'Content-Type':'text/plain'}},{runtime})).status,415);
 for(let i=0;i<12;i++){const response=await call('checkout',post({items:[]},{'Idempotency-Key':'same-fixture'}),{runtime,clientIp:'fixture-ip'});assert.equal(response.status,409);assert.equal((await response.json()).error,'This size is unavailable.');}
 assert.equal((await call('checkout',post({items:[]},{'Idempotency-Key':'same-fixture'}),{runtime,clientIp:'fixture-ip'})).status,429);assert.equal(count,12);
 const unavailable=await call('unknown',{}, {runtime:async()=>{throw Error('DATABASE_URL=private customer@example.invalid');}});
 assert.equal(unavailable.status,503);const text=await unavailable.text();assert.ok(!text.includes('private'));assert.ok(!text.includes('customer@'));assert.ok(text.includes('Your cart is saved.'));
 assert.equal((await call('unknown',{}, {runtime})).status,404);
});

test('failed signed webhooks persist attention records without overwriting processed events',async()=>{
 const repository=createMemoryRepository();let id='evt_fixtureFailed';
 const runtime=async()=>({repository,stripe:{webhooks:{constructEvent:()=>({id,livemode:false,type:'checkout.session.completed'})}},service:{webhook:async()=>{throw new CommerceError('payment_mismatch','Payment requires review.',409);}}});
 const options={env:{...env,STRIPE_WEBHOOK_SECRET:'whsec_synthetic'},runtime};
 assert.equal((await call('webhook',{},options)).status,405);
 assert.equal((await call('webhook',{method:'POST'},{runtime})).status,503);
 assert.equal((await call('webhook',{method:'POST',body:'synthetic'},options)).status,409);
 assert.equal(await repository.transaction(s=>s.events[id].status),'failed');
 await repository.transaction(s=>{s.events[id].status='processed';});await call('webhook',{method:'POST',body:'synthetic'},options);
 assert.equal(await repository.transaction(s=>s.events[id].status),'processed');
 id='invalid id';await call('webhook',{method:'POST',body:'synthetic'},options);assert.equal(await repository.transaction(s=>s.events[id]),undefined);
 assert.equal((await readBounded(new Request(origin))).length,0);
});
