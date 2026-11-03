import { validateItems, variantById, shippingAmount } from '../../src/commerce/catalog.js';
import { checkAvailability, fixtureById, variantState } from '../../src/commerce/fixtures.js';

export function quoteCart(input,{scenario='in-stock'}={}) {
  if (!input || typeof input !== 'object' || Object.keys(input).length !== 2
    || !Object.hasOwn(input,'country') || !Object.hasOwn(input,'items') || input.country !== 'US') {
    throw new Error('This test estimate supports USA shipping only.');
  }
  const items = validateItems(input.items);
  checkAvailability(items,scenario);
  const lines = items.map(item => {
    const variant = variantById(item.variantId);
    const unitAmount=variantState(item.variantId,scenario).unitAmount;
    return {...item, sku:variant.sku, unitAmount, lineAmount:unitAmount * item.quantity};
  });
  const subtotal = lines.reduce((sum,line) => sum + line.lineAmount,0);
  return { mode:'test', currency:'usd', lines, subtotal, shipping:shippingAmount,
    estimateBeforeTax:subtotal + shippingAmount, taxStatus:'not_calculated', checkoutAvailable:false };
}

const json = (body,status) => Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleQuoteRequest(request,{enabled=false}={}) {
  const url = new URL(request.url);
  // This foundation has no hosted purchase API. An environment variable cannot enable one.
  if (!enabled || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return json({error:'Not available.'},404);
  if (request.method !== 'POST') return json({error:'Use POST.'},405);
  if (request.headers.get('Origin') !== url.origin) return json({error:'Request origin rejected.'},403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return json({error:'Use JSON.'},415);
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({error:'A cart is required.'},400);
    let length = 0;
    const chunks = [];
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return json({error:'Cart is too large.'},413); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { return json({error:'Invalid cart JSON.'},400); }
  try {
    const scenario=input?.scenario || 'in-stock';
    if (!fixtureById(scenario)) return json({error:'Unsupported demo fixture.'},400);
    if (['network-failure','shipping-error','tax-error'].includes(scenario)) return json({error:scenario==='shipping-error'?'Shipping estimate unavailable.':scenario==='tax-error'?'Tax estimate unavailable.':'Estimate service unavailable.',code:scenario},503);
    const {scenario:ignored,...cart}=input;
    return json(quoteCart(cart,{scenario}),200);
  }
  catch (error) { return json({error:error.message},400); }
}
