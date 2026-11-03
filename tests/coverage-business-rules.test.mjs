import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';

test('changed provider amount cannot create a Checkout Session or keep a definitive reservation', async () => {
  const repository = createMemoryRepository();
  await seedTestCatalog(repository, {quantity: 1});
  await repository.transaction(state => {state.variants['e92-tee-m'].stripePriceId = 'price_expected';});
  let calls = 0;
  const stripe = {prices: {retrieve: async () => ({active: true, livemode: false, currency: 'usd', unit_amount: 1})}, checkout: {sessions: {create: async () => {calls++; return {id: 'cs_test_mutationcheck', livemode: false, url: 'https://checkout.stripe.com/c/test'};}}}};
  const service = createCommerceService({repository, stripe});
  await assert.rejects(service.checkout({items: [{variantId: 'e92-tee-m', quantity: 1}]}, {requestKey: randomUUID()}), {code: 'stripe_price_mismatch'});
  assert.equal(calls, 0);
  const variant = await repository.transaction(state => state.variants['e92-tee-m']);
  assert.deepEqual([variant.availableQuantity, variant.reservedQuantity], [1, 0]);
});
