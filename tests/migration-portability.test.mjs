import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';import {runMigrations} from '../netlify/commerce/repository.mjs';
test('LF and CRLF checkouts preserve immutable migration history; substantive edits still roll back',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dbm-migration-')),database=new PGlite(),hash=v=>createHash('sha256').update(v).digest('hex');
 const client={query:async(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:!params&&sql.includes(';')?(await database.exec(sql)).at(-1):database.query(sql,params),release(){}};
 const pool={connect:async()=>client},folder=pathToFileURL(dir+'/'),file=join(dir,'001_portable.sql'),lf='CREATE TABLE portable (id text PRIMARY KEY);\n';
 try{
  await writeFile(file,lf);await runMigrations(pool,folder);const initial=(await database.query('SELECT * FROM commerce_migrations')).rows[0];
  await writeFile(file,lf.replaceAll('\n','\r\n'));await runMigrations(pool,folder);assert.deepEqual((await database.query('SELECT * FROM commerce_migrations')).rows[0],initial);
  // Reproduce history written by an earlier Windows checkout.
  await database.query('UPDATE commerce_migrations SET checksum=$1',[hash(lf.replaceAll('\n','\r\n'))]);await writeFile(file,lf);await runMigrations(pool,folder);assert.equal((await database.query('SELECT checksum FROM commerce_migrations')).rows[0].checksum,hash(lf.replaceAll('\n','\r\n')));
  await writeFile(file,lf.replace('id text','id integer'));await assert.rejects(runMigrations(pool,folder),/Applied commerce migration has changed/);
  assert.equal((await database.query("SELECT data_type FROM information_schema.columns WHERE table_name='portable' AND column_name='id'")).rows[0].data_type,'text');
 }finally{await database.close();await rm(dir,{recursive:true,force:true});}
});
