// Legacy variants/reservations remain finite-stock unless explicitly configured.
export const inventoryPolicy = value => value?.inventoryPolicy === 'made_to_order' ? 'made_to_order' : 'stocked';
export const madeToOrder = value => inventoryPolicy(value) === 'made_to_order';
export const publicAvailableQuantity = variant => madeToOrder(variant) ? null : variant.availableQuantity;

export const listingAvailable=(state,v)=>!state.products?.[v?.productId]||(state.products[v.productId].status==='published'&&state.products[v.productId].published?.type==='physical'&&state.products[v.productId].published.sizes.includes(v.size));
