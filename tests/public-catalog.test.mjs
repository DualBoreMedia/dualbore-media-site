import test from 'node:test';
import assert from 'node:assert/strict';
import {publicCatalogProducts} from '../src/products.js';
import {filterShopProducts} from '../src/commerce/shop-discovery.js';

const physical={id:'new-tee',type:'physical',name:'Approved new tee',description:'Reviewed public snapshot',category:'Track gear',audience:'unisex',sku:'QA-NEW-TEE',priceCents:3500,images:['/assets/IMG_5076.jpg'],sizes:['XS','3XL'],fulfillment:'made_to_order'};
test('authoritative catalog uses approved metadata, legacy tombstones and only published input',()=>{
 const rows=publicCatalogProducts({products:[physical],hiddenProductIds:['e92-tee','e90-crewneck']});
 assert.ok(!rows.some(row=>row.id==='e92-tee'||row.id==='e90-crewneck'));
 assert.equal(rows.find(row=>row.id==='new-tee').previewPrice,35);
 assert.equal(rows.find(row=>row.id==='new-tee').image,'/assets/IMG_5076.jpg');
 assert.deepEqual(filterShopProducts(rows,{category:'Track gear',audience:'unisex'}).map(row=>row.id),['new-tee']);
 assert.equal(filterShopProducts(rows,{sort:'price-high'})[0].previewPrice,50);
 assert.equal(filterShopProducts(rows,{sort:'price-low'})[0].id,'new-tee');
 assert.deepEqual(publicCatalogProducts({products:[{...physical,id:'e92-tee'}],hiddenProductIds:[]}).filter(row=>row.id==='e92-tee').map(row=>row.name),['Approved new tee']);
 assert.equal(publicCatalogProducts({products:[],hiddenProductIds:[]}).length,3);
});
test('incomplete, malformed and ambiguous catalog responses are not static fallback authority',()=>{
 for(const data of [null,{}, {products:[]}, {products:null,hiddenProductIds:[]}, {products:[],hiddenProductIds:null}, {products:[],hiddenProductIds:[null]}, {products:[physical,physical],hiddenProductIds:[]}, {products:[physical],hiddenProductIds:[physical.id]}, {products:Array(1001).fill(physical),hiddenProductIds:[]}, {products:[],hiddenProductIds:Array(1001).fill('x')}])assert.throws(()=>publicCatalogProducts(data));
 for(const patch of [{id:''},{name:''},{type:'mx_setup'},{description:''},{category:''},{audience:''},{sku:''},{priceCents:0},{priceCents:1.2},{images:[]},{images:['https://example.invalid/image.jpg']},{images:['/assets/../private.jpg']},{sizes:[]},{sizes:[null]}])assert.throws(()=>publicCatalogProducts({products:[{...physical,...patch}],hiddenProductIds:[]}));
});
