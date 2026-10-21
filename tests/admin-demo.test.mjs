import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer as createHttpServer} from 'node:http';
import {assertDemoEnvironment,assertDemoDatabase,demoProviders,startAdminDemo} from '../scripts/admin-demo.mjs';
import {demoSeed,demoIdentity} from '../scripts/admin-demo-data.mjs';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';

test('occupied demo port cleans up its disposable repository and control pool',async()=>{
 const occupied=createHttpServer();await new Promise(resolve=>occupied.listen(4339,'127.0.0.1',resolve));let closed=0,shutdown=0;
 try{await assert.rejects(startAdminDemo({port:4339,env:{},repositoryFactory:async()=>({repository:createMemoryRepository(),close:async()=>closed++,shutdown:async()=>shutdown++})}),/already in use/);assert.equal(closed,1);assert.equal(shutdown,1);}finally{await new Promise(resolve=>occupied.close(resolve));}
});

test('practice refuses production/remote database configurations and uses synthetic identities only',()=>{
 assert.doesNotThrow(()=>assertDemoEnvironment({}));
 for(const env of [{NETLIFY:'true'},{VERCEL:'1'},{CONTEXT:'dev'},{NODE_ENV:'production'},{COMMERCE_ENVIRONMENT:'production'}])assert.throws(()=>assertDemoEnvironment(env));
 assert.equal(assertDemoDatabase('postgres://demo@127.0.0.1:55432/dbm_sandbox'),'postgres://demo@127.0.0.1:55432/dbm_sandbox');
 for(const url of ['postgres://localhost/dbm_sandbox','postgres://127.0.0.1:5432/dbm_sandbox','postgres://127.0.0.1:55432/production','https://127.0.0.1:55432/dbm_sandbox','postgres://127.0.0.1:55432/dbm_sandbox?host=remote.invalid'])assert.throws(()=>assertDemoDatabase(url));
 const {state,env,calendar}=demoSeed('2026-10-09T14:00:00Z');
 assert.equal(Object.keys(state.orders).length,8);assert.equal(Object.keys(state.variants).length,15);
 assert.ok(Object.values(state.orders).every(o=>o.isTest&&o.customerEmail.endsWith('@example.invalid')));
 assert.equal(state.orders['demo-order-1'].shippingPromise.dueDate,'2026-10-16');
 assert.deepEqual(calendar.weekdays,[1,2,3,4,5]);assert.equal(env.PAYMENTS_ENABLED,'false');assert.equal(env.TRANSACTIONAL_EMAILS_ENABLED,'false');
 assert.equal(demoIdentity('employee').admin,false);assert.equal(demoIdentity('customer').role,'customer');
});

test('provider simulators reject real invitations and payments, keep role changes and refund retries local',async()=>{
 const p=demoProviders();await assert.rejects(p.client.users.getUser('real'));await assert.rejects(p.client.users.updateUserMetadata('real',{privateMetadata:{role:'employee'}}));
 const user=await p.client.users.getUser('user_demoEmployee');user.privateMetadata.role='admin';assert.equal((await p.client.users.getUser(user.id)).privateMetadata.role,'employee');
 await p.client.users.updateUserMetadata(user.id,{privateMetadata:{role:'customer'}});assert.equal((await p.client.users.getUser(user.id)).privateMetadata.role,'customer');
 assert.equal((await p.client.users.getUserList()).totalCount,3);assert.deepEqual(await p.client.sessions.getSessionList(),{data:[]});assert.equal((await p.client.sessions.revokeSession()).status,'revoked');
 await assert.rejects(p.client.invitations.createInvitation({emailAddress:'real@example.com'}));
 const invite=await p.client.invitations.createInvitation({emailAddress:'practice@example.invalid'});assert.equal((await p.client.invitations.getInvitationList()).data.length,1);await p.client.invitations.revokeInvitation(invite.id);await assert.rejects(p.client.invitations.revokeInvitation('real'));
 await assert.rejects(p.stripe.paymentIntents.retrieve('pi_real'));assert.equal((await p.stripe.paymentIntents.retrieve('pi_demo_1')).livemode,false);
 const refund=await p.stripe.refunds.create({payment_intent:'pi_demo_1',amount:100},{idempotencyKey:'same'});assert.deepEqual(await p.stripe.refunds.create({amount:100},{idempotencyKey:'same'}),refund);assert.equal((await p.stripe.checkout.sessions.retrieve()).payment_status,'unpaid');
});

test('loopback practice HTTP supports actual operations, reset and server-side role/session enforcement without real services',async()=>{
 let closed=0,repository;
 const demo=await startAdminDemo({port:4337,env:{},repositoryFactory:async()=>({repository:repository=createMemoryRepository(),close:async()=>closed++})});
 try{
  const html=await(await fetch(demo.origin+'/__demo/admin')).text();assert.match(html,/No real orders/);
  const module=await(await fetch(demo.origin+'/__demo-client.jsx')).text();const token=/const token = "([a-f0-9]{64})"/.exec(module)?.[1];assert.ok(token,'ephemeral CSRF token available only through local page');
  const get=async path=>fetch(demo.origin+path,{headers:{'X-Demo-Token':token}});
  const post=async(path,body,extra={})=>fetch(demo.origin+path,{method:'POST',headers:{'X-Demo-Token':token,Origin:demo.origin,'Content-Type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});
  assert.equal((await fetch(demo.origin+'/__demo/meta')).status,403);assert.equal((await get('/api/checkout')).status,404);
  assert.equal((await post('/__demo/control',{role:'employee'},{Origin:'https://example.invalid'})).status,403);
  assert.equal((await post('/__demo/control',{role:'owner'})).status,400);assert.equal((await post('/__demo/control','{')).status,503);
  assert.equal((await get('/__demo/missing')).status,404);
  assert.equal((await fetch(demo.origin+'/__demo/meta',{method:'PUT',headers:{'X-Demo-Token':token}})).status,405);
  assert.equal((await post('/__demo/control',' '.repeat(9000))).status,413);
  assert.equal((await(await get('/__demo/meta')).json()).realAuth,false);
  const admin=await(await get('/__demo/operations?admin=true')).json();assert.equal(admin.orders.length,8);
  assert.equal((await post('/__demo/operations',{action:'transition',orderNumber:'DBM-DEMO-1001',status:'making',expectedVersion:0})).status,200);
  assert.equal(await repository.transaction(s=>s.orders['demo-order-1'].fulfillmentStatus),'making');
  await post('/__demo/control',{role:'customer'});const customer=await(await get('/__demo/operations')).json();assert.equal(customer.orders.length,1);assert.equal((await get('/__demo/operations?admin=true')).status,403);
  assert.equal((await get('/__demo/operations?orderNumber=DBM-DEMO-1002')).status,404);
  await post('/__demo/control',{role:'employee'});assert.equal((await get('/__demo/operations?admin=true')).status,403);assert.equal((await get('/__demo/operations?staff=true')).status,200);
  await post('/__demo/control',{session:'expired'});assert.equal((await get('/__demo/operations?staff=true')).status,403);
  await post('/__demo/control',{session:'revoked'});assert.equal((await get('/__demo/operations?staff=true')).status,401);
  await post('/__demo/control',{reset:true});assert.equal(closed,1);assert.equal(await repository.transaction(s=>s.orders['demo-order-1'].fulfillmentStatus),'received');
  const staff=await(await get('/__demo/operations?staffManagement=true')).json();assert.ok(staff);
  assert.equal((await get('/__demo/staff')).status,200);assert.equal((await fetch(demo.origin+'/staff',{redirect:'manual'})).headers.get('location'),'/__demo/staff');
  const revoked=await post('/__demo/operations',{action:'staff-role',targetUserId:'user_demoEmployee',role:'customer',expectedRole:'employee',confirmed:true,requestKey:crypto.randomUUID()});assert.equal(revoked.status,200);await post('/__demo/control',{role:'employee'});assert.equal((await get('/__demo/operations?staff=true')).status,404);
  assert.equal((await get('/__demo/customer')).status,200);
  // No normal application entry point imports either demo module.
  for(const file of ['vite.config.mjs','src/main.jsx'])assert.doesNotMatch(await readFile(file,'utf8'),/admin-demo|__demo/);
 }finally{await demo.close();}
 assert.equal(closed,2);
});
