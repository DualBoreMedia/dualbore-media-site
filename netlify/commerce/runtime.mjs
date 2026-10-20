import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createPostgresRepository,runMigrations} from './repository.mjs';
import {createCommerceService} from './service.mjs';
import {seedTestCatalog} from './catalog.mjs';
import {createMockStripe} from './test-stripe.mjs';
const runtimes=new Map();
export const loopback=url=>['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname);
export const hostedEnvironment=env=>env.NETLIFY==='true'||['production','deploy-preview','branch-deploy'].includes(env.CONTEXT)||env.NODE_ENV==='production';
export function testKey(key){return /^(sk|rk)_test_[A-Za-z0-9]+$/.test(key||'');}
export async function commerceRuntime(env=process.env){
 if(env.COMMERCE_ENVIRONMENT==='production')return productionRuntime(env);
 if(hostedEnvironment(env)||env.COMMERCE_TEST_ENABLED!=='true')throw new Error('Test checkout is not configured.');
 if(env.COMMERCE_MOCK!=='true'&&(!testKey(env.STRIPE_SECRET_KEY)||!env.DATABASE_URL||!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')))throw new Error('Configure a sandbox key and local database.');
 const identity=createHash('sha256').update(JSON.stringify([env.COMMERCE_MOCK,env.DATABASE_URL,env.STRIPE_SECRET_KEY,env.STRIPE_WEBHOOK_SECRET,env.SITE_ORIGIN,env.TEST_DATABASE_DIRECTORY,env.TEST_SHIPPING_RATE_CENTS,env.STRIPE_AUTOMATIC_TAX,env.RESEND_API_KEY,env.RESEND_FROM,env.RESEND_REPLY_TO,env.RESEND_NOTIFY_TO])).digest('hex');
 if(runtimes.has(identity))return runtimes.get(identity);
 const cached=(async()=>{
  let repository,stripe;
  if(env.COMMERCE_MOCK==='true'){
   const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite(env.TEST_DATABASE_DIRECTORY||'.tools/commerce-test-db');
   let queue=Promise.resolve();
   const client={query:async(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:!params&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,params),release(){}};
   const pool={connect:async()=>{let unlock;const previous=queue;queue=new Promise(r=>unlock=r);await previous;return{...client,release:unlock};}};
   await runMigrations(pool);repository=createPostgresRepository(pool);await seedTestCatalog(repository,{quantity:Number(env.TEST_INVENTORY_PER_VARIANT||0)});stripe=createMockStripe();
   await repository.transaction(s=>{for(const v of Object.values(s.variants)){v.stripePriceId='price_mock_'+v.id.replaceAll('-','_');stripe.testPrices[v.stripePriceId]={active:true,livemode:false,currency:'usd',unit_amount:v.priceCents};}});
  }else{
   const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});repository=createPostgresRepository(pool);stripe=new Stripe(env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000});
  }
  return{repository,stripe,service:createCommerceService({repository,stripe,env:env.COMMERCE_MOCK==='true'?{...env,RESEND_API_KEY:undefined}:env}),mock:env.COMMERCE_MOCK==='true'};
 })();runtimes.set(identity,cached);try{return await cached;}catch(e){runtimes.delete(identity);throw e;}
}

// Production is a distinct database/configuration, never seeded from test stock.
export async function productionRuntime(env=process.env){
 if(!/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL||'')||!/^https:\/\//.test(env.SITE_ORIGIN||''))throw new Error('Production storage/origin is not configured.');
 const origin=new URL(env.SITE_ORIGIN);if(origin.username||origin.password||origin.origin!==env.SITE_ORIGIN)throw new Error('Invalid production origin.');
 const identity='production:'+createHash('sha256').update(JSON.stringify([env.DATABASE_URL,env.STRIPE_SECRET_KEY,env.SITE_ORIGIN,env.PAYMENTS_ENABLED,env.TRANSACTIONAL_EMAILS_ENABLED,env.RESEND_FROM,env.RESEND_API_KEY,env.RESEND_REPLY_TO,env.SHIPPING_RATE_CENTS,env.LIVE_CATALOG_APPROVED,env.SHIPPING_CONFIGURATION_APPROVED,env.TAX_CONFIGURATION_APPROVED,env.POLICIES_APPROVED])).digest('hex');
 if(runtimes.has(identity))return runtimes.get(identity);
 const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
 const repository=createPostgresRepository(pool);
 const stripe=/^(sk|rk)_live_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY||'')?new Stripe(env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:15000}):null;
 const result={repository,stripe,mock:false,service:createCommerceService({repository,stripe,env})};
 runtimes.set(identity,result);return result;
}
