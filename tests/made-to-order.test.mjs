import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createPostgresRepository,runMigrations} from '../netlify/commerce/repository.mjs';
import {createCommerceService} from '../netlify/commerce/service.mjs';
import {seedTestCatalog} from '../netlify/commerce/catalog.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {commerceHttp} from '../netlify/commerce/http.mjs';
import {productionCatalogPlan} from '../netlify/commerce/production-catalog.mjs';

const id='e92-tee-m';
const admin={userId:'admin',email:'admin@example.invalid',admin:true,mfa:true,sessionId:'session-admin'};
test('production catalog plan records approved made-to-order prices without activation or live IDs',()=>{
  assert.equal(productionCatalogPlan.length,15);assert.equal(new Set(productionCatalogPlan.map(v=>v.id)).size,15);
  for(const product of ['e92-tee','e90-crewneck','sv1000s-silhouette']){
    const variants=productionCatalogPlan.filter(v=>v.productId===product);assert.deepEqual(variants.map(v=>v.size),['S','M','L','XL','2XL']);
    for(const v of variants){assert.equal(v.productionPriceCents,product==='e92-tee'?3000:5000);assert.equal(v.inventoryPolicy,'made_to_order');assert.equal(v.active,false);assert.equal(v.liveStripePriceId,null);assert.equal(v.availableQuantity,0);}
  }
});
async function fixture(repository=createMemoryRepository()){
  await seedTestCatalog(repository);
  await repository.transaction(s=>{Object.assign(s.variants[id],{inventoryPolicy:'made_to_order',stripePriceId:'price_synthetic'});});
  const stripe={prices:{retrieve:async()=>({active:true,livemode:false,currency:'usd',unit_amount:3000})},checkout:{sessions:{create:async()=>({id:'cs_test_'+randomUUID().replaceAll('-',''),url:'https://checkout.stripe.com/c/test',livemode:false})}}};
  const service=createCommerceService({repository,stripe});
  const state=()=>repository.transaction(s=>s);
  const start=(quantity=1,key=randomUUID(),quoteToken)=>service.checkout({items:[{variantId:id,quantity}]},{requestKey:key,quoteToken});
  const event=async(session,type='checkout.session.completed')=>{
    const order=Object.values((await state()).orders).find(o=>o.sessionId===session.sessionId);
    return{id:'evt_'+randomUUID().replaceAll('-',''),livemode:false,type,data:{object:{id:session.sessionId,livemode:false,metadata:{order_id:order.id},payment_status:type.endsWith('completed')?'paid':'unpaid',currency:'usd',amount_subtotal:order.subtotalCents,amount_total:order.subtotalCents+700,total_details:{amount_shipping:700,amount_tax:0},customer_details:{email:'owner@example.invalid'},collected_information:{shipping_details:{name:'Synthetic Customer',address:{country:'US'}}}}}};
  };
  return{repository,service,state,start,event,stripe};
}

test('made-to-order checkout reserves demand without fictional stock; verified payment and replay settle once',async()=>{
  const f=await fixture(),key=randomUUID();
  const a=await f.start(3,key),b=await f.start(3,key);assert.equal(a.sessionId,b.sessionId);
  let s=await f.state();assert.deepEqual([s.variants[id].availableQuantity,s.variants[id].reservedQuantity,s.variants[id].soldQuantity],[0,3,0]);
  assert.equal(Object.values(s.reservations)[0].inventoryPolicy,'made_to_order');
  const event=await f.event(a);await f.service.webhook(event);await f.service.webhook(event);
  s=await f.state();assert.deepEqual([s.variants[id].availableQuantity,s.variants[id].reservedQuantity,s.variants[id].soldQuantity],[0,0,3]);
  assert.equal(Object.values(s.orders)[0].status,'paid');assert.equal(Object.keys(s.orders).length,1);
});

test('made-to-order expired checkout releases demand once and snapshots policy across later changes',async()=>{
  const f=await fixture(),session=await f.start(2);
  await f.repository.transaction(s=>{s.variants[id].inventoryPolicy='stocked';s.variants[id].availableQuantity=4;});
  const event=await f.event(session,'checkout.session.expired');await f.service.webhook(event);await f.service.webhook(event);
  const v=(await f.state()).variants[id];assert.deepEqual([v.availableQuantity,v.reservedQuantity,v.soldQuantity],[4,0,0]);
  await f.repository.transaction(s=>{s.variants[id].inventoryPolicy='stocked';});
  const stocked=await f.start(2);await f.repository.transaction(s=>{s.variants[id].inventoryPolicy='made_to_order';});
  await f.service.webhook(await f.event(stocked,'checkout.session.expired'));
  assert.equal((await f.state()).variants[id].availableQuantity,4,'Only actual previously reserved stock is restored.');
});

test('made-to-order still rejects inactive variants, excessive quantity, and unacknowledged price changes',async()=>{
  const f=await fixture();await assert.rejects(f.start(11),{code:'invalid_cart'});
  await f.repository.transaction(s=>{s.variants[id].active=false;});await assert.rejects(f.start(),{code:'inactive_variant'});
  await f.repository.transaction(s=>{s.variants[id].active=true;s.variants[id].priceCents=4000;});await assert.rejects(f.start(),{code:'cart_changed'});
  assert.equal(Object.keys((await f.state()).orders).length,0);
  await assert.rejects(f.service.checkout({items:[{variantId:'e92-tee-l',quantity:1}]},{requestKey:randomUUID()}),{code:'insufficient_stock'});
});

test('made-to-order catalog and operations identify policy, hide available counts, and reject fictional stock edits',async()=>{
  const f=await fixture();await f.repository.transaction(s=>{Object.assign(s.variants[id],{liveStripePriceId:'price_live_synthetic',productionPriceCents:3000});for(const v of Object.values(s.variants))if(v.id!==id)v.active=false;});
  const env={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://example.invalid',PAYMENTS_ENABLED:'true',LIVE_CATALOG_APPROVED:'true',SHIPPING_RATE_CENTS:'995'};
  const response=await commerceHttp(new Request(env.SITE_ORIGIN+'/api/commerce/catalog'),{env,runtime:async()=>({repository:f.repository})});
  const catalog=await response.json();assert.equal(catalog.variants[0].inventoryPolicy,'made_to_order');assert.equal(catalog.variants[0].availableQuantity,null);assert.equal(catalog.variants[0].available,true);
  const operations=createOperationsService({repository:f.repository}),view=await operations.read(admin,{admin:true});
  const variant=view.variants.find(v=>v.id===id);assert.equal(variant.inventoryPolicy,'made_to_order');assert.equal(variant.availableQuantity,null);assert.equal(variant.lowStock,false);assert.equal(view.overview.soldOut,0);assert.equal(view.overview.lowInventory,14);
  const input={action:'inventory',variantId:id,availableQuantity:4,active:true,reason:'Do not invent finished stock',expectedVersion:0};
  await assert.rejects(operations.mutate(admin,input),{code:'invalid_stock'});
  await operations.mutate(admin,{...input,availableQuantity:0,active:false});assert.equal((await f.state()).variants[id].active,false);
});

test('made-to-order variant and reservation policies survive PostgreSQL-compatible persistence and settlement',async()=>{
  const database=new PGlite();
  const pool={connect:async()=>({release(){},query:async(sql,params)=>sql.includes('pg_advisory_xact_lock')?{rows:[]}:!params&&sql.includes(';')?(await database.exec(sql)).at(-1):database.query(sql,params)})};
  try{
    await runMigrations(pool);const f=await fixture(createPostgresRepository(pool));const session=await f.start(2);
    const repository=createPostgresRepository(pool),state=await repository.transaction(s=>s);
    assert.equal(state.variants[id].inventoryPolicy,'made_to_order');assert.equal(Object.values(state.reservations)[0].inventoryPolicy,'made_to_order');
    const service=createCommerceService({repository,stripe:f.stripe});await service.webhook(await f.event(session));
    assert.equal(await repository.transaction(s=>s.variants[id].soldQuantity),2);
    assert.equal(await repository.transaction(s=>s.variants[id].availableQuantity),0);
  }finally{await database.close();}
});
