import {safeAuthDestination} from '../netlify/operations/workos-http.mjs';
import {listingAvailable} from '../netlify/commerce/inventory.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createProductManager,publicProducts,validateProduct,publicationIssues,productImage} from '../netlify/operations/products.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {productsHttp} from '../netlify/functions/products.mjs';
import {listingProduct} from '../src/products.js';
import {filterShopProducts} from '../src/commerce/shop-discovery.js';
const filterProducts=(rows,{search,category,audience,sort}={})=>filterShopProducts(rows,{query:search,category,audience,sort:sort==='price-asc'?'price-low':sort==='price-desc'?'price-high':sort});
const productFilters=products=>({categories:[...new Set(products.map(p=>p.category))].sort(),audiences:[...new Set(products.map(p=>p.audience))].sort()});
const admin={userId:'qa-owner',email:'qa@example.invalid',role:'admin',mfa:true,mfaFresh:true};
const physical=()=>({name:'Synthetic tee',type:'physical',category:'Synthetic apparel',audience:'Synthetic audience',sku:'QA-TEE',priceCents:3000,description:'Synthetic product for testing only.',images:['/assets/IMG_5076.jpg'],fulfillment:'made_to_order',sizes:['S','M']});
const setup=()=>({...physical(),sku:'QA-SETUP',type:'mx_setup',fulfillment:'digital',sizes:[],images:[],oemBike:'Synthetic OEM',bikeVersion:'Synthetic version',gameVersion:'Synthetic game',discipline:'MX',compatibility:'verified'});
test('routine draft editing retains session MFA while every publication/status/import action requires fresh verification',async()=>{
 const repository=createMemoryRepository(),manager=createProductManager({repository}),signedIn={...admin,mfaFresh:false};
 let {product:p}=await manager.mutate(signedIn,{action:'product-save',product:physical()});
 ({product:p}=await manager.mutate(admin,{action:'product-publish',productId:p.id,expectedVersion:p.version,priceApproved:true}));
 const before=await repository.transaction(s=>structuredClone(s));
 await manager.mutate(signedIn,{action:'product-save',productId:p.id,expectedVersion:p.version,product:{...p.draft,name:'Private changed name',priceCents:4000}});
 const after=await repository.transaction(s=>structuredClone(s));
 assert.deepEqual(publicProducts(after),publicProducts(before));assert.deepEqual(after.variants,before.variants);
 assert.equal(after.products[p.id].draft.name,'Private changed name');
 for(const action of ['product-publish','product-unpublish','product-archive','product-preview-publish','product-preview-unpublish','product-import','product-import-setups']){
  await assert.rejects(manager.mutate(signedIn,{action,productId:p.id,expectedVersion:after.products[p.id].version,priceApproved:true}),{code:'step_up_required'});
 }
 const {product:digital}=await manager.mutate(signedIn,{action:'product-save',product:setup()});assert.equal(digital.status,'draft');
 for(const actor of [{...signedIn,mfa:false},{...signedIn,role:'employee'},{...signedIn,role:'customer'}])await assert.rejects(manager.mutate(actor,{action:'product-save',product:{type:'physical'}}));
});
function fixture(){const repository=createMemoryRepository();const manager=createProductManager({repository});const save=product=>manager.mutate(admin,{action:'product-save',product});const action=(row,action,extra={})=>manager.mutate(admin,{action:'product-'+action,productId:row.id,expectedVersion:row.version,...extra});return {repository,manager,save,action};}
test('product lifecycle separates drafts from publication, preserves order counters and records immutable actor attribution',async()=>{
 const f=fixture();let {product:p}=await f.save(physical());assert.equal(p.status,'draft');await assert.rejects(f.action(p,'unpublish'),{code:'invalid_product'});assert.equal(await f.repository.transaction(s=>publicProducts(s).length),0);
 await assert.rejects(f.action(p,'publish'),{code:'invalid_product'});
 ({product:p}=await f.action(p,'publish',{priceApproved:true}));assert.equal(p.status,'published');
 let state=await f.repository.transaction(s=>s);assert.equal(Object.keys(state.variants).length,2);assert.ok(Object.values(state.variants).every(v=>v.priceCents===3000&&v.stripePriceId===null));
 const vid=Object.keys(state.variants)[0];await f.repository.transaction(s=>{Object.assign(s.variants[vid],{reservedQuantity:2,soldQuantity:3,availableQuantity:4,liveStripePriceId:'price_old'});});
 ({product:p}=await f.manager.mutate(admin,{action:'product-save',productId:p.id,expectedVersion:p.version,product:{...p.draft,name:'Edited private name',priceCents:3500,sizes:['S']}}));
 assert.equal((await f.repository.transaction(publicProducts))[0].name,'Synthetic tee');
 ({product:p}=await f.action(p,'publish',{priceApproved:true}));state=await f.repository.transaction(s=>s);assert.equal(state.variants[vid].reservedQuantity,2);assert.equal(state.variants[vid].soldQuantity,3);assert.equal(state.variants[vid].liveStripePriceId,undefined);assert.equal(Object.values(state.variants).filter(v=>v.active).length,1);
 ({product:p}=await f.action(p,'unpublish'));assert.equal((await f.repository.transaction(publicProducts)).length,0);
 ({product:p}=await f.action(p,'archive'));await assert.rejects(f.action(p,'unpublish'),{code:'invalid_product'});await assert.rejects(f.action(p,'archive'),{code:'invalid_product'});await assert.rejects(f.action(p,'publish',{priceApproved:true}),{code:'invalid_product'});await assert.rejects(f.manager.mutate(admin,{action:'product-save',productId:p.id,expectedVersion:p.version,product:physical()}),{code:'invalid_product'});
 assert.ok(Object.values((await f.repository.transaction(s=>s)).audit).every(e=>e.actor===admin.userId));
});
test('drafts may be incomplete; every required physical field and unregistered image blocks publication',async()=>{
 const f=fixture();let {product:p}=await f.save({type:'physical'});assert.ok(publicationIssues(p.draft).length>=9);await assert.rejects(f.action(p,'publish',{priceApproved:true}),{code:'publication_blocked'});
 for(const key of ['name','category','audience','sku','description','priceCents','images','sizes','fulfillment']){const product=physical();delete product[key];assert.ok(publicationIssues(validateProduct(product)).length,key);}
 assert.ok(publicationIssues({...physical(),images:['/assets/nonexistent.jpg']}).length);
 assert.ok(publicationIssues({...physical(),fulfillment:'digital'}).length);
});
test('MX Bikes drafts record exact metadata, but even tested metadata cannot bypass private digital delivery block',async()=>{
 const f=fixture();const {product:p}=await f.save(setup());await assert.rejects(f.action(p,'publish',{priceApproved:true}),{code:'publication_blocked'});
 assert.ok(publicationIssues({type:'mx_setup',discipline:'track'}).some(v=>v.includes('exact track')));
 assert.equal((await f.repository.transaction(publicProducts)).length,0);
 for(const key of ['file','downloadUrl','storageKey','privateFile','deliveryVerified','published','status','approvedBy'])assert.throws(()=>validateProduct({...setup(),[key]:'injected'}),{code:'invalid_product'});
});
test('server rejects unknown fields, invalid values, files, prices, size collisions and duplicate SKUs',async()=>{
 for(const product of [null,[],{}, {...physical(),evil:true},{...physical(),name:'\0bad'},{...physical(),priceCents:'30'},{...physical(),priceCents:0},{...physical(),priceCents:1.2},{...physical(),sku:'lowercase'},{...physical(),images:['https://example.invalid/a.jpg']},{...physical(),images:['/assets/../private.jpg']},{...physical(),sizes:['M','M']},{...physical(),sizes:['<script>']},{...physical(),fulfillment:'unknown'},{...setup(),discipline:'unknown'},{...setup(),compatibility:'yes'}])assert.throws(()=>validateProduct(product),{code:'invalid_product'});
 for(const image of [null,'/assets/../x.jpg','//evil/x.png','/assets/file.zip'])assert.equal(productImage(image),false);
 const f=fixture();await f.save(physical());await assert.rejects(f.save(physical()),{code:'duplicate_sku'});await assert.rejects(f.save({...physical(),sku:'QA-TEE-M'}),{code:'duplicate_sku'});
 await assert.rejects(f.save({...physical(),sku:'QA-UNIQUE',sizes:['m','M']}),{code:'invalid_product'});
 await f.repository.transaction(s=>{s.variants.old={id:'old',productId:'old-product',sku:'QA-OLD'};});await assert.rejects(f.save({...physical(),sku:'QA-OLD'}),{code:'duplicate_sku'});
});
test('customer, employee, missing/fresh MFA and malformed actions cannot manage products; concurrent edits reject stale versions',async()=>{
 const f=fixture();for(const actor of [{...admin,role:'customer'},{...admin,role:'employee'},{...admin,mfa:false},{...admin,userId:''}])await assert.rejects(f.manager.mutate(actor,{action:'product-save',product:physical()}));
 for(const payload of [null,[],{action:'product-hack'},{action:'product-save',product:physical(),priceCents:1},{action:'product-publish'},{action:'product-save',productId:'missing',product:physical()}])await assert.rejects(f.manager.mutate(admin,payload));
 const {product:p}=await f.save(physical());const update={action:'product-save',productId:p.id,expectedVersion:0,product:physical()};const results=await Promise.allSettled([f.manager.mutate(admin,update),f.manager.mutate(admin,update)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'stale_record');
 const service=createOperationsService({repository:f.repository});assert.equal((await service.read(admin,{admin:true})).products.length,1);assert.equal((await service.read({...admin,role:'customer'})).products,undefined);
 await assert.rejects(service.mutate({...admin,role:'customer'},{action:'product-save',product:physical()}),{code:'admin_required'});
});
test('existing Drop 01 import is idempotent, preserves variants and imports only confirmed facts',async()=>{
 const f=fixture();await f.manager.mutate(admin,{action:'product-import'});await f.manager.mutate(admin,{action:'product-import'});const state=await f.repository.transaction(s=>s);assert.equal(Object.keys(state.products).length,3);assert.equal(Object.keys(state.variants).length,0);assert.ok(Object.values(state.products).every(p=>p.status==='draft'&&p.draft.audience===''));assert.equal(state.products['e92-tee'].draft.priceCents,3000);
});
test('inventory activation cannot bypass unpublished or archived product decisions',()=>{
 const v={productId:'p',size:'M',active:true};assert.equal(listingAvailable({products:{}},v),true);
 for(const status of ['draft','archived'])assert.equal(listingAvailable({products:{p:{status,published:{type:'physical',sizes:['M']}}}},v),false);
 assert.equal(listingAvailable({products:{p:{status:'published',published:{type:'physical',sizes:['S']}}}},v),false);
 assert.equal(listingAvailable({products:{p:{status:'published',published:{type:'physical',sizes:['M']}}}},v),true);
});
test('received MX Bikes draft import reuses known metadata without claiming versions or exposing files',async()=>{
 const f=fixture();await f.manager.mutate(admin,{action:'product-import-setups'});await f.manager.mutate(admin,{action:'product-import-setups'});const state=await f.repository.transaction(s=>s);const rows=Object.values(state.products);assert.equal(rows.length,3);assert.ok(rows.every(p=>p.status==='draft'&&p.draft.type==='mx_setup'&&p.draft.bikeVersion===''&&p.draft.gameVersion===''&&p.draft.compatibility==='unverified'));assert.deepEqual(rows.map(p=>p.draft.priceCents).sort(),[100,100,200]);assert.equal(publicProducts(state).length,0);assert.ok(!JSON.stringify(rows).includes('storageKey'));
});
test('sensitive product verification returns to the existing Admin editor without allowing external redirects',()=>{
 assert.equal(safeAuthDestination('/admin?view=products'),'/admin?view=products');assert.equal(safeAuthDestination('https://example.invalid/admin?view=products'),'/account');
});
test('metadata populates categories/audiences, combined search filters and numeric price sorting without hardcoded values',()=>{
 const a=listingProduct({id:'a',...physical()}),b=listingProduct({id:'b',...physical(),name:'Other',sku:'B',category:'New category',audience:'New audience',priceCents:5000});
 assert.deepEqual(productFilters([a,b,a]).categories,['New category','Synthetic apparel']);assert.deepEqual(productFilters([a,b]).audiences,['New audience','Synthetic audience']);
 assert.deepEqual(filterProducts([a,b],{search:' qa-tee ',category:a.category,audience:a.audience}).map(p=>p.id),['a']);
 assert.equal(filterProducts([a,b],{search:'none'}).length,0);assert.equal(filterProducts([a,b],{category:'none'}).length,0);assert.equal(filterProducts([a,b],{audience:'none'}).length,0);
 assert.deepEqual(filterProducts([b,a],{sort:'price-asc'}).map(p=>p.id),['a','b']);assert.deepEqual(filterProducts([a,b],{sort:'price-desc'}).map(p=>p.id),['b','a']);
});
test('public endpoint reads only published physical snapshots without draft metadata, provider IDs, transactions or private setup fields',async()=>{
 const rows=[{id:'draft',status:'draft',draft:physical()},{id:'physical',status:'published',draft:{...physical(),name:'Private edit'},published:physical(),approvedBy:'private-owner'},{id:'setup',status:'published',published:setup()}];
 const runtime=async()=>({repository:{readPublishedProducts:async()=>rows,transaction:()=>{throw Error('Public reads must not rewrite commerce');}}});
 const r=await productsHttp(new Request('https://example.invalid/api/products'),{runtime});assert.equal(r.status,200);const data=await r.json();assert.equal(data.products.length,1);assert.equal(data.products[0].name,'Synthetic tee');assert.equal(JSON.stringify(data).includes('private-owner'),false);
 assert.equal((await productsHttp(new Request('https://example.invalid/api/products',{method:'POST'}),{runtime})).status,405);
 assert.equal((await productsHttp(new Request('https://example.invalid/api/products'),{runtime:async()=>{throw Error('private connection');}})).status,503);
});
test('archiving an imported legacy draft hides its static preview even before first publication',async()=>{
 const f=fixture();await f.manager.mutate(admin,{action:'product-import'});const original=await f.repository.transaction(s=>s.products['e92-tee']);await f.action(original,'archive');
 const rows=await f.repository.transaction(s=>Object.values(s.products));const response=await productsHttp(new Request('https://example.invalid/api/products'),{runtime:async()=>({repository:{readPublishedProducts:async()=>rows}})});const data=await response.json();assert.deepEqual(data.hiddenProductIds,['e92-tee']);assert.equal(data.products.length,0);
});
