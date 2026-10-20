import test from 'node:test';
import assert from 'node:assert/strict';
import auth,{config as authConfig} from '../netlify/functions/auth.mjs';
import catalog,{config as catalogConfig} from '../netlify/functions/commerce-catalog.mjs';
import config,{config as configRoute} from '../netlify/functions/commerce-config.mjs';
import simulate from '../netlify/functions/commerce-simulate.mjs';
import checkout from '../netlify/functions/create-checkout-session.mjs';
import status from '../netlify/functions/get-order-status.mjs';
import unsubscribe from '../netlify/functions/marketing-unsubscribe.mjs';
import operations from '../netlify/functions/operations.mjs';
import webhook from '../netlify/functions/stripe-webhook.mjs';

test('actual Netlify entrypoints keep hosted sandbox commerce closed and preserve private response headers',async()=>{
 const patch={NETLIFY:'true',COMMERCE_ENVIRONMENT:'test',COMMERCE_TEST_ENABLED:'true',AUTH_PROVIDER:'disabled',SITE_ORIGIN:'https://garage.example',ERROR_MONITORING_ENABLED:'false',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
 const previous=Object.fromEntries(Object.keys(patch).map(key=>[key,process.env[key]]));Object.assign(process.env,patch);
 try{
  assert.equal(authConfig.path,'/api/auth/*');assert.equal(catalogConfig.path,'/api/commerce/catalog');assert.equal(configRoute.path,'/api/commerce/config');
  for(const [handler,route,expected]of [[catalog,'catalog',404],[config,'config',200],[simulate,'simulate',404],[checkout,'checkout',404],[status,'order',404],[webhook,'webhook',404]]){
   const response=await handler(new Request('https://garage.example/api/commerce/'+route),{ip:'192.0.2.10'});assert.equal(response.status,expected);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
   if(route==='config')assert.equal((await response.json()).enabled,false);
  }
  for(const context of [{ip:'192.0.2.10'},{}]){
   assert.equal((await auth(new Request('https://garage.example/api/auth/session'),context)).status,503);
   assert.equal((await operations(new Request('https://other.example/api/operations'),context)).status,403);
   assert.equal((await unsubscribe(new Request('https://garage.example/api/marketing/unsubscribe'),context)).status,405);
  }
 }finally{for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
