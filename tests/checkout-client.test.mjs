import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutRequest,validateCheckoutUrl,validSessionId,removePurchased,rememberCheckout} from '../src/commerce/checkout-client.js';
const items=[{variantId:'e92-tee-m',quantity:2}];
test('checkout destination requires the exact secure Stripe host',()=>{
  assert.equal(validateCheckoutUrl('https://checkout.stripe.com/c/pay/test_123'),'https://checkout.stripe.com/c/pay/test_123');
  for(const url of ['http://checkout.stripe.com/x','https://checkout.stripe.com.evil.test/x','https://user@checkout.stripe.com/x','javascript:alert(1)','https://checkout.stripe.com:444/x']){
    assert.throws(()=>validateCheckoutUrl(url));
  }
});
test('session ID validation rejects live and malformed IDs',()=>{
  assert.ok(validSessionId('cs_test_12345678'));assert.equal(validSessionId('cs_live_12345678'),false);assert.equal(validSessionId('../cs_test_12345678'),false);
});
test('checkout sends only IDs and quantities with idempotency and optional acknowledgment',async()=>{
  let captured;
  const result=await checkoutRequest({items,key:'request-key',quoteToken:'review-token',fetcher:async(url,init)=>{captured={url,...init};return{ok:true,status:200,json:async()=>({url:'https://checkout.stripe.com/c/pay/test',sessionId:'cs_test_12345678',orderAccessToken:'a'.repeat(32)})};}});
  assert.deepEqual(JSON.parse(captured.body),{items});assert.equal(captured.headers['Idempotency-Key'],'request-key');assert.equal(captured.headers['X-Cart-Quote'],'review-token');assert.ok(result.url.startsWith('https://checkout.stripe.com/'));
});
test('changed server price returns a review instead of a redirect',async()=>{
  const result=await checkoutRequest({items,key:'same-key',fetcher:async()=>({ok:false,status:409,json:async()=>({code:'cart_changed',quoteToken:'token',lines:[{variantId:'e92-tee-m',quantity:2,unitPriceCents:3500,lineTotalCents:7000}]})})});
  assert.equal(result.changed,true);assert.equal(result.url,undefined);
});
test('malformed review and failure do not yield checkout URLs',async()=>{
  await assert.rejects(checkoutRequest({items,key:'key',fetcher:async()=>({ok:false,status:409,json:async()=>({code:'cart_changed',quoteToken:'token',lines:[]})})}));
  await assert.rejects(checkoutRequest({items,key:'key',fetcher:async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})})}),/Unavailable/);
});
test('verified purchase removes its quantities while preserving additional and unrelated cart items',()=>{
  const current=[{variantId:'e92-tee-m',quantity:4},{variantId:'e90-crewneck-l',quantity:1}];
  assert.deepEqual(removePurchased(current,items),[{variantId:'e92-tee-m',quantity:2},{variantId:'e90-crewneck-l',quantity:1}]);assert.equal(current[0].quantity,4);
});
test('checkout access and cart snapshot stay in session storage',()=>{
  const saved=new Map();rememberCheckout({setItem:(key,value)=>saved.set(key,value)},{sessionId:'cs_test_12345678',orderAccessToken:'token'},items);
  assert.equal(saved.get('dbm-order-access:cs_test_12345678'),'token');assert.deepEqual(JSON.parse(saved.get('dbm-order-cart:cs_test_12345678')),items);
});
test('a definitive checkout failure retains its code for a safe new-request retry',async()=>{
  await assert.rejects(checkoutRequest({items,key:'same-key',fetcher:async()=>({ok:false,status:409,json:async()=>({code:'checkout_failed',error:'Start a new checkout request.'})})}),error=>error.code==='checkout_failed'&&error.message==='Start a new checkout request.');
});

test('unreadable checkout JSON and malformed error bodies never navigate or surface provider internals',async()=>{
 await assert.rejects(checkoutRequest({items,key:'same-key',fetcher:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('not JSON');}})}),/unreadable response.*cart is saved/);
 await assert.rejects(checkoutRequest({items,key:'same-key',fetcher:async()=>({ok:false,status:503,json:async()=>({error:{secret:'never-display'}})})}),error=>error.message==='Checkout is unavailable. Your cart is saved.');
});
test('checkout network and timeout failures use bounded same-origin requests and preserve retry intent',async()=>{
 let settings;
 await assert.rejects(checkoutRequest({items,key:'saved-key',fetcher:async(_url,init)=>{settings=init;throw Object.assign(new Error('provider details'),{name:'TimeoutError'});}}),error=>error.code==='checkout_timeout'&&/cart is saved/.test(error.message));
 assert.equal(settings.headers['Idempotency-Key'],'saved-key');
 assert.equal(settings.credentials,'same-origin');
 assert.equal(settings.cache,'no-store');
 assert.ok(settings.signal instanceof AbortSignal);
 await assert.rejects(checkoutRequest({items,key:'saved-key',fetcher:async()=>{throw new TypeError('sensitive network reason');}}),error=>error.code==='checkout_network'&&!error.message.includes('sensitive'));
});
