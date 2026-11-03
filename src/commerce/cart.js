import { validateItems, variantById } from './catalog.js';
export const storageKey = 'dbm-commerce-test-cart-v1';
export const validateReplacement=items=>validateItems(items,{allowEmpty:true});
export function restoreCart(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 4096) return [];
    const saved = JSON.parse(raw);
    if (saved?.version !== 1) return [];
    return validateItems(saved.items, {allowEmpty:true});
  } catch { return []; }
}
export function updateQuantity(items, variantId, quantity) {
  validateItems(items, {allowEmpty:true});
  if (!variantById(variantId) || !Number.isInteger(quantity) || quantity < 0) throw new Error('Choose a valid item and quantity.');
  const next = items.filter(item => item.variantId !== variantId);
  if (quantity) next.push({variantId,quantity});
  return validateItems(next, {allowEmpty:true});
}
export function addItem(items, variantId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Choose a quantity from 1 to 10.');
  const previous = items.find(item => item.variantId === variantId)?.quantity || 0;
  return updateQuantity(items, variantId, previous + quantity);
}
