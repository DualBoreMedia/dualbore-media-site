import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {commerceRuntime,productionRuntime} from '../netlify/commerce/runtime.mjs';
import {commerceHttp} from '../netlify/commerce/http.mjs';
import {operationsRuntime} from '../netlify/operations/runtime.mjs';

const local={COMMERCE_TEST_ENABLED:'true',COMMERCE_MOCK:'true',SITE_ORIGIN:'http://127.0.0.1:4176',TEST_DATABASE_DIRECTORY:'memory://',TEST_INVENTORY_PER_VARIANT:'1',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
test('local account storage is independent of checkout and rejects hosted, remote or enabled gates',async()=>{
 const env={COMMERCE_ENVIRONMENT:'test',SITE_ORIGIN:'http://127.0.0.1:4320',DATABASE_URL:'postgresql://unused@127.0.0.1:55432/dbm_sandbox',PAYMENTS_ENABLED:'false',REFUNDS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
 const first=await operationsRuntime(env);try{assert.equal(first,await operationsRuntime({...env}));assert.equal(first.stripe,null);assert.equal(first.service,undefined);assert.equal(first.mock,false);}finally{await first.close();}
 for(const change of [{NETLIFY:'true'},{CONTEXT:'deploy-preview'},{NODE_ENV:'production'},{PAYMENTS_ENABLED:'true'},{REFUNDS_ENABLED:'true'},{TRANSACTIONAL_EMAILS_ENABLED:'true'},{PAYMENTS_ENABLED:undefined},{SITE_ORIGIN:'https://garage.example'},{SITE_ORIGIN:'http://127.0.0.1:4320/path'},{DATABASE_URL:'postgresql://unused@remote.invalid/db'},{DATABASE_URL:'https://127.0.0.1/db'}])await assert.rejects(operationsRuntime({...env,...change}));
 await assert.rejects(operationsRuntime({...env,COMMERCE_ENVIRONMENT:undefined}));
 await assert.rejects(operationsRuntime({...env,STRIPE_SECRET_KEY:'invalid'}));
 // Adding account-only storage must never configure the checkout runtime.
 await assert.rejects(commerceRuntime(env),/not configured/);
});

test('simulation and sandbox runtime reject deployed contexts before constructing storage or providers',async()=>{
 for(const marker of [{NETLIFY:'true'},{CONTEXT:'production'},{CONTEXT:'deploy-preview'},{CONTEXT:'branch-deploy'},{NODE_ENV:'production'},{COMMERCE_TEST_ENABLED:'false'}]){
  const env={...local,...marker};await assert.rejects(commerceRuntime(env),/not configured/);
  let runtimeCalls=0;const response=await commerceHttp(new Request(local.SITE_ORIGIN+'/api/commerce/simulate',{method:'POST',headers:{Origin:local.SITE_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({action:'paid'})}),{env,runtime:async()=>{runtimeCalls++;throw Error('must not construct runtime');}});
  assert.equal(response.status,404);assert.equal(runtimeCalls,0);
 }
 for(const url of ['https://garage.example','http://192.0.2.1']){
  const response=await commerceHttp(new Request(url+'/api/commerce/simulate',{method:'POST'}),{env:local,runtime:async()=>{throw Error('not reached');}});assert.equal(response.status,404);
 }
 for(const env of [{},{COMMERCE_TEST_ENABLED:'true'},{COMMERCE_TEST_ENABLED:'true',STRIPE_SECRET_KEY:'not-a-test-key',DATABASE_URL:'not-a-database'}])await assert.rejects(commerceRuntime(env));
 for(const env of [{},{DATABASE_URL:'postgresql://unused.invalid/fixture',SITE_ORIGIN:'http://garage.example'},{DATABASE_URL:'postgresql://unused.invalid/fixture',SITE_ORIGIN:'https://garage.example/path'},{DATABASE_URL:'postgresql://unused.invalid/fixture',SITE_ORIGIN:'https://user:pass@garage.example'}])await assert.rejects(productionRuntime(env));
});

test('actual sandbox runtime migrates and seeds all variants once and serializes final-unit checkout',async()=>{
 const [first,second]=await Promise.all([commerceRuntime(local),commerceRuntime({...local})]);assert.equal(first,second);assert.equal(first.mock,true);
 const variants=await first.repository.transaction(state=>Object.values(state.variants));assert.equal(variants.length,15);assert.equal(variants.every(variant=>variant.availableQuantity===1&&variant.stripePriceId.startsWith('price_mock_')),true);
 const attempts=await Promise.allSettled([first.service.checkout({items:[{variantId:'e92-tee-m',quantity:1}]},{requestKey:randomUUID()}),first.service.checkout({items:[{variantId:'e92-tee-m',quantity:1}]},{requestKey:randomUUID()})]);
 assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);assert.equal(attempts.filter(result=>result.status==='rejected').length,1);
 const stock=await first.repository.transaction(state=>state.variants['e92-tee-m']);assert.equal(stock.availableQuantity,0);assert.equal(stock.reservedQuantity,1);assert.equal(stock.soldQuantity,0);
 const session=[...first.stripe.testSessions.values()][0];assert.equal(session.livemode,false);assert.equal(session.amount_total,3700);
 const expired=await first.stripe.checkout.sessions.expire(session.id);assert.equal(expired.status,'expired');assert.equal(await first.stripe.checkout.sessions.retrieve(session.id),session);
});
