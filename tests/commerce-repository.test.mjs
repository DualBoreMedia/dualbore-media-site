import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../netlify/commerce/memory-repository.mjs';
import { createPostgresRepository, runMigrations } from '../netlify/commerce/repository.mjs';
import { PGlite } from '@electric-sql/pglite';

const variant = { id: 'tee-m', productId: 'tee', sku: 'DBM-TEE-M', name: 'Tee', size: 'M', active: true, priceCents: 3000, stripePriceId: 'price_test', availableQuantity: 1, reservedQuantity: 0, soldQuantity: 0 };
const now = '2026-10-12T12:00:00.000Z';

test('memory transactions serialize final-unit reservations and roll back failures', async () => {
  const repository = createMemoryRepository({ variants: { 'tee-m': variant } });
  const reserve = () => repository.transaction(async state => {
    const item = state.variants['tee-m'];
    if (!item.availableQuantity) return false;
    await Promise.resolve();
    item.availableQuantity--; item.reservedQuantity++;
    return true;
  });
  assert.deepEqual(await Promise.all([reserve(), reserve()]), [true, false]);
  await assert.rejects(repository.transaction(state => { state.variants['tee-m'].soldQuantity = 999; throw new Error('abort'); }));
  assert.equal(await repository.transaction(state => state.variants['tee-m'].soldQuantity), 0);
  const detached = await repository.transaction(state => state.variants['tee-m']);
  detached.soldQuantity = 100;
  assert.equal(await repository.transaction(state => state.variants['tee-m'].soldQuantity), 0);
});

test('Postgres migrations, normalized persistence, reload, uniqueness and rollback', async () => {
  const database = new PGlite();
  const locks = [];
  // PGlite runs real PostgreSQL SQL, but has no advisory-lock extension or pool.
  const client = { query: async (sql, params) => {
    if (sql.includes('pg_advisory_xact_lock')) { locks.push(sql); return { rows: [] }; }
    if (!params && sql.includes(';')) return (await database.exec(sql)).at(-1);
    return database.query(sql, params);
  }, release() {} };
  const pool = { connect: async () => client };
  try {
    await runMigrations(pool); await runMigrations(pool);
    assert.equal((await database.query('SELECT count(*)::int AS n FROM commerce_migrations')).rows[0].n, 4);
    const repository = createPostgresRepository(pool);
    await repository.transaction(state => {
      state.variants[variant.id] = structuredClone(variant);
      state.orders.o1 = { id: 'o1', orderNumber: 'DBM-100001', requestKey: 'request-1', cartHash: 'hash', status: 'checkout_pending', sessionId: 'cs_test_1', sessionUrl: 'https://checkout.stripe.com/test', paymentIntentId: null, currency: 'usd', subtotalCents: 3000, shippingCents: 700, taxCents: null, totalCents: null, customerEmail: null, shippingName: null, shippingAddress: null, items: [{ variantId: variant.id, sku: variant.sku, name: variant.name, size: 'M', quantity: 1, unitPriceCents: 3000, lineTotalCents: 3000 }], createdAt: now, expiresAt: now, paidAt: null, fulfilledAt: null, cancelledAt: null, carrier: null, trackingNumber: null, trackingUrl: null, shippedAt: null };
      state.reservations.r1 = { id: 'r1', orderId: 'o1', sessionId: 'cs_test_1', variantId: variant.id, quantity: 1, status: 'reserved', expiresAt: now, createdAt: now, releasedAt: null, convertedAt: null };
      state.events.e1 = { id: 'e1', type: 'checkout.session.completed', createdAt: now, processedAt: null, status: 'processing' };
      state.emails.mail1 = { id: 'mail1', orderId: 'o1', emailType: 'confirmation', provider: 'resend', providerMessageId: null, status: 'pending', attemptCount: 0, lastError: null, createdAt: now, sentAt: null };
      state.orders.o1.accessTokenHash = 'opaque-hash';state.orders.o1.chargeId='ch_PersistedReference';
      state.emails.mail1.leaseToken = 'lease-1';
    });
    const loaded = await createPostgresRepository(pool).transaction(state => state);
    assert.equal(loaded.orders.o1.items[0].lineTotalCents, 3000);
    assert.equal(loaded.reservations.r1.quantity, 1);
    assert.equal(loaded.events.e1.type, 'checkout.session.completed');
    assert.equal(loaded.emails.mail1.status, 'pending');
    assert.equal(loaded.orders.o1.accessTokenHash, 'opaque-hash');assert.equal(loaded.orders.o1.chargeId,'ch_PersistedReference');assert.equal((await database.query('SELECT stripe_charge_id FROM orders')).rows[0].stripe_charge_id,'ch_PersistedReference');
    assert.equal(loaded.emails.mail1.leaseToken, 'lease-1');
    assert.equal((await database.query('SELECT sku_snapshot FROM order_items')).rows[0].sku_snapshot, variant.sku);
    await assert.rejects(repository.transaction(state => { state.variants[variant.id].availableQuantity = -1; }));
    assert.equal(await repository.transaction(state => state.variants[variant.id].availableQuantity), 1);
    await assert.rejects(repository.transaction(state => { state.orders.o2 = { ...state.orders.o1, id: 'o2' }; }));
    assert.equal(await repository.transaction(state => Object.keys(state.orders).length), 1);
    await assert.rejects(repository.transaction(state => { state.events.e1.status = 'processed'; throw new Error('rollback'); }));
    assert.equal(await repository.transaction(state => state.events.e1.status), 'processing');
    await repository.transaction(state => {
      state.variants[variant.id].name = "Tee'); DROP TABLE orders; --";
      state.orders.o1.items[0].quantity = 2;
      state.orders.o1.items[0].lineTotalCents = 6000;
      delete state.events.e1;
    });
    assert.equal(await repository.transaction(state => state.variants[variant.id].name), "Tee'); DROP TABLE orders; --");
    assert.equal((await database.query('SELECT count(*)::int AS n FROM order_items')).rows[0].n, 1);
    assert.equal((await database.query('SELECT quantity FROM order_items')).rows[0].quantity, 2);
    assert.equal(await repository.transaction(state => Object.keys(state.events).length), 0);
    assert.ok(locks.length > 0);
  } finally { await database.close(); }
});
