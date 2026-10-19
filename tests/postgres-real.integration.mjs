import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import{randomBytes}from'node:crypto';import{fork}from'node:child_process';import{fileURLToPath}from'node:url';
import{createPostgresRepository,runMigrations}from'../netlify/commerce/repository.mjs';import{seedTestCatalog}from'../netlify/commerce/catalog.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';
import {randomUUID} from 'node:crypto';
// Explicit opt-in. Tests use only a generated schema in the dedicated local sandbox.
test('real PostgreSQL migrations, counters and cross-process last-unit checkout locking',{skip:process.env.DBM_REAL_POSTGRES_TEST!=='true',timeout:30000},async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/dbm_sandbox');
 const schema='dbm_qa_'+randomBytes(8).toString('hex');const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});let pool;const children=[];
 try{await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema,max:3});await runMigrations(pool);const repo=createPostgresRepository(pool);await seedTestCatalog(repo,{quantity:1});await repo.transaction(s=>{s.variants['e92-tee-m'].stripePriceId='price_race';});
  assert.equal((await pool.query('SELECT count(*)::int n FROM product_variants')).rows[0].n,15);
  for(const table of ['orders','order_items','inventory_reservations','stripe_events','email_events'])assert.equal((await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
  const work=[0,1].map(()=>{const child=fork(fileURLToPath(new URL('./fixtures/postgres-race-worker.mjs',import.meta.url)),[],{env:{...process.env,DBM_QA_SCHEMA:schema},execArgv:[],stdio:['ignore','ignore','ignore','ipc']});children.push(child);let readyResolve,resultResolve,resultReject;const ready=new Promise(r=>readyResolve=r),result=new Promise((r,j)=>{resultResolve=r;resultReject=j;});child.on('message',m=>m.ready?readyResolve():resultResolve(m));child.on('error',resultReject);child.on('exit',code=>{if(code)resultReject(Error('Worker failed.'));});return{child,ready,result};});
  await Promise.all(work.map(w=>w.ready));for(const w of work)w.child.send('go');const results=await Promise.all(work.map(w=>w.result));assert.equal(results.filter(r=>r.success).length,1);assert.equal(results.filter(r=>!r.success&&r.code==='insufficient_stock').length,1);
  const state=await repo.transaction(s=>s),v=state.variants['e92-tee-m'];assert.deepEqual([v.availableQuantity,v.reservedQuantity,v.soldQuantity],[0,1,0]);assert.equal(Object.keys(state.orders).length,1);assert.equal(Object.values(state.reservations).filter(r=>r.status==='reserved').length,1);
 }finally{for(const child of children)child.kill();await pool?.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});

test('real PostgreSQL made-to-order concurrent demand, payment replay, and expiry never manufacture available stock',{skip:process.env.DBM_REAL_POSTGRES_TEST!=='true',timeout:30000},async()=>{
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/dbm_sandbox');
 const schema='dbm_mto_qa_'+randomBytes(8).toString('hex'),admin=new pg.Pool({connectionString:process.env.DATABASE_URL});let pool;
 try{
  await admin.query('CREATE SCHEMA '+schema);pool=new pg.Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema,max:3});await runMigrations(pool);
  const repository=createPostgresRepository(pool);await seedTestCatalog(repository);const variantId='e92-tee-m';await repository.transaction(s=>{Object.assign(s.variants[variantId],{inventoryPolicy:'made_to_order',stripePriceId:'price_mto_fixture'});});
  const stripe={prices:{retrieve:async()=>({active:true,livemode:false,currency:'usd',unit_amount:3000})},checkout:{sessions:{create:async()=>({id:'cs_test_'+randomUUID().replaceAll('-',''),livemode:false,url:'https://checkout.stripe.com/c/test'})}}};
  // Real database locking and persistence; the payment provider is a local fixture.
  const services=[0,1].map(()=>createCommerceService({repository:createPostgresRepository(pool),stripe}));
  const sessions=await Promise.all(services.map(service=>service.checkout({items:[{variantId,quantity:2}]},{requestKey:randomUUID()})));
  let state=await repository.transaction(s=>s);assert.deepEqual([state.variants[variantId].availableQuantity,state.variants[variantId].reservedQuantity,state.variants[variantId].soldQuantity],[0,4,0]);
  for(const [index,session] of sessions.entries()){
   const order=Object.values(state.orders).find(o=>o.sessionId===session.sessionId),paid=index===0;
   const event={id:'evt_'+randomUUID().replaceAll('-',''),livemode:false,type:paid?'checkout.session.completed':'checkout.session.expired',data:{object:{id:session.sessionId,livemode:false,metadata:{order_id:order.id},payment_status:paid?'paid':'unpaid',currency:'usd',amount_subtotal:6000,amount_total:6700,total_details:{amount_shipping:700,amount_tax:0},customer_details:{email:'fixture@example.invalid'},collected_information:{shipping_details:{name:'Synthetic Fixture',address:{country:'US'}}}}}};
   await services[index].webhook(event);await services[index].webhook(event);
  }
  state=await createPostgresRepository(pool).transaction(s=>s);assert.deepEqual([state.variants[variantId].availableQuantity,state.variants[variantId].reservedQuantity,state.variants[variantId].soldQuantity],[0,0,2]);
  assert.deepEqual(Object.values(state.orders).map(o=>o.status).sort(),['expired','paid']);assert.equal(Object.keys(state.events).length,2);assert.ok(Object.values(state.reservations).every(r=>r.inventoryPolicy==='made_to_order'));
 }finally{await pool?.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
