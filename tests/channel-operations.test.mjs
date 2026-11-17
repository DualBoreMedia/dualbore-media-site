import test from 'node:test';import assert from 'node:assert/strict';
import {operationsHttp} from '../netlify/operations/http.mjs';import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';import {createOperationsService} from '../netlify/operations/service.mjs';
const admin={userId:'qa-admin',role:'admin',mfa:true,mfaFresh:false,email:'admin@example.invalid',sessionId:'qa'};
const input={action:'refresh-videos'},env={SITE_ORIGIN:'https://site.invalid',YOUTUBE_SYNC_ENABLED:'true',YOUTUBE_API_KEY:'synthetic-only'};
const request=body=>new Request(env.SITE_ORIGIN+'/api/operations',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.SITE_ORIGIN},body:JSON.stringify(body)});
test('manual refresh requires a current MFA Admin, accepts no client settings and shares one cooldown',async()=>{
 const repository=createMemoryRepository();let calls=0,closed=0;const options={env,runtime:async()=>({repository}),auth:async()=>admin,videoStore:()=>({close:async()=>closed++,status:async()=>({itemCount:49})}),videoSync:async args=>{calls++;assert.equal(args.apiKey,'synthetic-only');return {updated:true,recorded:true,reason:'updated',count:49};}};
 for(const principal of [{...admin,role:'customer'},{...admin,role:'employee'},{...admin,mfa:false}])assert.equal((await operationsHttp(request(input),{...options,auth:async()=>principal})).status,403);
 assert.equal(calls,0);assert.equal((await operationsHttp(request({...input,apiKey:'client-override'}),options)).status,400);
 assert.equal((await operationsHttp(request(input),{...options,env:{...env,YOUTUBE_SYNC_ENABLED:'false'}})).status,503);
 const first=await operationsHttp(request(input),options);assert.equal(first.status,200);assert.equal((await first.json()).result.count,49);
 assert.equal((await operationsHttp(request(input),{...options,auth:async()=>({...admin,userId:'other-admin'})})).status,429);assert.equal(calls,1);assert.equal(closed,1);
 const audit=await repository.transaction(s=>Object.values(s.audit));assert.equal(audit.length,1);assert.equal(audit[0].actor,admin.userId);assert.equal(audit[0].action,'video-refresh');assert.doesNotMatch(JSON.stringify(audit),/synthetic-only|apiKey/);
});
test('manual refresh closes its database after provider failure and never claims persistence',async()=>{
 const repository=createMemoryRepository();let closed=0;const result=await operationsHttp(request(input),{env,runtime:async()=>({repository}),auth:async()=>admin,videoStore:()=>({close:async()=>closed++,status:async()=>null}),videoSync:async()=>({updated:false,count:0,reason:'provider_unavailable'})});assert.equal(result.status,200);assert.equal((await result.json()).saved,false);assert.equal(closed,1);
});
const actor={...admin,mfaFresh:true};
const order=id=>({id,orderNumber:'DBM-'+id,status:'paid',fulfillmentStatus:'packing',version:0,createdAt:'2026-11-10T00:00:00Z',items:[{variantId:'tee-m',name:'Tee',size:'M',quantity:2}]});
const shipment=number=>({action:'shipment',orderNumber:'DBM-'+number,carrier:'USPS',service:'Ground',trackingNumber:'Test-001',trackingUrl:'https://tools.usps.com/track',items:[{variantId:'tee-m',quantity:1}]});
test('concurrent duplicate tracking is refused globally and correction cannot reuse another package',async()=>{
 const repository=createMemoryRepository({orders:{a:order('a'),b:order('b')}}),service=createOperationsService({repository,send:async()=>{throw Error('Sending forbidden');}});
 const results=await Promise.allSettled(['a','b'].map(id=>service.mutate(actor,shipment(id))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'duplicate_tracking');
 const other=results[0].status==='fulfilled'?'b':'a',second=await service.mutate(actor,{...shipment(other),trackingNumber:'Second001'});
 await assert.rejects(service.mutate(actor,{action:'shipment-update',shipmentId:second.shipmentId,carrier:'USPS',service:'Ground',trackingNumber:'test 001',trackingUrl:'https://tools.usps.com/track',expectedVersion:0}),{code:'duplicate_tracking'});
 assert.equal(await repository.transaction(s=>s.shipments[second.shipmentId].trackingNumber),'Second001');
});
