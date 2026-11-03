import { variantById } from './catalog.js';

export const fixtures = [
  {id:'in-stock',label:'In stock',note:'Demo availability only. These quantities are not real stock.'},
  {id:'low-stock',label:'Low stock',note:'Demo: two of each size remain. No real inventory is reserved.'},
  {id:'sold-out',label:'Sold out',note:'Demo: all sizes are unavailable. Remove them or choose another fixture.'},
  {id:'stale-cart',label:'Stale cart',note:'Demo: a saved item is no longer available. Your cart stays intact for review.'},
  {id:'changed-price',label:'Changed price',note:'Demo: the server price is now $35. Review and explicitly accept the update.'},
  {id:'network-failure',label:'Network failure',note:'Demo: the estimate service is temporarily unavailable. Nothing is ordered.'},
  {id:'shipping-error',label:'Shipping error',note:'Demo: the shipping quote failed. Retry after changing the fixture.'},
  {id:'tax-error',label:'Tax error',note:'Demo: tax could not be determined. Checkout remains blocked.'},
  {id:'empty-cart',label:'Empty cart',note:'Demo: start with an empty cart.'},
];
export const fixtureById = id => fixtures.find(fixture=>fixture.id===id);
export function variantState(id,scenario='in-stock') {
  const variant=variantById(id);
  if (!variant || !fixtureById(scenario)) return {available:false,limit:0,unitAmount:0,label:'Unavailable'};
  const limit=scenario==='sold-out'||scenario==='stale-cart'?0:scenario==='low-stock'?2:10;
  return {available:limit>0,limit,unitAmount:scenario==='changed-price'?3500:variant.unitAmount,
    label:scenario==='sold-out'?'Sold out (demo)':scenario==='stale-cart'?'No longer available (demo)':scenario==='low-stock'?'Only 2 per size (demo)':'Available (demo)'};
}
export function checkAvailability(items,scenario) {
  if (!fixtureById(scenario)) throw new Error('Choose a supported test fixture.');
  for (const item of items) {
    const state=variantState(item.variantId,scenario);
    if (!state.available) throw new Error('An item is unavailable in this demo. Remove it before continuing.');
    if (item.quantity>state.limit) throw new Error(`Only ${state.limit} of this size are available in this demo. Reduce the quantity.`);
  }
}
export const fixtureCart = id => id==='empty-cart'?[]:[{variantId:'e92-tee-m',quantity:1},{variantId:'e90-crewneck-xl',quantity:1}];
