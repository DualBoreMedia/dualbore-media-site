import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtures,variantState,checkAvailability,fixtureCart} from '../src/commerce/fixtures.js';
import {quoteCart,handleQuoteRequest} from '../netlify/lib/cart-quote.mjs';
import {addItem,updateQuantity} from '../src/commerce/cart.js';

test('demo fixtures are explicit, bounded and separate from real inventory',()=>{
  assert.equal(fixtures.length,9);
  assert.equal(variantState('e92-tee-m','low-stock').limit,2);
  assert.equal(variantState('e92-tee-m','sold-out').available,false);
  assert.equal(variantState('unknown','in-stock').available,false);
  assert.deepEqual(fixtureCart('empty-cart'),[]);
  assert.throws(()=>checkAvailability(fixtureCart('stale-cart'),'stale-cart'));
});
test('server rejects unavailable demo sizes and excess demo stock',()=>{
  const cart={country:'US',items:[{variantId:'e92-tee-m',quantity:3}]};
  assert.throws(()=>quoteCart(cart,{scenario:'sold-out'}));
  assert.throws(()=>quoteCart(cart,{scenario:'low-stock'}));
  assert.throws(()=>quoteCart(cart,{scenario:'unknown'}));
});
test('changed-price fixture returns authoritative new amounts without changing the base catalog',()=>{
  const cart={country:'US',items:[{variantId:'e92-tee-m',quantity:2}]};
  assert.equal(quoteCart(cart,{scenario:'changed-price'}).estimateBeforeTax,7700);
  assert.equal(quoteCart(cart).estimateBeforeTax,6700);
});
test('editing a size preserves other sizes and validates merged quantity',()=>{
  let items=addItem([], 'e92-tee-m',2);
  items=addItem(items,'e92-tee-l',1);
  items=updateQuantity(items,'e92-tee-m',0);
  items=addItem(items,'e92-tee-xl',2);
  assert.equal(items.reduce((sum,item)=>sum+item.quantity,0),3);
  assert.ok(items.some(item=>item.variantId==='e92-tee-l'));
});
test('local service fixtures return honest shipping, tax and network failures',async()=>{
  for(const scenario of ['network-failure','shipping-error','tax-error']){
    const request=new Request('http://127.0.0.1:4176/api/cart-quote',{method:'POST',headers:{Origin:'http://127.0.0.1:4176','Content-Type':'application/json'},body:JSON.stringify({country:'US',items:fixtureCart(scenario),scenario})});
    const response=await handleQuoteRequest(request,{enabled:true});
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,scenario);
  }
});
