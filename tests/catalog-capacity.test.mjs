import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {createPostgresRepository,runMigrations} from '../netlify/commerce/repository.mjs';
test('archived catalog history cannot displace current physical or setup previews; legacy tombstones remain available',async()=>{
 const db=new PGlite();const client={query:async(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:!params&&sql.includes(';')?(await db.exec(sql)).at(-1):db.query(sql,params),release(){}};
 const pool={connect:async()=>client};
 try{
  await runMigrations(pool);
  await db.query("INSERT INTO managed_products (id,data) SELECT 'archived-'||n, jsonb_build_object('id','archived-'||n,'status','archived','published',jsonb_build_object('type','physical')) FROM generate_series(1,1001) n");
  const active={id:'z-live',status:'published',published:{type:'physical'}},setup={id:'z-setup',status:'draft',setupPreview:{bikeId:'husqvarna-tc-125-2023'}},hidden={id:'e92-tee',status:'archived',draft:{type:'physical'}};
  for(const row of [active,setup,hidden])await db.query('INSERT INTO managed_products(id,data) VALUES($1,$2)',[row.id,row]);
  const rows=await createPostgresRepository(pool).readPublishedProducts(['e92-tee']);assert.deepEqual(rows.map(p=>p.id).sort(),['e92-tee','z-live','z-setup']);
  const without=await createPostgresRepository(pool).readPublishedProducts();assert.deepEqual(without.map(p=>p.id).sort(),['z-live','z-setup']);
 }finally{await db.close();}
});
