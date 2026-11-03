import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryRepository } from '../netlify/commerce/memory-repository.mjs';
import { createCommerceService, transition } from '../netlify/commerce/service.mjs';
import { seedTestCatalog, testCatalog } from '../netlify/commerce/catalog.mjs';
import { createPostgresRepository, runMigrations } from '../netlify/commerce/repository.mjs';
import { PGlite } from '@electric-sql/pglite';

const clock = () => Date.parse('2026-10-12T12:00:00Z');
const item = { variantId: 'e92-tee-m', quantity: 1 };
async function fixture({ quantity = 5, create, env = {}, now = clock, repository = createMemoryRepository() } = {}) {
  await seedTestCatalog(repository, { quantity });
  await repository.transaction(state => { for (const v of Object.values(state.variants)) v.stripePriceId = 'price_' + v.id; });
  const sessions = new Map();
  const calls = [];
  const stripe = {
    prices: { retrieve: async id => ({ active: true, livemode: false, currency: 'usd', unit_amount: await repository.transaction(state => Object.values(state.variants).find(v => v.stripePriceId === id)?.priceCents) }) },
    tax: { registrations: { list: async () => ({ data: [{}] }) } },
    checkout: { sessions: { create: async (params, options) => {
      calls.push({ params, options });
      if (create) return create(params, options);
      if (!sessions.has(options.idempotencyKey)) sessions.set(options.idempotencyKey, { id: 'cs_test_' + (sessions.size + 1).toString().padStart(8, '0'), url: 'https://checkout.stripe.com/c/test', livemode: false });
      return sessions.get(options.idempotencyKey);
    } } },
  };
  const service = createCommerceService({ repository, stripe, now, env });
  const start = (items = [item], options = {}) => service.checkout({ items }, { requestKey: randomUUID(), ...options });
  const state = () => repository.transaction(value => value);
  const event = async (session, type = 'checkout.session.completed', fields = {}, eventId = 'evt_' + randomUUID().replaceAll('-', '')) => {
    const order = Object.values((await state()).orders).find(o => o.sessionId === session.sessionId);
    return { id: eventId, type, livemode: false, data: { object: { id: session.sessionId, livemode: false, metadata: { order_id: order.id }, payment_status: 'paid', currency: 'usd', amount_subtotal: order.subtotalCents, amount_total: order.subtotalCents + 700 + 240, total_details: { amount_shipping: 700, amount_tax: 240 }, customer_details: { email: 'test@example.invalid' }, collected_information: { shipping_details: { name: 'Test Person', address: { country: 'US', line1: 'Test only', postal_code: '00000' } } }, payment_intent: 'pi_test', ...fields } } };
  };
  return { repository, stripe, service, start, state, event, calls };
}

test('catalog has 15 unique integer-priced trusted variants and explicit zero default inventory', async () => {
  assert.equal(testCatalog.length, 15);
  assert.equal(new Set(testCatalog.map(v => v.id)).size, 15);
  assert.equal(new Set(testCatalog.map(v => v.sku)).size, 15);
  assert.ok(testCatalog.every(v => Number.isInteger(v.priceCents) && v.priceCents === 3000 && v.availableQuantity === 0 && /^DBM-/.test(v.sku)));
  const f = await fixture();
  assert.equal(Object.keys((await f.state()).variants).length, 15);
});

test('checkout reconstructs totals, reserves sizes and reuses idempotent request sessions', async () => {
  const f = await fixture(); const requestKey = randomUUID();
  const items = [item, { variantId: 'e92-tee-l', quantity: 2 }];
  const [first, second] = await Promise.all([f.start(items, { requestKey }), f.start(items, { requestKey })]);
  assert.equal(first.sessionId, second.sessionId);
  const state = await f.state(); const orders = Object.values(state.orders);
  assert.equal(orders.length, 1); assert.equal(orders[0].subtotalCents, 9000);
  assert.equal(orders[0].shippingCents, 700); assert.equal(orders[0].taxCents, null);
  assert.equal(state.variants[item.variantId].availableQuantity, 4);
  assert.equal(state.variants['e92-tee-l'].reservedQuantity, 2);
  assert.equal(Object.keys(state.reservations).length, 2);
  assert.equal(f.calls[0].params.expires_at, clock() / 1000 + 35 * 60);
  assert.deepEqual(f.calls[0].params.shipping_address_collection.allowed_countries, ['US']);
  assert.match(orders[0].orderNumber, /^DBM-[A-F0-9]+$/);
  await assert.rejects(f.start([item], { requestKey }), { code: 'request_conflict' });
});

test('concurrent final-unit checkout cannot oversell', async () => {
  const f = await fixture({ quantity: 1 });
  const results = await Promise.allSettled([f.start(), f.start()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'insufficient_stock');
  const state = await f.state(); assert.equal(state.variants[item.variantId].availableQuantity, 0); assert.equal(state.variants[item.variantId].reservedQuantity, 1);
});

test('definitive Stripe failure releases inventory while ambiguous timeout retains reservation', async () => {
  const rejected = await fixture({ create: async () => { throw Object.assign(new Error('safe mocked rejection'), { type: 'StripeInvalidRequestError' }); } });
  await assert.rejects(rejected.start(), { code: 'stripe_unavailable' });
  let state = await rejected.state(); assert.equal(state.variants[item.variantId].availableQuantity, 5); assert.equal(Object.values(state.orders)[0].status, 'payment_failed');
  const timeout = await fixture({ create: async () => { throw Object.assign(new Error('network'), { type: 'StripeConnectionError' }); } });
  const requestKey = randomUUID();
  await assert.rejects(timeout.start([item], { requestKey }), { code: 'stripe_unavailable' });
  await assert.rejects(timeout.start([item], { requestKey }), { code: 'stripe_unavailable' });
  state = await timeout.state(); assert.equal(state.variants[item.variantId].availableQuantity, 4); assert.equal(state.variants[item.variantId].reservedQuantity, 1); assert.equal(Object.keys(state.orders).length, 1);
  assert.equal(timeout.calls[0].options.idempotencyKey, timeout.calls[1].options.idempotencyKey);
});

test('verified paid event and exact or logical duplicates sell once and preserve paid stock on late expiry', async () => {
  const f = await fixture(); const session = await f.start(); const event = await f.event(session);
  await f.service.webhook(event); await f.service.webhook(event); await f.service.webhook({ ...event, id: 'evt_logicalduplicate' });
  await f.service.webhook(await f.event(session, 'checkout.session.expired', { payment_status: 'unpaid' }));
  const state = await f.state(); const order = Object.values(state.orders)[0];
  assert.equal(order.status, 'paid'); assert.equal(order.totalCents, 3940); assert.equal(order.customerEmail, 'test@example.invalid');
  assert.equal(state.variants[item.variantId].soldQuantity, 1); assert.equal(state.variants[item.variantId].reservedQuantity, 0); assert.equal(state.variants[item.variantId].availableQuantity, 4);
  assert.equal(Object.values(state.reservations)[0].status, 'sold');
});

test('delayed paid webhook uses the verified event time, never the delivery time, for the business-day promise', async () => {
 let at=clock();const env={SHIPPING_CALENDAR_APPROVED:'true',SHIPPING_BUSINESS_CALENDAR:JSON.stringify({timeZone:'America/New_York',weekdays:[1,2,3,4,5],holidays:[],reviewedThrough:'2026-12-31'})};
 const f=await fixture({env,now:()=>at});const session=await f.start();const event=await f.event(session);event.created=at/1000;at+=5*86400000;await f.service.webhook(event);const o=Object.values((await f.state()).orders)[0];assert.equal(o.paidAt,'2026-10-12T12:00:00.000Z');assert.equal(o.shippingPromise.dueDate,'2026-10-19');assert.equal(o.paymentTimestampVerified,true);
 const missing=await fixture({env});const s=await missing.start();await missing.service.webhook(await missing.event(s));const conservative=Object.values((await missing.state()).orders)[0];assert.equal(conservative.paidAt,conservative.createdAt);assert.equal(conservative.shippingPromise.verified,false);
});

test('async payments remain reserved until paid or failed; unpaid checkout expiry releases once', async () => {
  const f = await fixture(); const session = await f.start();
  await f.service.webhook(await f.event(session, 'checkout.session.completed', { payment_status: 'unpaid' }));
  assert.equal(Object.values((await f.state()).orders)[0].status, 'payment_pending');
  await f.service.webhook(await f.event(session, 'checkout.session.expired', { payment_status: 'unpaid' }));
  assert.equal((await f.state()).variants[item.variantId].reservedQuantity, 1);
  await f.service.webhook(await f.event(session, 'checkout.session.async_payment_succeeded'));
  assert.equal(Object.values((await f.state()).orders)[0].status, 'paid');
  const failed = await fixture(); const failureSession = await failed.start();
  await failed.service.webhook(await failed.event(failureSession, 'checkout.session.completed', { payment_status: 'unpaid' }));
  await failed.service.webhook(await failed.event(failureSession, 'checkout.session.async_payment_failed', { payment_status: 'unpaid' }));
  assert.equal(Object.values((await failed.state()).orders)[0].status, 'payment_failed'); assert.equal((await failed.state()).variants[item.variantId].availableQuantity, 5);
  const expired = await fixture(); const expirySession = await expired.start(); const expiration = await expired.event(expirySession, 'checkout.session.expired', { payment_status: 'unpaid' });
  await expired.service.webhook(expiration); await expired.service.webhook(expiration);
  assert.equal(Object.values((await expired.state()).orders)[0].status, 'expired'); assert.equal((await expired.state()).variants[item.variantId].availableQuantity, 5);
});

test('status requires opaque token and never returns customer data or internal identifiers', async () => {
  const f = await fixture(); const session = await f.start();
  await assert.rejects(f.service.status(session.sessionId, 'a'.repeat(64)), { code: 'not_found', status: 404 });
  await assert.rejects(f.service.status('cs_test_unknown00', session.orderAccessToken), { code: 'not_found' });
  await f.service.webhook(await f.event(session));
  await f.repository.transaction(state => { const order = Object.values(state.orders)[0]; state.emails.mail = { id: 'mail', orderId: order.id, emailType: 'customer-confirmation', status: 'sent' }; });
  const result = await f.service.status(session.sessionId, session.orderAccessToken);
  assert.equal(result.status, 'paid'); assert.equal(result.emailStatus, 'sent');
  for (const key of ['id', 'requestKey', 'customerEmail', 'shippingAddress', 'accessTokenHash', 'sessionUrl']) assert.equal(Object.hasOwn(result, key), false);
});

test('changed trusted price requires acknowledgement before any stock is reserved', async () => {
  const f = await fixture(); await f.repository.transaction(state => { state.variants[item.variantId].priceCents = 3500; });
  let error; try { await f.start(); } catch (value) { error = value; }
  assert.equal(error.code, 'cart_changed'); assert.equal(error.details.lines[0].unitPriceCents, 3500);
  assert.equal(Object.keys((await f.state()).orders).length, 0);
  await f.start([item], { quoteToken: error.details.quoteToken });
  assert.equal(Object.values((await f.state()).orders)[0].subtotalCents, 3500);
});

test('forged prices/totals/shipping, abusive quantities, inactive and unknown variants are rejected', async () => {
  const f = await fixture();
  for (const quantity of [0, -1, 11, 1.5, '1']) await assert.rejects(f.start([{ ...item, quantity }]), { code: 'invalid_cart' });
  for (const extra of [{ priceCents: 1 }, { subtotal: 1 }, { shipping: 0 }]) await assert.rejects(f.service.checkout({ items: [item], ...extra }, { requestKey: randomUUID() }), { code: 'invalid_cart' });
  await assert.rejects(f.start([{ ...item, priceCents: 1 }]), { code: 'invalid_cart' });
  await assert.rejects(f.start([{ variantId: 'nonexistent', quantity: 1 }]), { code: 'invalid_cart' });
  await assert.rejects(f.start([]), { code: 'invalid_cart' });
  await f.repository.transaction(state => { state.variants[item.variantId].active = false; });
  await assert.rejects(f.start(), { code: 'inactive_variant' });
  assert.equal(Object.keys((await f.state()).orders).length, 0);
});

test('webhook mismatched amounts and sessions roll back before stock conversion; invalid transitions reject', async () => {
  const f = await fixture(); const session = await f.start();
  await assert.rejects(f.service.webhook(await f.event(session, 'checkout.session.completed', { amount_total: 1 })), { code: 'amount_mismatch' });
  await assert.rejects(f.service.webhook(await f.event(session, 'checkout.session.completed', { id: 'cs_test_other000' })), { code: 'session_mismatch' });
  await assert.rejects(f.service.webhook(await f.event(session, 'checkout.session.completed', { collected_information: { shipping_details: { address: { country: 'CA' } } } })), { code: 'shipping_missing' });
  const state = await f.state(); assert.equal(state.variants[item.variantId].soldQuantity, 0); assert.equal(state.variants[item.variantId].reservedQuantity, 1); assert.equal(Object.keys(state.events).length, 0);
  assert.throws(() => transition({ status: 'expired' }, 'paid'), { code: 'invalid_transition' });
  assert.deepEqual(await f.service.webhook({ id: 'evt_unrelated', livemode: false, type: 'customer.created' }), { ignored: true });
  await assert.rejects(f.service.webhook({ id: 'evt_live', livemode: true, type: 'checkout.session.completed' }), { code: 'invalid_event' });
});

test('same checkout and verified-payment service persists through normalized PostgreSQL repository reload', async () => {
  const database = new PGlite();
  const client = { release() {}, query: async (sql, params) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    return !params && sql.includes(';') ? (await database.exec(sql)).at(-1) : database.query(sql, params);
  } };
  const pool = { connect: async () => client };
  try {
    await runMigrations(pool);
    const f = await fixture({ repository: createPostgresRepository(pool) });
    const session = await f.start();
    const event = await f.event(session);
    await f.service.webhook(event); await f.service.webhook(event);
    const state = await createPostgresRepository(pool).transaction(value => value);
    assert.equal(Object.keys(state.variants).length, 15);
    assert.equal(Object.values(state.orders)[0].status, 'paid');
    assert.equal(Object.values(state.orders)[0].totalCents, 3940);
    assert.equal(state.variants[item.variantId].soldQuantity, 1);
    assert.equal(state.variants[item.variantId].reservedQuantity, 0);
    assert.equal(Object.values(state.reservations)[0].status, 'sold');
    assert.equal(Object.keys(state.events).length, 1);
    assert.equal((await f.service.status(session.sessionId, session.orderAccessToken)).status, 'paid');
  } finally { await database.close(); }
});

test('ambiguous create followed by disabled price cannot release a possibly payable reservation', async () => {
  let createdSession;
  const f = await fixture({ quantity: 1, create: async () => {
    createdSession = { id: 'cs_test_ambiguous001', livemode: false, url: 'https://checkout.stripe.com/c/test' };
    throw Object.assign(new Error('response lost after accepted create'), { type: 'StripeConnectionError' });
  } });
  const requestKey = randomUUID();
  await assert.rejects(f.start([item], { requestKey }), { code: 'stripe_unavailable' });
  assert.ok(createdSession);
  f.stripe.prices.retrieve = async () => ({ active: false, livemode: false, currency: 'usd', unit_amount: 3000 });
  await assert.rejects(f.start([item], { requestKey }), { code: 'stripe_price_mismatch' });
  const state = await f.state();
  assert.equal(Object.values(state.orders)[0].status, 'checkout_pending');
  assert.equal(state.variants[item.variantId].availableQuantity, 0);
  assert.equal(state.variants[item.variantId].reservedQuantity, 1);
  assert.equal(Object.values(state.orders)[0].checkoutLeaseToken, null);
  await assert.rejects(f.start(), { code: 'insufficient_stock' });
});

test('separate service workers honor durable checkout lease while local callers coalesce', async () => {
  let releaseCreate; let enteredCreate;
  const entered = new Promise(resolve => { enteredCreate = resolve; });
  const waiting = new Promise(resolve => { releaseCreate = resolve; });
  const f = await fixture({ quantity: 1, create: async () => {
    enteredCreate(); await waiting;
    return { id: 'cs_test_leased0001', livemode: false, url: 'https://checkout.stripe.com/c/test' };
  } });
  const requestKey = randomUUID();
  const first = f.start([item], { requestKey });
  await entered;
  const duplicate = f.start([item], { requestKey });
  await assert.rejects(f.start([{ ...item, quantity: 2 }], { requestKey }), { code: 'request_conflict' });
  const secondWorker = createCommerceService({ repository: f.repository, stripe: f.stripe, now: clock });
  await assert.rejects(secondWorker.checkout({ items: [item] }, { requestKey }), { code: 'checkout_in_progress', status: 409 });
  assert.equal(f.calls.length, 1);
  releaseCreate();
  assert.equal((await first).sessionId, (await duplicate).sessionId);
  const order = Object.values((await f.state()).orders)[0];
  assert.equal(order.checkoutLeaseToken, null); assert.equal(order.checkoutLeaseUntil, null);
});

test('expired lease owner cannot release stock after another worker acquires recovery lease', async () => {
  let rejectFirst; let enteredCreate;
  const entered = new Promise(resolve => { enteredCreate = resolve; });
  const f = await fixture({ quantity: 1, create: async () => {
    enteredCreate(); return new Promise((_, reject) => { rejectFirst = reject; });
  } });
  const requestKey = randomUUID();
  const first = f.start([item], { requestKey });
  const firstFailure = assert.rejects(first, { code: 'stripe_unavailable' });
  await entered;
  const secondWorker = createCommerceService({ repository: f.repository, stripe: { ...f.stripe, prices: { retrieve: async () => { throw Object.assign(new Error('sandbox authentication rejected'), { type: 'StripeAuthenticationError' }); } } }, now: () => clock() + 121000 });
  await assert.rejects(secondWorker.checkout({ items: [item] }, { requestKey }), { code: 'stripe_unavailable' });
  rejectFirst(Object.assign(new Error('late definitive response'), { type: 'StripeInvalidRequestError' }));
  await firstFailure;
  const state = await f.state(); const order = Object.values(state.orders)[0];
  assert.equal(order.status, 'checkout_pending');
  assert.equal(order.checkoutLeaseToken, null);
  assert.equal(state.variants[item.variantId].availableQuantity, 0);
  assert.equal(state.variants[item.variantId].reservedQuantity, 1);
  assert.equal(Object.values(state.reservations)[0].status, 'reserved');
});

test('fulfillment and verified refund records are bounded, idempotent and never restock automatically',async()=>{
 const f=await fixture();const session=await f.start();await f.service.webhook(await f.event(session));const order=Object.values((await f.state()).orders)[0];
 await assert.rejects(f.service.fulfill(order.id,{carrier:'Example',trackingNumber:'T1',trackingUrl:'javascript:alert(1)'}),{code:'invalid_tracking'});
 await f.service.fulfill(order.id,{carrier:'Example',trackingNumber:'T1',trackingUrl:'https://example.invalid/track/T1',carrierAccepted:true});
 assert.equal((await f.state()).orders[order.id].fulfillmentStatus,'shipped');
 assert.equal(await f.service.recordVerifiedRefund(order.id,{refundId:'re_mockpartial',amountCents:1000}),true);
 assert.equal(await f.service.recordVerifiedRefund(order.id,{refundId:'re_mockpartial',amountCents:1000}),false);
 await assert.rejects(f.service.recordVerifiedRefund(order.id,{refundId:'re_mockexcess',amountCents:99999}),{code:'invalid_refund'});
 await f.service.recordVerifiedRefund(order.id,{refundId:'re_mockfull',amountCents:order.totalCents-1000});
 const state=await f.state();assert.equal(state.orders[order.id].status,'refunded');assert.equal(state.orders[order.id].refundStatus,'full');assert.equal(state.variants[item.variantId].soldQuantity,1);assert.equal(state.variants[item.variantId].availableQuantity,4);
});

test('local simulated paid orders never send real email even when provider configuration is present',async()=>{
 const f=await fixture();const session=await f.start();await f.service.webhook(await f.event(session));const id=Object.values((await f.state()).orders)[0].id;
 await f.repository.transaction(s=>{s.orders[id].testProvider='mock';});
 const {deliverOrderEmails}=await import('../netlify/commerce/order-email.mjs');let calls=0;
 await deliverOrderEmails({repository:f.repository,orderId:id,env:{RESEND_API_KEY:'synthetic',RESEND_FROM:'test@example.invalid'},fetchImpl:async()=>{calls++;throw new Error('No external call allowed');}});
 assert.equal(calls,0);
});

test('verified charge reference is persisted idempotently without altering payment or exposing provider IDs',async()=>{
 const f=await fixture(),session=await f.start();
 const charge={id:'evt_ChargeReference',type:'charge.succeeded',livemode:false,data:{object:{id:'ch_Reference',payment_intent:'pi_test',livemode:false,paid:true,currency:'usd',amount:3940}}};
 await assert.rejects(f.service.webhook(charge),{code:'unknown_order'});
 await f.service.webhook(await f.event(session));
 await f.service.webhook(charge);await f.service.webhook(charge);
 const state=await f.state(),order=Object.values(state.orders)[0];assert.equal(order.chargeId,'ch_Reference');assert.equal(order.paymentIntentId,'pi_test');assert.equal(order.status,'paid');
 assert.equal(state.variants['e92-tee-m'].soldQuantity,1);
 const publicOrder=await f.service.status(session.sessionId,session.orderAccessToken);assert.equal(publicOrder.chargeId,undefined);assert.equal(publicOrder.paymentIntentId,undefined);
 await assert.rejects(f.service.webhook({...charge,id:'evt_Mismatch',data:{object:{...charge.data.object,id:'ch_Other'}}}),{code:'payment_reference_mismatch'});
 await assert.rejects(f.service.webhook({...charge,id:'evt_Live',livemode:true}),{code:'invalid_event'});
});
