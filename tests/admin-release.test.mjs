import test from 'node:test';
import assert from 'node:assert/strict';
import {workosHttp} from '../netlify/operations/workos-http.mjs';
import {operationsHttp} from '../netlify/operations/http.mjs';
import {commerceHttp} from '../netlify/commerce/http.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {deliverOrderEmails} from '../netlify/commerce/order-email.mjs';
import {processSubmission} from '../netlify/lib/drop-waitlist-email.mjs';
import {productionRuntime} from '../netlify/commerce/runtime.mjs';

const env={AUTH_PROVIDER:'workos',AUTH_ACCESS_MODE:'staff-only',SITE_ORIGIN:'https://garage.example',WORKOS_API_KEY:'unit-fixture',WORKOS_CLIENT_ID:'client_fixture',WORKOS_COOKIE_PASSWORD:'a-test-only-cookie-password-longer-than-32-characters',WORKOS_STAFF_ORGANIZATION_ID:'org_fixture'};
test('cached production services cannot retain an earlier customer-and-staff access mode',async()=>{
 const settings={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:env.SITE_ORIGIN,DATABASE_URL:'postgresql://unused.example.invalid/admin_cache_fixture',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
 const prior=await productionRuntime({...settings,AUTH_ACCESS_MODE:'customer-and-staff'}),staffOnly=await productionRuntime({...settings,AUTH_ACCESS_MODE:'staff-only'});
 assert.notEqual(prior,staffOnly);await assert.rejects(staffOnly.service.checkout({items:[]}),{code:'payments_disabled'});
});
test('admin-only auth refuses customer signup and sign-in before provider or storage access',async()=>{
 for(const path of ['sign-in','sign-in?signup=1','sign-in?staff=1&signup=1']){
  const response=await workosHttp(new Request(env.SITE_ORIGIN+'/api/auth/'+path),{env,client:{},repository:{transaction(){throw Error('Storage must not run');}},log:()=>{}});
  assert.equal(response.status,403);assert.equal((await response.json()).code,'accounts_closed');
 }
});
test('admin-only operation APIs reject a customer even with a valid session',async()=>{
 const response=await operationsHttp(new Request(env.SITE_ORIGIN+'/api/operations'),{env,runtime:async()=>({repository:createMemoryRepository()}),auth:async()=>({userId:'customer_fixture',role:'customer',mfa:true,mfaFresh:true})});
 assert.equal(response.status,404);assert.equal((await response.json()).code,'staff_required');
});
test('admin-only commerce stays closed even if a payment flag is accidentally enabled',async()=>{
 const settings={...env,COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'true'};
 for(const [route,method] of [['config','GET'],['catalog','GET'],['checkout','POST'],['webhook','POST'],['simulate','POST']]){
  const response=await commerceHttp(new Request(env.SITE_ORIGIN+'/api/commerce/'+route,{method}),{env:settings,runtime:()=>{throw Error('Payment/storage runtime must not run');}});
  assert.equal(response.status,method==='GET'?200:503);const body=await response.json();if(method==='GET')assert.equal(body.enabled,false);else assert.equal(body.code,'commerce_paused');
 }
 const service=createCommerceService({repository:{transaction(){throw Error('Must not reserve');}},stripe:{},env:settings});
 await assert.rejects(service.checkout({items:[]}),{code:'payments_disabled'});
});
test('admin-only refuses refunds and every email/signup side effect despite enabled flags',async()=>{
 const settings={...env,COMMERCE_ENVIRONMENT:'production',REFUNDS_ENABLED:'true',TRANSACTIONAL_EMAILS_ENABLED:'true',MARKETING_EMAILS_ENABLED:'true',DROP_WAITLIST_ENABLED:'true'};
 const service=createOperationsService({repository:createMemoryRepository(),stripe:{refunds:{create(){throw Error('No refund');}}},env:settings});
 await assert.rejects(service.mutate({userId:'admin_fixture',email:'fixture@example.invalid',role:'admin',mfa:true,mfaFresh:true},{action:'refund',orderNumber:'fixture',amountCents:1,requestKey:'12345678-1234-1234-1234-123456789012',confirmed:true}),{code:'payments_disabled'});
 const result=await deliverOrderEmails({repository:{transaction(){throw Error('Must not enqueue');}},orderId:'fixture',env:settings,fetchImpl:()=>{throw Error('No sending');}});
 assert.ok(result.results.every(item=>item.status==='disabled'));assert.equal(result.results.length,2);
 assert.deepEqual(await processSubmission({}, {env:key=>settings[key],request:()=>{throw Error('No signup');}}),{status:'disabled'});
});
