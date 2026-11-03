import test from 'node:test';
import assert from 'node:assert/strict';
import {observeHttp,observeTask,requestContext,structuredLog,createErrorReporter,reportUnexpected} from '../netlify/observability/index.mjs';
import {safeMetadata,sanitizeMonitoringEvent,normalizeError} from '../netlify/observability/safe.mjs';
import {serverErrorReporter} from '../netlify/observability/server.mjs';
import {configureBrowserMonitoring,reportBrowserError,installBrowserErrorHandlers} from '../src/observability/client.js';
test('structured metadata excludes secrets, bodies, email, address and untrusted values',()=>{
 const secret='sk_test_private';const row=safeMetadata({requestId:'safe-reference',Authorization:'Bearer '+secret,body:{address:'55 Private Street'},email:'customer@example.com',event:secret,provider:'stripe',orderReference:'DBM-123',status:503});
 assert.deepEqual(row,{requestId:'safe-reference',provider:'stripe',orderReference:'DBM-123',status:503});
});
test('background failures preserve retry rejection while reporting a safe correlation and hiding provider diagnostics',async()=>{
 const logs=[],reported=[];let reference;
 const task=observeTask(async()=>{reference=requestContext().requestId;throw Error('sk_live_secret customer@example.com');},{scope:'waitlist',reporter:{capture:async error=>reported.push(error)},log:line=>logs.push(line)});
 await assert.rejects(task(),error=>error.message==='Background task failed. Reference: '+reference);
 assert.equal(reported.length,1);assert.ok(logs.some(row=>row.includes(reference)));assert.ok(!logs.join('').includes('customer@example.com'));
});
test('concurrent requests retain isolated correlation through asynchronous services and response',async()=>{
 const records=[];
 const handler=observeHttp(async()=>{const before=requestContext().requestId;await new Promise(resolve=>setTimeout(resolve,5));structuredLog('order.paid',{orderReference:'DBM-123'},{log:line=>records.push(JSON.parse(line))});assert.equal(requestContext().requestId,before);return Response.json({ok:true});},{log:line=>records.push(JSON.parse(line)),env:{COMMIT_REF:'abc123',COMMERCE_ENVIRONMENT:'test'}});
 const responses=await Promise.all([handler(new Request('http://localhost/api?token=private')),handler(new Request('http://localhost/api'))]);
 assert.notEqual(responses[0].headers.get('X-Request-ID'),responses[1].headers.get('X-Request-ID'));
 for(const response of responses)assert.equal(records.filter(row=>row.requestId===response.headers.get('X-Request-ID')).length,2);
 assert.equal(JSON.stringify(records).includes('private'),false);
});
test('unexpected errors produce safe customer reference and invoke reporter while validation stays quiet',async()=>{
 const errors=[],logs=[];const reporter={capture:async(error,metadata)=>errors.push([error,metadata])};
 const handler=observeHttp(async()=>{throw new Error('postgres://user:password@host/db customer@example.com');},{reporter,log:line=>logs.push(line),env:{}});
 const response=await handler(new Request('http://localhost/api'));const body=await response.json();
 assert.equal(response.status,503);assert.equal(body.reference,response.headers.get('X-Request-ID'));assert.equal(errors.length,1);assert.equal(JSON.stringify(logs).includes('password'),false);assert.equal(JSON.stringify(body).includes('postgres'),false);
 await reportUnexpected(Object.assign(new Error('private'),{status:422,code:'invalid_size'}),{},{reporter,log:()=>{}});assert.equal(errors.length,1);
 assert.equal(normalizeError({status:429}).category,'RATE_LIMIT_ERROR');
});
test('monitoring beforeSend strips ambient sensitive data and preserves source-map frame coordinates',()=>{
 const clean=sanitizeMonitoringEvent({message:'customer@example.com',request:{headers:{Authorization:'Bearer secret'},data:'private'},user:{email:'private@example.com'},breadcrumbs:[{message:'private'}],extra:{token:'secret'},contexts:{trace:{data:'private'}},tags:{requestId:'safe-id',email:'private@example.com'},exception:{values:[{type:'Error',value:'sk_test_private',stacktrace:{frames:[{filename:'https://dualboremedia.com/assets/app.js?token=secret',lineno:23,colno:4,vars:{password:'private'},pre_context:['private']}]}}]}});
 const text=JSON.stringify(clean);for(const secret of ['private','secret','Authorization','Bearer','password','@'])assert.equal(text.includes(secret),false);
 assert.equal(clean.exception.values[0].stacktrace.frames[0].filename,'https://dualboremedia.com/assets/app.js');assert.equal(clean.exception.values[0].stacktrace.frames[0].lineno,23);
});
test('monitoring stays disabled without explicit configuration and isolated transport failure never fails commerce',async()=>{
 let options,captured=0;const sdk={init:value=>{options=value;},withScope:fn=>fn({setTags:()=>{}}),captureException:()=>{captured++;},flush:async()=>{throw new Error('transport secret');}};
 assert.equal(createErrorReporter({sdk,env:{}}).enabled,false);
 const reporter=createErrorReporter({sdk,env:{SENTRY_DSN:'https://public@example.invalid/1',ERROR_MONITORING_ENABLED:'true',COMMIT_REF:'abc123'},log:()=>{}});
 assert.equal(options.sendDefaultPii,false);assert.equal(options.defaultIntegrations,false);assert.equal(options.tracesSampleRate,0);assert.equal(options.release,'abc123');
 assert.equal(await reporter.capture(new Error('unexpected')),false);assert.equal(captured,1);assert.equal(await reporter.capture(Object.assign(new Error('invalid'),{status:400})),false);assert.equal(captured,1);
});
test('server and browser SDK activation is explicit, global hooks are removable and do not send user payloads',async()=>{
 assert.equal((await serverErrorReporter({})).enabled,false);
 assert.equal(configureBrowserMonitoring(null,{enabled:true,dsn:'test'}),false);
 assert.equal(reportBrowserError(new Error('not configured')),false);
 const captures=[],handlers=new Map();let options;
 const sdk={init:value=>{options=value;},withScope:fn=>fn({setTags:()=>{}}),captureException:error=>captures.push(error)};
 assert.equal(configureBrowserMonitoring(sdk,{enabled:true,dsn:'public',release:'abc1234'}),true);assert.equal(options.sendDefaultPii,false);
 const cleanup=installBrowserErrorHandlers({addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)});
 handlers.get('error')({error:new Error('test')});handlers.get('unhandledrejection')({reason:{password:'not serialized'}});assert.equal(captures.length,2);assert.equal(captures[1].message,'Unhandled application rejection');cleanup();assert.equal(handlers.size,0);
});
test('platform IDs are constrained, provider credential failures are actionable and unsafe stack/debug fields drop',async()=>{
 const handler=observeHttp(async()=>new Response('ok'),{env:{NETLIFY:'true'},log:()=>{}});
 assert.equal((await handler(new Request('http://localhost',{headers:{'x-nf-request-id':'platform-id-1234'}}))).headers.get('X-Request-ID'),'platform-id-1234');
 assert.notEqual((await handler(new Request('http://localhost',{headers:{'x-nf-request-id':'sk_test_unsafe'}}))).headers.get('X-Request-ID'),'sk_test_unsafe');
 assert.equal(normalizeError({status:401},{provider:'stripe'}).expected,false);
 assert.equal(normalizeError({status:400,code:'card_declined'},{provider:'stripe'}).expected,true);
 const event=sanitizeMonitoringEvent({debug_meta:{images:[{debug_id:'12345678-1234-1234-1234-123456789012',code_file:'https://dualboremedia.com/assets/app.js',source:'private'}]},exception:{values:[{stacktrace:{frames:[{filename:'https://customer@example.com/private',vars:{password:'secret'}}]}}]}});
 assert.equal(event.debug_meta.images.length,1);assert.deepEqual(event.exception.values[0].stacktrace.frames[0],{in_app:false});
});
