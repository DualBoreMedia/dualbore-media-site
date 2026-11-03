import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresRepository} from '../netlify/commerce/repository.mjs';
import {consumeLimit} from '../netlify/operations/http.mjs';
import {workosHttp} from '../netlify/operations/workos-http.mjs';

test('unsupported auth paths and methods never initialize storage or provider',async()=>{
 const env={AUTH_PROVIDER:'workos',SITE_ORIGIN:'https://garage.example',WORKOS_API_KEY:'unit-fixture',WORKOS_CLIENT_ID:'client_fixture',WORKOS_COOKIE_PASSWORD:'a-test-only-cookie-password-longer-than-32-characters'};
 const repository={transaction(){throw Error('Storage must not run');}},client={get userManagement(){throw Error('Provider must not run');}};
 for(const [path,method,status]of [['unknown','GET',404],['nested/session','GET',404],['session','POST',405],['refresh','GET',405],['sign-in','DELETE',405]]){
  const response=await workosHttp(new Request(env.SITE_ORIGIN+'/api/auth/'+path,{method,headers:{Origin:env.SITE_ORIGIN}}),{env,repository,client,log:()=>{}});
  assert.equal(response.status,status);
 }
});

test('durable limiter only updates its own counter and writes nothing on denial',async()=>{
 const statements=[];let row,released=0;
 const pool={connect:async()=>({release(){released++;},async query(sql,args){statements.push({sql,args});if(sql.startsWith('SELECT data FROM request_limits'))return{rows:row?[{data:structuredClone(row)}]:[]};if(sql.startsWith('INSERT INTO request_limits'))row=JSON.parse(args[1]);return{rows:[]};}})};
 const repository=createPostgresRepository(pool);
 for(let i=0;i<3;i++)assert.equal(await consumeLimit(repository,'synthetic-ip','auth-attempt',{limit:2,windowMs:1000,now:100}),i<2);
 assert.deepEqual({count:row.count,expiresAt:row.expiresAt},{count:2,expiresAt:1100});
 assert.equal(statements.filter(s=>s.sql.startsWith('INSERT')).length,2);
 const denied=statements.slice(-4).map(s=>s.sql);assert.deepEqual(denied,['BEGIN ISOLATION LEVEL READ COMMITTED','SELECT pg_advisory_xact_lock(17460290, 1)','SELECT data FROM request_limits WHERE id = $1','COMMIT']);
 assert.ok(statements.every(s=>! /order_items|product_variants|audit_events|\borders\b/.test(s.sql)));
 assert.equal(await consumeLimit(repository,'synthetic-ip','auth-attempt',{limit:2,windowMs:1000,now:1100}),true);
 assert.equal(row.count,1);assert.equal(row.expiresAt,2100);assert.equal(released,4);
});

test('durable limiter rolls back and releases its connection on storage failure',async()=>{
 const statements=[];let released=false;const repository=createPostgresRepository({connect:async()=>({release(){released=true;},async query(sql){statements.push(sql);if(sql.startsWith('SELECT data'))throw Error('synthetic unavailable');return{rows:[]};}})});
 await assert.rejects(repository.consumeRateLimit('fixture',{limit:1,windowMs:1000,now:1}),/synthetic unavailable/);
 assert.equal(statements.at(-1),'ROLLBACK');assert.equal(released,true);
});
