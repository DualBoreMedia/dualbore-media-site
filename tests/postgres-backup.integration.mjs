import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createPostgresRepository,runMigrations} from '../netlify/commerce/repository.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';

// Real pg_dump/pg_restore, synthetic schema only. Never copy production/staging.
test('real PostgreSQL backup restores checksums, stock and immutable actor audit into an isolated schema',{skip:process.env.DBM_REAL_POSTGRES_TEST!=='true',timeout:60000},async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/dbm_sandbox');
 const suffix=randomBytes(8).toString('hex'),schema='dbm_backup_qa_'+suffix,destination='dbm_restore_qa_'+suffix;
 const source=new pg.Pool({connectionString:url.href}),sourceUrl=new URL(url),targetUrl=new URL(url);sourceUrl.searchParams.set('options','-c search_path='+schema);targetUrl.searchParams.set('options','-c search_path='+destination);
 let app,restored;
 function tool(name,args,input){
  const settings={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'dbm_sandbox'};
  const container=process.env.DBM_PG_CONTAINER;
  if(container&&!/^[a-f0-9]{12,64}$/.test(container))throw Error('Invalid disposable CI container');
  const binary=process.env[{pg_dump:'DBM_PG_DUMP_BIN',pg_restore:'DBM_PG_RESTORE_BIN',psql:'DBM_PSQL_BIN'}[name]]||name;
  const result=container?spawnSync('docker',['exec','-i','-e','PGPASSWORD','-e','PGUSER','-e','PGDATABASE',container,name,...args],{input,env:settings,timeout:20000,maxBuffer:8*1024*1024}):spawnSync(binary,args,{input,env:settings,timeout:20000,maxBuffer:8*1024*1024});
  // Driver/tool diagnostics can contain connection details: never print them.
  if(result.status!==0)throw Error(`Disposable ${name} failed; verify the local tool version and sandbox connection.`);
  return result.stdout;
 }
 try{
  await source.query('CREATE SCHEMA '+schema);app=new pg.Pool({connectionString:sourceUrl.href});await runMigrations(app);
  const repository=createPostgresRepository(app);await seedTestCatalog(repository,{quantity:2});
  const actor={userId:'workos:backup_fixture',email:'fixture@example.invalid',role:'admin',mfa:true,mfaFresh:true};
  await createOperationsService({repository,env:{AUTH_ACCESS_MODE:'staff-only'}}).mutate(actor,{action:'inventory',variantId:'e92-tee-m',availableQuantity:3,active:false,reason:'Synthetic restore rehearsal',expectedVersion:0});
  const migrations=(await app.query('SELECT name,checksum FROM commerce_migrations ORDER BY name')).rows;
  assert.deepEqual(migrations.map(row=>row.name),['001_commerce.sql','002_operations.sql','003_support_marketing.sql','004_fulfillment_attribution.sql','005_public_video_sync.sql']);
  assert.ok(migrations.every(row=>/^[a-f0-9]{64}$/.test(row.checksum)),'Every migrated schema must have a SHA-256 checksum.');
  const dump=tool('pg_dump',['--format=custom','--inserts','--no-owner','--no-acl','--schema='+schema]);assert.ok(dump.length>0);
  // Restore only the generated synthetic schema under another generated name.
  // No elevated CREATEDB permission or production restore operation is needed.
  const sql=tool('pg_restore',['--file=-','--no-owner','--no-acl'],dump).toString('utf8').replaceAll(schema,destination);
  tool('psql',['--no-psqlrc','--set=ON_ERROR_STOP=1'],Buffer.from(sql));
  restored=new pg.Pool({connectionString:targetUrl.href});assert.deepEqual((await restored.query('SELECT name,checksum FROM commerce_migrations ORDER BY name')).rows,migrations);
  const recovered=createPostgresRepository(restored);const state=await recovered.transaction(s=>s);
  assert.equal(Object.keys(state.variants).length,15);assert.equal(state.variants['e92-tee-m'].availableQuantity,3);assert.equal(state.variants['e92-tee-m'].active,false);
  assert.equal(Object.keys(state.orders).length,0);assert.ok(Object.values(state.audit).some(row=>row.actor===actor.userId&&row.action==='inventory'));
  await assert.rejects(restored.query("UPDATE audit_events SET actor='changed'"));
  await createOperationsService({repository:recovered,env:{AUTH_ACCESS_MODE:'staff-only'}}).mutate(actor,{action:'inventory',variantId:'e92-tee-m',availableQuantity:4,active:false,reason:'Restore write check',expectedVersion:1});
  assert.equal(await recovered.transaction(s=>s.variants['e92-tee-m'].availableQuantity),4);
  assert.equal(await repository.transaction(s=>s.variants['e92-tee-m'].availableQuantity),3);
 }finally{
  await restored?.end();await app?.end();
  await source.query('DROP SCHEMA IF EXISTS '+destination+' CASCADE');
  await source.query('DROP SCHEMA '+schema+' CASCADE');await source.end();
 }
});
