import { merch, previewSizes } from '../content.js';

// Draft catalog only. No stock, confirmed fabric specifications or Stripe IDs.
// Explicitly enrolled legacy local test items only; new previews are not purchasable automatically.
const localTestProducts=merch.filter(p=>p.testVariantsEnabled);
export const variants = Object.freeze(localTestProducts.flatMap(product => previewSizes.map(size => Object.freeze({
  id: `${product.id}-${size.toLowerCase()}`, productId: product.id,
  sku: `${product.skuRoot}-${size}`, size, unitAmount: 3000, currency: 'usd',
}))));
export const variantById = id => variants.find(variant => variant.id === id);
export const money = cents => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
export const shippingAmount = 700;
export const maxPerVariant = 10;
export const maxPerOrder = 20;

export function validateItems(items, { allowEmpty = false, knownVariant = variantById } = {}) {
  if (!Array.isArray(items) || (!allowEmpty && !items.length) || items.length > variants.length) throw new Error('Choose at least one valid item.');
  const seen = new Set();
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 2
      || !Object.hasOwn(item, 'variantId') || !Object.hasOwn(item, 'quantity')
      || typeof item.variantId!=='string' || item.variantId.length>120 || !knownVariant(item.variantId) || seen.has(item.variantId)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > maxPerVariant) {
      throw new Error('Choose a valid size and a quantity from 1 to 10 per size.');
    }
    seen.add(item.variantId);
    total += item.quantity;
  }
  if (total > maxPerOrder) throw new Error('The test cart allows up to 20 items per order.');
  return items.map(({variantId,quantity}) => ({variantId,quantity}));
}
