import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {runMigrations,createPostgresRepository} from '../netlify/commerce/repository.mjs';
import {inspectSetupUpload} from '../netlify/setups/private-assets.mjs';

// Synthetic bytes with the observed header, never an owner's tuning values.
const fixture=()=>{
 const bytes=Buffer.alloc(244);
 Buffer.from('c85393451601','hex').copy(bytes);
 bytes.write('MX2OEM_2023_Husqvarna_TC_125',6,'ascii');
 return bytes;
};
const details={filename:'Synthetic Setup.stp',actor:'workos:synthetic-admin',createdAt:'2026-11-06T12:00:00Z'};

test('setup intake rejects unsafe filenames, unsupported content and oversized files',()=>{
 const bytes=fixture();assert.equal(inspectSetupUpload(bytes,details.filename).sizeBytes,244);
 for(const filename of ['../private.stp','C:\\secret.stp','file.html','<script>.stp','setup.stp\r\nX-Test: bad',''])assert.throws(()=>inspectSetupUpload(bytes,filename));
 for(const data of [null,Buffer.alloc(20),Buffer.alloc(2*1024*1024+1),Buffer.alloc(244)])assert.throws(()=>inspectSetupUpload(data,details.filename));
});

test('private assets deduplicate, remain outside normal reads, and roll back atomically with product audit',async()=>{
 const db=new PGlite();
 const client={query:async(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:!params&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,params),release(){}};
 const pool={connect:async()=>client};
 try{
  await runMigrations(pool);const repo=createPostgresRepository(pool),bytes=fixture();
  const saved=await repo.transaction(async(state,assets)=>{
   const meta=await assets.put(bytes,details);
   state.audit[meta.id]={id:meta.id,actor:details.actor,action:'setup-file-upload',target:meta.id,createdAt:details.createdAt,metadata:{sha256:meta.sha256}};
   return meta;
  });
  assert.equal(saved.embeddedBikeId,'MX2OEM_2023_Husqvarna_TC_125');
  assert.equal((await repo.transaction((_,assets)=>assets.put(bytes,{...details,filename:'Renamed.stp'}))).id,saved.id);
  assert.equal((await db.query('SELECT count(*)::int n FROM private_setup_assets')).rows[0].n,1);
  const state=await repo.transaction(s=>s);assert.equal(JSON.stringify(state).includes(bytes.toString('base64')),false);
  assert.equal(Object.keys(state).includes('privateAssets'),false);
  const read=await repo.transaction((_,assets)=>assets.read(saved.id));
  assert.deepEqual(Buffer.from(read.bytes),bytes);
  assert.deepEqual(await repo.transaction((_,assets)=>assets.metadata(saved.id)),saved);
  for(const id of ['bad','0'.repeat(36)]){
   assert.equal(await repo.transaction((_,assets)=>assets.read(id)),null);
   assert.equal(await repo.transaction((_,assets)=>assets.metadata(id)),null);
  }
  for(const patch of [{actor:''},{actor:'a'.repeat(201)},{createdAt:'invalid'}])await assert.rejects(repo.transaction((_,assets)=>assets.put(bytes,{...details,...patch})));
  const changed=fixture();changed[243]=1;
  await assert.rejects(repo.transaction(async(state,assets)=>{await assets.put(changed,details);state.audit={};throw Error('synthetic rollback');}));
  assert.equal((await db.query('SELECT count(*)::int n FROM private_setup_assets')).rows[0].n,1);
  assert.equal((await repo.transaction(s=>Object.keys(s.audit))).length,1);
  await assert.rejects(db.query('UPDATE private_setup_assets SET payload=payload'));
  await assert.rejects(db.query('DELETE FROM private_setup_assets'));
 }finally{await db.close();}
});
