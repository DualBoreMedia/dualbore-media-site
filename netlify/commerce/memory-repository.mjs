import {memorySetupAssets} from '../setups/private-assets.mjs';
export const initialEmptyState = Object.freeze(Object.fromEntries(['products', 'variants', 'orders', 'events', 'emails', 'reservations', 'profiles', 'shipments', 'shipmentItems', 'trackingEvents', 'audit', 'refundRequests', 'limits', 'supportTickets', 'marketingContacts', 'marketingEvents'].map(key => [key, Object.freeze({})])));
export const emptyState = () => structuredClone(initialEmptyState);

/** Deterministic test adapter only. It is NOT durable persistence. */
export function createMemoryRepository(seed = {}) {
  let committed = { ...emptyState(), ...structuredClone(seed) };
  let assetVersions = new Map();
  let queue = Promise.resolve();
  return {
    transaction(callback) {
      const work = queue.then(async () => {
        const state = structuredClone(committed);
        const nextAssets = structuredClone(assetVersions);
        const result = await callback(state,memorySetupAssets(nextAssets));
        const detached = structuredClone(result);
        committed = structuredClone(state);
        assetVersions = nextAssets;
        return detached;
      });
      queue = work.catch(() => {});
      return work;
    },
  };
}
