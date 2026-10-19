// Legacy variants/reservations remain finite-stock unless explicitly configured.
export const inventoryPolicy = value => value?.inventoryPolicy === 'made_to_order' ? 'made_to_order' : 'stocked';
export const madeToOrder = value => inventoryPolicy(value) === 'made_to_order';
export const publicAvailableQuantity = variant => madeToOrder(variant) ? null : variant.availableQuantity;
