import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID}from'node:crypto';
import {createCommerceService}from'../netlify/commerce/service.mjs';import{createMemoryRepository}from'../netlify/commerce/memory-repository.mjs';import{commerceHttp}from'../netlify/commerce/http.mjs';import{accountPolicy}from'../scripts/prepare-security-headers.mjs';
test('production checkout fails closed before reservation or Stripe call',async()=>{
 for(const flag of [undefined,'false','TRUE','1','true ']){const repository=createMemoryRepository();const stripe={checkout:{sessions:{create(){throw Error('must not call');}}}};const service=createCommerceService({repository,stripe,env:{COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://site.invalid',PAYMENTS_ENABLED:flag}});await assert.rejects(service.checkout({items:[{variantId:'e92-tee-m',quantity:1}]},{requestKey:randomUUID()}),{code:'payments_disabled'});assert.equal(await repository.transaction(s=>Object.keys(s.orders).length),0);}
});
test('hosted production catalog/config and checkout stay disabled regardless of client flags',async()=>{
 const env={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://site.invalid',PAYMENTS_ENABLED:'false',NETLIFY:'true'};const runtime=async()=>({repository:createMemoryRepository()});
 const config=await commerceHttp(new Request('https://site.invalid/api/commerce/config'),{env,runtime});assert.equal((await config.json()).enabled,false);
 const catalog=await commerceHttp(new Request('https://site.invalid/api/commerce/catalog'),{env,runtime});assert.deepEqual((await catalog.json()).variants,[]);
 const response=await commerceHttp(new Request('https://site.invalid/api/commerce/checkout',{method:'POST',headers:{Origin:env.SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({PAYMENTS_ENABLED:true})}),{env,runtime});assert.equal(response.status,503);assert.equal((await response.json()).code,'payments_disabled');
});
test('account CSP allows exact configured auth service and excludes unsafe scripts/eval',()=>{
 const policy=accountPolicy('https://clerk.business.invalid');assert.ok(policy.includes('script-src'));assert.ok(!policy.includes("script-src 'unsafe-inline'"));assert.ok(!policy.includes('unsafe-eval'));assert.ok(policy.includes("frame-ancestors 'none'"));
 for(const value of ['http://clerk.business.invalid','https://name:password@clerk.business.invalid','https://clerk.business.invalid/path','https://*'])assert.throws(()=>accountPolicy(value));
});
