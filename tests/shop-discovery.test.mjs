import test from 'node:test';
import assert from 'node:assert/strict';
import {merch} from '../src/content.js';
import {filterShopProducts,shopAudiences,shopCategories,shopSorts} from '../src/commerce/shop-discovery.js';

test('search finds actual approved design previews, across names, keywords and description',()=>{
 assert.equal(filterShopProducts(merch,{query:'E92 tee'}).length,1);
 assert.equal(filterShopProducts(merch,{query:'  SV1000S   silhouette '})[0].id,'sv1000s-silhouette');
 assert.equal(filterShopProducts(merch,{query:'this-does-not-exist'}).length,0);
 assert.equal(filterShopProducts(merch,{query:'  '}).length,3);
});
test('category and gender filters are accurate: no invented accessories, stickers or gender assignments',()=>{
 assert.equal(filterShopProducts(merch,{category:'apparel'}).length,3);
 assert.deepEqual(filterShopProducts(merch,{category:'tees'}).map(x=>x.id),['e92-tee']);
 assert.equal(filterShopProducts(merch,{category:'crewnecks'}).length,2);
 for(const category of ['accessories','stickers'])assert.equal(filterShopProducts(merch,{category}).length,0);
 for(const audience of ['men','women','unisex','kids'])assert.equal(filterShopProducts(merch,{audience}).length,0);
 assert.equal(shopCategories.length,6);assert.equal(shopAudiences.length,5);assert.equal(shopSorts.length,4);
});
test('sorting is deterministic, does not mutate catalog and can use trusted production prices',()=>{
 const original=merch.map(x=>x.id);
 assert.deepEqual(filterShopProducts(merch,{sort:'name'}).map(x=>x.id),['e90-crewneck','e92-tee','sv1000s-silhouette']);
 assert.equal(filterShopProducts(merch,{sort:'price-low'})[0].id,'e92-tee');
 assert.equal(filterShopProducts(merch,{sort:'price-high'}).at(-1).id,'e92-tee');
 assert.equal(filterShopProducts(merch,{sort:'price-high'},p=>p.id==='e92-tee'?100:20)[0].id,'e92-tee');
 assert.deepEqual(merch.map(x=>x.id),original);
});
