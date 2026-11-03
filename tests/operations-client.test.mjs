import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsRequest,operationsQuery,safeTrackingUrl,money,date} from '../src/operations/client.js';

test('operations tracking accepts HTTPS and refuses credentials and executable protocols',()=>{
 assert.equal(safeTrackingUrl('https://tools.usps.com/go/TrackConfirmAction?tLabels=123'),'https://tools.usps.com/go/TrackConfirmAction?tLabels=123');
 for(const value of ['javascript:alert(1)','data:text/html,hello','http://carrier.example/track','https://user:password@carrier.example/track','not a URL'])assert.equal(safeTrackingUrl(value),null);
});
test('operations requires a managed auth token before sending any request',async()=>{
 const original=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;};
 try{await assert.rejects(operationsRequest(async()=>null),/Sign in again/);assert.equal(called,false);}finally{globalThis.fetch=original;}
});
test('operations admin requests carry bearer authentication and omit ambient cookies',async()=>{
 const original=globalThis.fetch;let observed;globalThis.fetch=async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({orders:[]})};};
 try{assert.deepEqual(await operationsRequest(async()=>'test-only-token',undefined,{admin:true}),{orders:[]});assert.equal(observed.url,'/api/operations?admin=true');assert.equal(observed.options.headers.Authorization,'Bearer test-only-token');assert.equal(observed.options.credentials,'omit');assert.equal(observed.options.cache,'no-store');}finally{globalThis.fetch=original;}
});
test('operations hides technical server errors and surfaces safe access errors',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>({ok:false,status:500,json:async()=>({error:'database_password_invalid',message:'private diagnostic'})});await assert.rejects(operationsRequest(async()=>'test-only-token'),e=>!e.message.includes('private')&&!e.message.includes('database'));
 globalThis.fetch=async()=>({ok:false,status:403,json:async()=>({code:'mfa_required'})});await assert.rejects(operationsRequest(async()=>'test-only-token'),/two-step verification/);
 }finally{globalThis.fetch=original;}
});
test('operations pending dates and totals are explicit rather than fabricated',()=>{assert.equal(money(null),'Pending');assert.equal(date(undefined),'Pending');assert.equal(money(3700),'$37.00');});
test('operations encodes server paging filters and ignores unrecognized query fields',()=>{
 const query=new URLSearchParams(operationsQuery({admin:true,query:{page:2,search:'name & order',customer:'customer@example.invalid',dateFrom:'2026-10-01',shipmentStatus:'shipped',injected:'secret',admin:false}}));
 assert.equal(query.get('page'),'2');assert.equal(query.get('search'),'name & order');assert.equal(query.get('admin'),'true');assert.equal(query.get('shipmentStatus'),'shipped');assert.equal(query.has('injected'),false);
});
test('operations uses the managed provider reverification fetcher when supplied',async()=>{
 let called=false;const fetcher=async(url,options)=>{called=true;assert.equal(url,'/api/operations');assert.equal(options.method,'POST');return {ok:true,json:async()=>({saved:true})};};
 assert.deepEqual(await operationsRequest(async()=>'test-only-token',{action:'preferences',marketingConsent:false},{fetcher}),{saved:true});assert.equal(called,true);
});
