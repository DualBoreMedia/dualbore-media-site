import pg from 'pg';
import {createPostgresRepository} from '../commerce/repository.mjs';
import {commerceRuntime,hostedEnvironment,loopback} from '../commerce/runtime.mjs';

const storage=new Map();
// Local AuthKit QA needs durable account storage, not checkout credentials.
// This branch never creates a payment service or seeds orders/catalog data.
export async function operationsRuntime(env=process.env){
 if(env.COMMERCE_ENVIRONMENT!=='test'||env.STRIPE_SECRET_KEY)return commerceRuntime(env);
 if(hostedEnvironment(env)||env.PAYMENTS_ENABLED!=='false'||env.REFUNDS_ENABLED!=='false'||env.TRANSACTIONAL_EMAILS_ENABLED!=='false')throw Error('Local account storage requires disabled payment, refund and email gates.');
 const origin=new URL(env.SITE_ORIGIN),database=new URL(env.DATABASE_URL);
 if(!loopback(origin.href)||origin.protocol!=='http:'||origin.origin!==env.SITE_ORIGIN||!['postgres:','postgresql:'].includes(database.protocol)||!['127.0.0.1','localhost','[::1]'].includes(database.hostname))throw Error('Local account storage requires loopback origin and PostgreSQL.');
 if(!storage.has(env.DATABASE_URL)){
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000});
  const value={repository:createPostgresRepository(pool),stripe:null,mock:false,close:async()=>{storage.delete(env.DATABASE_URL);await pool.end();}};
  storage.set(env.DATABASE_URL,value);
 }
 return storage.get(env.DATABASE_URL);
}
