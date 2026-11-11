import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAdminPredeploy,expectedAdminMigrations,runHostedAdminPredeploy} from '../scripts/check-admin-predeploy.mjs';
import {checkAdminRelease} from '../scripts/check-admin-release.mjs';
import {productionWorkosKey} from '../netlify/operations/workos-key.mjs';

const off=Object.fromEntries(['PAYMENTS_ENABLED','REFUNDS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED','MARKETING_EMAILS_ENABLED','DROP_WAITLIST_ENABLED','DIGITAL_DELIVERY_ENABLED'].map(k=>[k,'false']));
const env={...off,COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://dualboremedia.com',AUTH_PROVIDER:'workos',VITE_AUTH_PROVIDER:'workos',AUTH_ACCESS_MODE:'staff-only',VITE_AUTH_ACCESS_MODE:'staff-only',WORKOS_ENVIRONMENT:'production',WORKOS_KEY_ENVIRONMENT:'production',ADMIN_RELEASE_PHASE:'verification',WORKOS_API_KEY:'sk_syntheticVerificationOnly',WORKOS_CLIENT_ID:'client_fixture',WORKOS_STAFF_ORGANIZATION_ID:'org_fixture',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-key-longer-than-thirty-two-characters',WORKOS_STAFF_GOOGLE_ENABLED:'true',WORKOS_STAFF_MFA_POLICY_VERIFIED:'true',DATABASE_URL:'postgresql://fixture:fixture@database.example.invalid/db?sslmode=verify-full',ERROR_MONITORING_ENABLED:'true',VITE_ERROR_MONITORING_ENABLED:'true',SENTRY_DSN:'https://fixture@o1.ingest.sentry.io/1',VITE_SENTRY_DSN:'https://fixture@o1.ingest.sentry.io/1',RELEASE_SHA:'a'.repeat(40)};
const ledger=[{name:'001_fixture.sql',checksum:'fixture-hash'}];
function fixture(overrides={}){
 const calls=[];
 const client={connection:{stream:{encrypted:overrides.tls!==false,authorized:overrides.certificate!==false}},release(){calls.push('release');},async query(sql){
  calls.push(sql);
  if(overrides.queryFailure)throw Error('secret-that-must-never-escape');
  if(sql.startsWith('SELECT current_user'))return {rows:[{current_user:'dbm_app_runtime',rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false,rolinherit:false,rolreplication:false,schema_create:false,database_create:false,...overrides.role}]};
  if(sql.includes('pg_auth_members'))return {rows:[{n:overrides.memberships||0}]};
  if(sql.includes('FROM commerce_migrations'))return {rows:overrides.ledger||ledger};
  if(sql.includes('has_table_privilege(current_user,$1'))return {rows:[{s:true,i:true,u:false,d:false,t:false,...overrides.immutable}]};
  if(sql.startsWith('SELECT bool_and'))return {rows:[{allowed:overrides.editable!==false}]};
  return {rows:[]};
 }};
 return {calls,pool:{async connect(){calls.push('connect');if(overrides.connectFailure)throw Error('secret-that-must-never-escape');return client;}},workos:{organizations:{async getOrganization(id){calls.push('provider');if(overrides.providerFailure)throw Error('secret-that-must-never-escape');return {id:overrides.foreignOrganization?'org_foreign':id};}}}};
}
const check=(f,settings=env)=>checkAdminPredeploy({env:settings,pool:f.pool,workos:f.workos,expectedMigrations:ledger});

test('verification configuration cannot certify the strict final Admin release gate',async()=>{
 const f=fixture(),before=structuredClone(env),r=await check(f);
 assert.equal(r.readyForVerificationDeployment,true);assert.equal(r.adminOperational,false);assert.equal(r.postDeploymentRequired.length,4);
 assert.equal(checkAdminRelease({env}).ready,false);assert.deepEqual(env,before);assert.equal(env.WORKOS_PRODUCTION_VERIFIED,undefined);
 assert.ok(f.calls.includes('BEGIN READ ONLY'));assert.ok(!f.calls.some(x=>/^(INSERT|UPDATE|DELETE|CREATE|ALTER|GRANT)/.test(x)));assert.deepEqual(f.calls.slice(-2),['ROLLBACK','release']);
});
test('opaque verification credentials require explicit production phase and reject staging keys',()=>{
 assert.equal(productionWorkosKey(env),true);
 for(const patch of [{ADMIN_RELEASE_PHASE:undefined},{ADMIN_RELEASE_PHASE:'operational'},{WORKOS_KEY_ENVIRONMENT:undefined},{WORKOS_KEY_ENVIRONMENT:'staging'},{WORKOS_ENVIRONMENT:'staging'},{WORKOS_API_KEY:'sk_test_fixture'},{WORKOS_API_KEY:'sk_staging_fixture'},{WORKOS_API_KEY:'sk_example_fixture'},{WORKOS_API_KEY:'sk_bad value'}])assert.equal(productionWorkosKey({...env,...patch}),false,JSON.stringify(Object.keys(patch)));
});
test('every selling switch and missing verification prerequisites stop before external calls',async()=>{
 for(const patch of [...Object.keys(off).map(k=>({[k]:'true'})),{ADMIN_RELEASE_PHASE:undefined},{WORKOS_KEY_ENVIRONMENT:'staging'},{WORKOS_STAFF_MFA_POLICY_VERIFIED:'false'},{WORKOS_STAFF_GOOGLE_ENABLED:'false'},{DATABASE_URL:'postgresql://fixture:fixture@localhost/db?sslmode=disable'},{AUTH_ACCESS_MODE:'customer'},{ERROR_MONITORING_ENABLED:'false'},{VITE_WORKOS_API_KEY:'secret-that-must-never-escape'}]){
  const f=fixture(),r=await check(f,{...env,...patch});assert.equal(r.readyForVerificationDeployment,false);assert.deepEqual(f.calls,[]);assert.ok(!JSON.stringify(r).includes('secret-that-must-never-escape'));
 }
});
test('foreign organizations and provider failures never reach the database or expose diagnostics',async()=>{
 for(const opts of [{foreignOrganization:true},{providerFailure:true}]){const f=fixture(opts),r=await check(f);assert.equal(r.readyForVerificationDeployment,false);assert.deepEqual(f.calls,['provider']);assert.ok(!JSON.stringify(r).includes('secret-that-must-never-escape'));}
});
test('TLS, ledger, role membership and immutable/editable permission failures close the gate',async()=>{
 for(const opts of [{tls:false},{certificate:false},{connectFailure:true},{queryFailure:true},{role:{rolsuper:true}},{role:{current_user:'owner'}},{role:{schema_create:true}},{memberships:1},{ledger:[]},{ledger:[{...ledger[0],checksum:'changed'}]},{immutable:{u:true}},{immutable:{d:true}},{immutable:{t:true}},{immutable:{i:false}},{editable:false}]){
  const f=fixture(opts),r=await check(f);assert.equal(r.readyForVerificationDeployment,false,JSON.stringify(opts));assert.equal(r.adminOperational,false);assert.ok(!JSON.stringify(r).includes('secret-that-must-never-escape'));if(!opts.connectFailure)assert.equal(f.calls.at(-1),'release');
 }
});
test('expected migration manifest matches the seven owner-approved immutable files',async()=>{
 const rows=await expectedAdminMigrations();assert.equal(rows.length,7);assert.equal(rows[0].name,'001_commerce.sql');assert.equal(rows[0].checksum,'2d0ba2e233b1fab0cc4036766b9ac0394b30f569bd1cc981113926a00b8af8c2');assert.equal(rows[6].name,'007_private_setup_assets.sql');
});
test('normal preflight reads the actual committed manifest rather than trusting supplied ledger rows',async()=>{
 const rows=await expectedAdminMigrations(),f=fixture({ledger:rows});
 const result=await checkAdminPredeploy({env,workos:f.workos,pool:f.pool});assert.equal(result.readyForVerificationDeployment,true);
 const changed=fixture({ledger:rows.map((r,index)=>index===0?{...r,checksum:'changed'}:r)});
 assert.equal((await checkAdminPredeploy({env,workos:changed.workos,pool:changed.pool})).readyForVerificationDeployment,false);
});
test('hosted wrapper skips non-production/local builds and blocks bad production configuration without connecting',async()=>{
 for(const settings of [{},{NETLIFY:'true',CONTEXT:'deploy-preview'}])assert.deepEqual(await runHostedAdminPredeploy({env:settings,log:()=>{}}),{skipped:true});
 assert.equal((await runHostedAdminPredeploy({env:{NETLIFY:'true',CONTEXT:'production'},log:()=>{}})).readyForVerificationDeployment,false);
 const logs=[];const result=await runHostedAdminPredeploy({env:{...env,NETLIFY:'true',CONTEXT:'production',COMMIT_REF:'b'.repeat(40),PAYMENTS_ENABLED:'true'},log:x=>logs.push(x)});assert.equal(result.readyForVerificationDeployment,false);assert.ok(logs[0].includes('blocked'));assert.ok(!logs[0].includes(env.WORKOS_API_KEY));
});
