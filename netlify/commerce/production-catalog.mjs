import {testCatalog} from './catalog.mjs';

// Owner-approved configuration only. Importing this module never seeds a database
// or creates Stripe products. Live IDs and activation still need verified setup.
export const productionCatalogPlan = Object.freeze(testCatalog.map(variant => Object.freeze({
  id: variant.id, productId: variant.productId, sku: variant.sku, name: variant.name,
  size: variant.size, inventoryPolicy: 'made_to_order',
  productionPriceCents: variant.productId === 'e92-tee' ? 3000 : 5000,
  priceCents: variant.productId === 'e92-tee' ? 3000 : 5000, stripePriceId: null,
  liveStripePriceId: null, availableQuantity: 0, reservedQuantity: 0, soldQuantity: 0,
  active: false, testData: false,
})));
