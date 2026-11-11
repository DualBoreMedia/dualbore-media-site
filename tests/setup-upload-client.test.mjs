import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadSetupFile} from '../src/operations/client.js';
const file=()=>new File([new Uint8Array(244)],'Synthetic.stp');
const options={productId:'p',expectedVersion:3,file:file()};
test('setup uploads use authenticated binary body and safe version headers, including bounded cookie refresh',async()=>{
 const calls=[],result={product:{id:'p',version:4}};
 assert.deepEqual(await uploadSetupFile(async()=> 'synthetic',options,{fetcher:async(url,init)=>{calls.push({url,...init});return Response.json(result);}}),result);
 assert.equal(calls[0].url,'/api/setup-files?productId=p');assert.equal(calls[0].headers.Authorization,'Bearer synthetic');assert.equal(calls[0].headers['X-Product-Version'],'3');assert.equal(calls[0].body,options.file);assert.equal(calls[0].cache,'no-store');
 const cookie=Object.assign(async()=>null,{cookieSession:true});let count=0;
 await uploadSetupFile(cookie,options,{fetcher:async(url,init)=>{count++;assert.equal(init.credentials,'same-origin');assert.equal(init.headers?.Authorization,undefined);return url==='/api/auth/refresh'?Response.json({}):count===1?new Response('',{status:401}):Response.json(result);}});assert.equal(count,3);
});
test('invalid files, auth failures, network ambiguity and server errors preserve safe customer messages',async()=>{
 for(const bad of [null,new File(['x'],'bad.stp'),new File([new Uint8Array(244)],'../bad.stp'),new File([new Uint8Array(2*1024*1024+1)],'Big.stp')])await assert.rejects(uploadSetupFile(async()=> 'synthetic',{...options,file:bad}));
 await assert.rejects(uploadSetupFile(async()=>null,options),/Sign in again/);
 for(const fetcher of [async()=>{throw Error('private-details');},async()=>new Response('private'),async()=>Response.json({code:'stale_record'},{status:409}),async()=>Response.json({code:'unknown',error:'private'},{status:500})])await assert.rejects(uploadSetupFile(async()=> 'synthetic',options,{fetcher}),error=>!error.message.includes('private-details')&&!error.message.includes('unknown'));
});
