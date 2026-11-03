import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {syncTestCatalog} from '../scripts/sync-stripe-test-catalog.mjs';
import {testKey} from '../netlify/commerce/runtime.mjs';
test('catalog sync maps all fifteen variants and is idempotent with mocked Stripe',async()=>{
 const repository=createMemoryRepository();await seedTestCatalog(repository,{quantity:2});const products=[],prices=[];
 const stripe={products:{list:async()=>({data:products}),create:async input=>{const p={...input,id:'prod_'+products.length,livemode:false};products.push(p);return p;}},prices:{list:async({product})=>({data:prices.filter(p=>p.product===product)}),create:async input=>{const p={...input,id:'price_'+prices.length,livemode:false};prices.push(p);return p;}}};
 assert.deepEqual(await syncTestCatalog({repository,stripe}),{products:3,variants:15});await syncTestCatalog({repository,stripe});assert.equal(products.length,3);assert.equal(prices.length,15);
 assert.equal(await repository.transaction(s=>Object.values(s.variants).every(v=>v.stripePriceId&&v.stripeProductId)),true);
});
test('only test/restricted-test credentials are accepted',()=>{assert.equal(testKey('sk_live_abc'),false);assert.equal(testKey('rk_live_abc'),false);assert.equal(testKey('pk_test_abc'),false);assert.equal(testKey('rk_test_mock'),true);});
