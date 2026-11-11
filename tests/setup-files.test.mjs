import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createProductManager} from '../netlify/operations/products.mjs';
import {createSetupFileManager} from '../netlify/setups/file-manager.mjs';
import {setupFilesHttp} from '../netlify/setups/files-http.mjs';
import entry,{config} from '../netlify/functions/setup-files.mjs';

const admin={role:'admin',userId:'workos:qa-admin',mfa:true,mfaFresh:true};
const bytes=()=>{const b=Buffer.alloc(244);Buffer.from('c85393451601','hex').copy(b);b.write('MX2OEM_2023_Husqvarna_TC_125',6);return b;};
const draft={type:'mx_setup',name:'Synthetic test setup',sku:'QA-SETUP',compatibility:'verified'};
async function fixture(){const repository=createMemoryRepository();const products=createProductManager({repository});const {product}=await products.mutate(admin,{action:'product-save',product:draft});return{repository,product,manager:createSetupFileManager({repository}),input:{productId:product.id,expectedVersion:product.version,filename:'Synthetic.stp',bytes:bytes()}};}

test('Admin file attachment is private, versioned, audited, deduplicated and resets compatibility testing',async()=>{
 const f=await fixture();assert.deepEqual(await f.manager.read(admin,f.product.id),{file:null});
 const result=await f.manager.attach(admin,f.input);assert.equal(result.product.version,1);assert.equal(result.product.draft.compatibility,'unverified');assert.equal(result.product.status,'draft');assert.equal(result.product.setupFile.embeddedBikeId,'MX2OEM_2023_Husqvarna_TC_125');
 assert.deepEqual((await f.manager.read(admin,f.product.id)).file,result.product.setupFile);
 const again=await f.manager.attach(admin,{...f.input,expectedVersion:1,filename:'Renamed.stp'});assert.equal(again.product.setupFile.assetId,result.product.setupFile.assetId);
 const state=await f.repository.transaction(s=>s);assert.equal(Object.values(state.audit).filter(a=>a.action==='setup-file-attached').length,2);assert.ok(Object.values(state.audit).every(a=>a.actor===admin.userId));assert.equal(JSON.stringify(state).includes(bytes().toString('base64')),false);
 await assert.rejects(f.manager.attach(admin,f.input),{code:'stale_record'});
});
test('file manager rejects unauthorized, malformed, archived, physical, missing and unavailable storage operations',async()=>{
 const f=await fixture();for(const principal of [{...admin,role:'customer'},{...admin,role:'employee'},{...admin,mfa:false}]){await assert.rejects(f.manager.read(principal,f.product.id));await assert.rejects(f.manager.attach(principal,f.input));}
 for(const principal of [{...admin,mfaFresh:false},{...admin,userId:''}])await assert.rejects(f.manager.attach(principal,f.input));
 for(const patch of [{expectedVersion:null},{expectedVersion:-1},{filename:'../bad.stp'},{bytes:Buffer.alloc(244)},{productId:'missing'},{productId:'__proto__'}])await assert.rejects(f.manager.attach(admin,{...f.input,...patch}));
 await f.repository.transaction(s=>{s.products[f.product.id].status='archived';});await assert.rejects(f.manager.attach(admin,f.input),{code:'archived_product'});
 await f.repository.transaction(s=>{s.products[f.product.id].status='draft';s.products[f.product.id].draft.type='physical';});await assert.rejects(f.manager.read(admin,f.product.id),{code:'setup_not_found'});
 const unavailable=createSetupFileManager({repository:{transaction:fn=>fn({products:{[f.product.id]:f.product}})}});await assert.rejects(unavailable.attach(admin,f.input),{code:'setup_storage_unavailable'});
});
test('concurrent file edits accept one expected version; rollback preserves private asset state',async()=>{
 const f=await fixture();const results=await Promise.allSettled([f.manager.attach(admin,f.input),f.manager.attach(admin,f.input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const second=bytes();second[243]=5;let assetId;await assert.rejects(f.repository.transaction(async(_,assets)=>{assetId=(await assets.put(second,{filename:'Rollback.stp',actor:admin.userId,createdAt:new Date().toISOString()})).id;throw Error('rollback');}));assert.equal(await f.repository.transaction((_,assets)=>assets.metadata(assetId)),null);assert.equal(await f.repository.transaction((_,assets)=>assets.read(assetId)),null);
});
test('file HTTP boundary enforces same-origin Admin MFA, body limits and safe metadata-only responses',async()=>{
 const f=await fixture(),env={SITE_ORIGIN:'http://127.0.0.1:4320'},options={env,runtime:async()=>({repository:f.repository}),auth:async()=>admin};
 const url=env.SITE_ORIGIN+'/api/setup-files?productId='+f.product.id;
 const headers={Origin:env.SITE_ORIGIN,'Content-Type':'application/octet-stream','X-Setup-Filename':'Synthetic.stp','X-Product-Version':'0'};
 const req=(patch={})=>new Request(url,{method:'POST',headers,body:bytes(),...patch});
 assert.equal((await setupFilesHttp(req({method:'DELETE'}),options)).status,405);
 for(const h of [{...headers,Origin:'https://evil.invalid'},{...headers,Origin:''}])assert.equal((await setupFilesHttp(req({headers:h}),options)).status,403);
 assert.equal((await setupFilesHttp(req(),{...options,env:{}})).status,403);
 assert.equal((await setupFilesHttp(req(),{...options,auth:async()=>({...admin,role:'employee'})})).status,403);
 assert.equal((await setupFilesHttp(req(),{...options,auth:async()=>({...admin,mfaFresh:false})})).status,403);
 assert.equal((await setupFilesHttp(req({headers:{...headers,'Content-Type':'text/plain'}}),options)).status,415);
 for(const h of [{...headers,'X-Setup-Filename':'%'},{...headers,'X-Product-Version':'NaN'}])assert.equal((await setupFilesHttp(req({headers:h}),options)).status,400);
 assert.equal((await setupFilesHttp(req({body:Buffer.alloc(2*1024*1024+1)}),options)).status,400);
 assert.equal((await setupFilesHttp(new Request(url+'&productId=x'),options)).status,400);
 const saved=await setupFilesHttp(req(),options);assert.equal(saved.status,200);assert.equal(saved.headers.get('Cache-Control'),'no-store');const savedData=await saved.json();assert.ok(savedData.product.setupFile.assetId);assert.equal(JSON.stringify(savedData).includes(bytes().toString('base64')),false);
 const read=await setupFilesHttp(new Request(url),options);assert.equal(read.status,200);assert.ok((await read.json()).file.sha256);
 assert.equal((await setupFilesHttp(new Request(url),{...options,runtime:async()=>{throw Error('private connection');}})).status,503);
 assert.equal((await setupFilesHttp(new Request(url),{...options,runtime:async()=>({repository:{consumeRateLimit:async()=>false}})})).status,429);
 assert.equal((await setupFilesHttp(new Request(url),{...options,runtime:async()=>({repository:{consumeRateLimit:async(_id)=>_id.length===0}})})).status,429);
 const audit=await f.repository.transaction(s=>Object.values(s.audit));assert.equal(audit.filter(a=>a.action==='authorization-denied').length,2);
 assert.equal(config.path,'/api/setup-files');assert.equal((await entry(new Request('https://example.invalid/api/setup-files'),{ip:'test'})).status,403);
});
