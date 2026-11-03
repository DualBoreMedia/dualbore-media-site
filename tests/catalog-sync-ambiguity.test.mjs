import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {syncTestCatalog} from '../scripts/sync-stripe-test-catalog.mjs';

test('catalog sync refuses ambiguous product mappings before creating prices', async()=>{
 const repository=createMemoryRepository();await seedTestCatalog(repository,{quantity:1});
 const variant=await repository.transaction(s=>Object.values(s.variants)[0]);
 await repository.transaction(s=>{s.variants={[variant.id]:variant};});
 const product={livemode:false,metadata:{dbm_product_id:variant.productId,dbm_environment:'test'}};
 let writes=0;
 const stripe={products:{list:async()=>({data:[{...product,id:'prod_a'},{...product,id:'prod_b'}]})},prices:{list:async()=>({data:[]}),create:async()=>{writes++;return{id:'price_new',livemode:false};}}};
 await assert.rejects(syncTestCatalog({repository,stripe}),/Ambiguous product/);assert.equal(writes,0);
});

test('catalog sync refuses duplicate matching prices rather than selecting arbitrarily', async()=>{
 const repository=createMemoryRepository();await seedTestCatalog(repository,{quantity:1});
 const variant=await repository.transaction(s=>Object.values(s.variants)[0]);
 await repository.transaction(s=>{s.variants={[variant.id]:variant};});
 const product={id:'prod_a',livemode:false,metadata:{dbm_product_id:variant.productId,dbm_environment:'test'}};
 const price={livemode:false,currency:'usd',unit_amount:3000,metadata:{dbm_variant_id:variant.id}};
 const stripe={products:{list:async()=>({data:[product]})},prices:{list:async()=>({data:[{...price,id:'price_a'},{...price,id:'price_b'}]})}};
 await assert.rejects(syncTestCatalog({repository,stripe}),/Ambiguous price/);
});
