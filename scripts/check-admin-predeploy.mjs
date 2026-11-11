import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {WorkOS} from '@workos-inc/node';
import {checkAdminConfiguration} from './check-admin-release.mjs';

const directory=new URL('../migrations/',import.meta.url);
export async function expectedAdminMigrations(){
 const files=(await readdir(directory)).filter(name=>/^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort();
 return Promise.all(files.map(async name=>({name,checksum:createHash('sha256').update((await readFile(new URL(name,directory),'utf8')).replaceAll('\r\n','\n')).digest('hex')})));
}

// This gate permits only the owner-approved closed-store verification rollout.
// It never sets evidence flags, grants roles, migrates data or certifies hosted QA.
export async function checkAdminPredeploy({env={},workos,pool,expectedMigrations}={}){
 const blockers=checkAdminConfiguration({env});
 if(env.ADMIN_RELEASE_PHASE!=='verification')blockers.push('The controlled verification release phase must be explicit.');
 if(env.WORKOS_KEY_ENVIRONMENT!=='production')blockers.push('The intended WorkOS credential environment must be production.');
 if(env.WORKOS_STAFF_MFA_POLICY_VERIFIED!=='true')blockers.push('Verify the private organization MFA policy before deployment.');
 const result=()=>({readyForVerificationDeployment:blockers.length===0,adminOperational:false,blockers,postDeploymentRequired:['owner sign-in and MFA','saved edits and persistence','session revocation and least privilege','release source maps, monitoring and redaction'],level:'admin-verification-predeploy'});
 if(blockers.length)return result();
 try{
  const api=workos||new WorkOS(env.WORKOS_API_KEY,{clientId:env.WORKOS_CLIENT_ID});
  const organization=await api.organizations.getOrganization(env.WORKOS_STAFF_ORGANIZATION_ID);
  if(organization.id!==env.WORKOS_STAFF_ORGANIZATION_ID)throw Error();
 }catch{blockers.push('The production WorkOS key could not authenticate to the configured staff organization.');return result();}
 let client;const database=pool||new pg.Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,query_timeout:10000});
 try{
  client=await database.connect();
  if(!client.connection.stream.encrypted||!client.connection.stream.authorized)throw Error();
  await client.query('BEGIN READ ONLY');
  const role=(await client.query("SELECT current_user,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolinherit,rolreplication,has_schema_privilege(current_user,'public','CREATE') schema_create,has_database_privilege(current_user,current_database(),'CREATE') database_create FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(role.current_user!=='dbm_app_runtime'||Object.entries(role).some(([key,value])=>key!=='current_user'&&value!==false))throw Error();
  if((await client.query('SELECT count(*)::int n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n!==0)throw Error();
  const ledger=(await client.query('SELECT name,checksum FROM commerce_migrations ORDER BY name')).rows;
  let expected=expectedMigrations;
  if(!expected){expected=await expectedAdminMigrations();}
  const matches=ledger.length===expected.length&&ledger.every((row,index)=>row.name===expected[index].name&&row.checksum===expected[index].checksum);
  if(!matches){throw Error();}
  for(const table of ['audit_events','private_setup_assets']){
   const p=(await client.query("SELECT has_table_privilege(current_user,$1,'SELECT') s,has_table_privilege(current_user,$1,'INSERT') i,has_table_privilege(current_user,$1,'UPDATE') u,has_table_privilege(current_user,$1,'DELETE') d,has_table_privilege(current_user,$1,'TRUNCATE') t",['public.'+table])).rows[0];
   if(!p.s||!p.i||p.u||p.d||p.t)throw Error();
  }
  const editable=['managed_products','product_variants','orders','order_items','stripe_events','inventory_reservations','email_events','customer_profiles','shipments','shipment_items','tracking_events','refund_requests','request_limits','support_tickets','marketing_contacts','marketing_events'];
  const grants=(await client.query("SELECT bool_and(has_table_privilege(current_user,'public.'||t,p) AND NOT has_table_privilege(current_user,'public.'||t,'TRUNCATE')) allowed FROM unnest($1::text[]) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p",[editable])).rows[0];
  if(grants.allowed!==true)throw Error();
  await client.query('SELECT id FROM managed_products LIMIT 1');
 }catch{blockers.push('The production runtime connection, TLS, migration ledger or restricted permissions failed verification.');}
 finally{if(client){try{await client.query('ROLLBACK');}catch{blockers.push('The read-only database check did not close cleanly.');}client.release();}if(!pool)await database.end();}
 return result();
}

export async function runHostedAdminPredeploy({env=process.env,log=console.log}={}){
 if(env.NETLIFY!=='true'||env.CONTEXT!=='production'){
  log('Hosted Admin preflight not run in this environment. Local tests are not production verification.');return {skipped:true};
 }
 const settings={...env,RELEASE_SHA:env.COMMIT_REF||env.RELEASE_SHA};
 const result=await checkAdminPredeploy({env:settings});
 log(result.readyForVerificationDeployment?'Read-only provider/database preflight passed. Hosted Admin and monitoring QA remain required.':`Admin verification build blocked:\n${result.blockers.map(x=>'- '+x).join('\n')}`);
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runHostedAdminPredeploy();if(!result.skipped&&!result.readyForVerificationDeployment)process.exitCode=1;}
 catch{console.error('Admin verification preflight failed. Provider/connection details withheld. No migration or activation was performed.');process.exitCode=1;}
}
