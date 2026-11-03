import test from 'node:test';
import assert from 'node:assert/strict';
import { variants } from '../src/commerce/catalog.js';
import { addItem, updateQuantity, restoreCart } from '../src/commerce/cart.js';
import { quoteCart, handleQuoteRequest } from '../netlify/lib/cart-quote.mjs';

test('three designs have fifteen unique size variants at the confirmed test price', () => {
  assert.equal(variants.length, 15);
  assert.equal(new Set(variants.map(v => v.id)).size, 15);
  assert.equal(new Set(variants.map(v => v.sku)).size, 15);
  assert.ok(variants.every(v => v.unitAmount === 3000 && v.currency === 'usd'));
});
test('cart combines quantities, updates sizes independently and removes zero quantities', () => {
  let cart = addItem([], 'e92-tee-m', 1);
  cart = addItem(cart, 'e92-tee-m', 2);
  cart = addItem(cart, 'e92-tee-xl', 1);
  assert.deepEqual(cart, [{ variantId: 'e92-tee-m', quantity: 3 }, { variantId: 'e92-tee-xl', quantity: 1 }]);
  assert.deepEqual(updateQuantity(cart, 'e92-tee-m', 0), [{ variantId: 'e92-tee-xl', quantity: 1 }]);
  assert.throws(() => addItem(cart, 'e92-tee-m', 8));
  assert.throws(() => updateQuantity(cart, 'e92-tee-xl', -1));
});
test('saved carts are untrusted, versioned and contain no prices or personal details', () => {
  const items = [{ variantId: 'e92-tee-m', quantity: 2 }];
  assert.deepEqual(restoreCart(JSON.stringify({ version: 1, items })), items);
  for (const value of ['bad', '{}', '{"version":2,"items":[]}', JSON.stringify({version:1,items:[{...items[0],price:1}]}), JSON.stringify({version:1,items:[{variantId:'unknown',quantity:1}]})]) {
    assert.deepEqual(restoreCart(value), []);
  }
});
test('server independently prices multi-item USA cart with one flat shipping charge', () => {
  const quote = quoteCart({ country: 'US', items: [{ variantId: 'e92-tee-m', quantity: 2 }, { variantId: 'e90-crewneck-l', quantity: 1 }] });
  assert.equal(quote.subtotal, 9000);
  assert.equal(quote.shipping, 700);
  assert.equal(quote.estimateBeforeTax, 9700);
  assert.equal(quote.taxStatus, 'not_calculated');
  assert.equal(quote.checkoutAvailable, false);
});
test('server rejects forged prices, duplicates, unknown products and invalid quantities or destinations', () => {
  const good = { variantId: 'e92-tee-m', quantity: 1 };
  for (const items of [[], [good, good], [{...good,unitAmount:1}], [{...good,quantity:0}], [{...good,quantity:1.5}], [{...good,quantity:'1'}], [{...good,quantity:11}], [{...good,variantId:'__proto__'}]]) {
    assert.throws(() => quoteCart({country:'US',items}));
  }
  assert.throws(() => quoteCart({country:'CA',items:[good]}));
  assert.throws(() => quoteCart({country:'US',items:variants.slice(0,3).map(v=>({variantId:v.id,quantity:10}))}));
  assert.throws(() => quoteCart({country:'US',items:[good],shipping:0}));
});
const request = (body, extras = {}) => new Request('http://127.0.0.1:4176/api/cart-quote', { method:'POST', headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:4176'}, body:JSON.stringify(body), ...extras });
const valid = {country:'US',items:[{variantId:'e92-tee-m',quantity:1}]};
test('quote endpoint is local-only, opt-in, same-origin, no-store and accepts a valid estimate', async () => {
  assert.equal((await handleQuoteRequest(request(valid))).status, 404);
  const response = await handleQuoteRequest(request(valid), {enabled:true});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal((await response.json()).estimateBeforeTax,3700);
  assert.equal((await handleQuoteRequest(new Request('https://example.com/api/cart-quote'),{enabled:true})).status,404);
  assert.equal((await handleQuoteRequest(request(valid,{headers:{'Content-Type':'application/json',Origin:'https://attacker.invalid'}}),{enabled:true})).status,403);
});
test('quote endpoint rejects wrong method, malformed JSON, wrong type and oversized bodies', async () => {
  const invoke = r => handleQuoteRequest(r,{enabled:true});
  assert.equal((await invoke(new Request('http://127.0.0.1:4176/api/cart-quote'))).status,405);
  assert.equal((await invoke(request(valid,{body:'{'}))).status,400);
  assert.equal((await invoke(request(valid,{headers:{Origin:'http://127.0.0.1:4176','Content-Type':'text/plain'}}))).status,415);
  assert.equal((await invoke(request(valid,{body:' '.repeat(5000)}))).status,413);
});
