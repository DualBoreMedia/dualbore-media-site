import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createProductManager,publicSetupPreviews,publicProducts,validateProduct} from '../netlify/operations/products.mjs';
import {createSetupFileManager} from '../netlify/setups/file-manager.mjs';
import {productsHttp} from '../netlify/functions/products.mjs';
import {canonicalBike,fileMatchesBike,setupIdentity,setupStage} from '../src/setups/identity.js';

const admin={role:'admin',userId:'workos:synthetic-owner',mfa:true,mfaFresh:true};
const tc125='husqvarna-tc-125-2023';
const draft=(patch={})=>({type:'mx_setup',name:'Synthetic TC125 baseline',sku:'QA-TC125-SX',category:'MX Bikes setups',audience:'',priceCents:200,description:'Synthetic test metadata, not a real compatibility claim.',images:[],sizes:[],fulfillment:'digital',bikeId:tc125,oemBike:'2023 Husqvarna TC 125',bikeVersion:'',gameVersion:'',discipline:'SX',track:'',compatibility:'unverified',...patch});
function bytes(bike='MX2OEM_2023_Husqvarna_TC_125',tail=0){const buffer=Buffer.alloc(244);Buffer.from('c85393451601','hex').copy(buffer);buffer.write(bike,6);buffer[243]=tail;return buffer;}
function fixture(){
 const repository=createMemoryRepository(),manager=createProductManager({repository}),files=createSetupFileManager({repository});
 return {repository,manager,files,save:product=>manager.mutate(admin,{action:'product-save',product}),edit:(row,product)=>manager.mutate(admin,{action:'product-save',productId:row.id,expectedVersion:row.version,product}),action:(row,action)=>manager.mutate(admin,{action,productId:row.id,expectedVersion:row.version}),previews:()=>repository.transaction(publicSetupPreviews)};
}

test('setup previews are explicit saved metadata snapshots; drafts, hidden and archived records do not leak',async()=>{
 const f=fixture();let {product:p}=await f.save(draft());
 assert.equal(p.status,'draft');assert.deepEqual(await f.previews(),[]);assert.deepEqual(await f.repository.transaction(publicProducts),[]);
 ({product:p}=await f.action(p,'product-preview-publish'));
 assert.equal(p.status,'draft');assert.equal((await f.previews())[0].name,'Synthetic TC125 baseline');
 ({product:p}=await f.edit(p,{...p.draft,name:'Private next revision',description:'Private draft edit.'}));
 assert.equal((await f.previews())[0].name,'Synthetic TC125 baseline');
 ({product:p}=await f.action(p,'product-preview-publish'));assert.equal((await f.previews())[0].name,'Private next revision');
 ({product:p}=await f.action(p,'product-preview-unpublish'));assert.deepEqual(await f.previews(),[]);
 ({product:p}=await f.action(p,'product-preview-publish'));({product:p}=await f.action(p,'product-archive'));assert.deepEqual(await f.previews(),[]);
 await assert.rejects(f.action(p,'product-preview-publish'));
 const audit=await f.repository.transaction(s=>Object.values(s.audit));assert.deepEqual(audit.map(e=>e.action),['product-save','product-preview-publish','product-save','product-preview-publish','product-preview-unpublish','product-preview-publish','product-archive']);assert.ok(audit.every(e=>e.actor===admin.userId));
});

test('incomplete or forged setup metadata cannot publish a preview or authorize digital sales',async()=>{
 const f=fixture();
 for(const key of ['name','description','bikeId','discipline']){
  const isolated=fixture(),value=draft({sku:'QA-'+key.toUpperCase()});delete value[key];if(key==='bikeId')delete value.oemBike;
  const {product:p}=await isolated.save(value);await assert.rejects(isolated.action(p,'product-preview-publish'),{code:'publication_blocked'});
 }
 const {product:track}=await f.save(draft({sku:'QA-TRACK',discipline:'track'}));await assert.rejects(f.action(track,'product-preview-publish'),{code:'publication_blocked'});
 assert.throws(()=>validateProduct(draft({bikeId:'unapproved-model'})),{code:'invalid_product'});
 assert.throws(()=>validateProduct(draft({track:'A track on a general setup'})),{code:'invalid_product'});
 const {product:p}=await f.save(draft({sku:'QA-VERIFIED',discipline:'MX',bikeVersion:'synthetic-oem',gameVersion:'synthetic-game',compatibility:'verified'}));
 await assert.rejects(f.manager.mutate(admin,{action:'product-publish',productId:p.id,expectedVersion:p.version,priceApproved:true}),{code:'publication_blocked'});
 assert.equal(setupStage(p),'Draft');
});

test('canonical bike identity corrects conflicting labels and rejects wrong bike or model year files atomically',async()=>{
 const f=fixture();const {product:p}=await f.save(draft({oemBike:'A forged alternate bike label'}));
 assert.equal(p.draft.oemBike,'2023 Husqvarna TC 125');assert.equal(canonicalBike(p.draft).id,tc125);
 assert.equal(canonicalBike({oemBike:'2023 Husqvarna TC 125'}).id,tc125);
 assert.equal(fileMatchesBike('MX2OEM_2023_Husqvarna_TC_125',canonicalBike(p.draft)),true);
 assert.equal(fileMatchesBike('MX2OEM_2024_Husqvarna_TC_125',canonicalBike(p.draft)),false);
 assert.equal(fileMatchesBike('MX2OEM_2023_Husqvarna_TC_250',canonicalBike(p.draft)),false);
 for(const bike of ['MX2OEM_2024_Husqvarna_TC_125','MX2OEM_2023_Husqvarna_TC_250','MX1OEM_2023_Yamaha_YZF_450'])await assert.rejects(f.files.attach(admin,{productId:p.id,expectedVersion:p.version,filename:'Synthetic.stp',bytes:bytes(bike)}),{code:'bike_file_mismatch'});
 const unchanged=await f.repository.transaction(s=>s.products[p.id]);assert.equal(unchanged.version,0);assert.equal(unchanged.setupFile,undefined);
 assert.equal((await f.repository.transaction(s=>Object.values(s.audit))).filter(e=>e.action==='setup-file-attached').length,0);
});

test('private replacement records previous immutable metadata; checked files cannot be reassigned to another bike',async()=>{
 const f=fixture();let {product:p}=await f.save(draft());
 ({product:p}=await f.files.attach(admin,{productId:p.id,expectedVersion:p.version,filename:'Synthetic-first.stp',bytes:bytes()}));
 const first=structuredClone(p.setupFile);assert.equal(setupStage(p),'File received');
 ({product:p}=await f.edit(p,{...p.draft,compatibility:'testing'}));assert.equal(setupStage(p),'Testing');
 ({product:p}=await f.edit(p,{...p.draft,compatibility:'verified',bikeVersion:'synthetic-oem',gameVersion:'synthetic-game'}));assert.equal(setupStage(p),'Verified');
 ({product:p}=await f.action(p,'product-preview-publish'));
 ({product:p}=await f.files.attach(admin,{productId:p.id,expectedVersion:p.version,filename:'Synthetic-second.stp',bytes:bytes(undefined,1)}));
 assert.equal(p.setupFileHistory.length,1);assert.equal(p.setupFileHistory[0].assetId,first.assetId);assert.equal(p.setupFileHistory[0].sha256,first.sha256);assert.notEqual(p.setupFile.sha256,first.sha256);assert.equal(p.draft.compatibility,'unverified');assert.equal(setupStage(p),'File received');assert.equal(p.setupPreview.stage,'File received');
 await assert.rejects(f.edit(p,{...p.draft,bikeId:'husqvarna-tc-250-2023'}),{code:'bike_file_mismatch'});
 assert.equal((await f.repository.transaction((_,assets)=>assets.read(first.assetId))).metadata.sha256,first.sha256);
 await assert.rejects(f.files.attach(admin,{productId:p.id,expectedVersion:p.version-1,filename:'Stale.stp',bytes:bytes()}),{code:'stale_record'});
 const rows=await f.repository.transaction(s=>Object.values(s.products));const response=await productsHttp(new Request('https://example.invalid/api/products'),{runtime:async()=>({repository:{readPublishedProducts:async()=>rows}})});
 const data=await response.json();assert.equal(data.products.length,0);assert.equal(data.setupPreviews.length,1);
 assert.deepEqual(Object.keys(data.setupPreviews[0]).sort(),['bikeId','bikeVersion','description','discipline','gameVersion','id','name','priceCents','stage','track'].sort());
 for(const secret of [first.assetId,first.sha256,p.setupFile.assetId,p.setupFile.sha256,'Synthetic-first.stp','Synthetic-second.stp',admin.userId,'embeddedBikeId'])assert.equal(JSON.stringify(data).includes(secret),false,secret);
});

test('identity uniqueness is independent of SKU and serializes concurrent requests; tracks normalize case and punctuation',async()=>{
 const f=fixture();const requests=await Promise.allSettled([f.save(draft({sku:'QA-ONE'})),f.save(draft({sku:'QA-TWO'}))]);
 assert.equal(requests.filter(r=>r.status==='fulfilled').length,1);assert.equal(requests.find(r=>r.status==='rejected').reason.code,'duplicate_setup');
 const {product:a}=await f.save(draft({sku:'QA-TRACK-A',discipline:'track',track:' Test Park - National '}));
 assert.equal(setupIdentity(a.draft),tc125+':track:testparknational');
 await assert.rejects(f.save(draft({sku:'QA-TRACK-B',discipline:'track',track:'test park national'})),{code:'duplicate_setup'});
 await f.save(draft({sku:'QA-OTHER-TRACK',discipline:'track',track:'Another National'}));
 await f.save(draft({sku:'QA-GENERAL-MX',discipline:'MX'}));
});

test('received draft import must not duplicate a manually managed bike and setup identity',async()=>{
 const f=fixture();await f.save(draft());
 try{await f.manager.mutate(admin,{action:'product-import-setups'});}catch(error){assert.equal(error.code,'duplicate_setup');}
 const rows=await f.repository.transaction(s=>Object.values(s.products));
 assert.equal(rows.filter(row=>setupIdentity(row.draft)===tc125+':SX:general').length,1);
});

test('a published preview reserves its identity while its next draft is edited',async()=>{
 const f=fixture();let {product:p}=await f.save(draft());({product:p}=await f.action(p,'product-preview-publish'));
 ({product:p}=await f.edit(p,{...p.draft,discipline:'MX'}));
 await assert.rejects(f.save(draft({sku:'QA-SECOND-SX'})),{code:'duplicate_setup'});
});

test('preview writes require current Admin, MFA and fresh verification; forbidden changes leave state untouched',async()=>{
 const f=fixture();const {product:p}=await f.save(draft());
 const before=await f.repository.transaction(s=>s);
 for(const principal of [{...admin,role:'customer'},{...admin,role:'employee'},{...admin,mfa:false},{...admin,mfaFresh:false},{...admin,userId:''}]){
  for(const action of ['product-preview-publish','product-preview-unpublish','product-archive'])await assert.rejects(f.manager.mutate(principal,{action,productId:p.id,expectedVersion:p.version}));
  await assert.rejects(f.files.attach(principal,{productId:p.id,expectedVersion:p.version,filename:'Synthetic.stp',bytes:bytes()}));
 }
 assert.deepEqual(await f.repository.transaction(s=>s),before);
});
