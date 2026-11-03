// Server-only, fail-closed publication gate for future MX Bikes setup assets.
// This prepares public metadata; it NEVER authorizes payment, storage access or a download.
import {SETUP_TYPES, setupPriceCents} from '../../src/setups/catalog.js';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const version = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/;
const sha256 = /^[a-f0-9]{64}$/;
const label = text => typeof text === 'string' && text.trim() === text && text.length > 0 && text.length <= 100 && !/[<>\x00-\x1f]/.test(text);

export function preparePublicSetupCatalog(entries) {
  if (!Array.isArray(entries) || entries.length > 10000) throw new Error('Invalid setup catalog.');
  const seen = new Set();
  const published = [];
  for (const item of entries) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid setup entry.');
    if (!slug.test(item.id || '') || !slug.test(item.bikeId || '') || !label(item.bikeName)
      || !Object.hasOwn(SETUP_TYPES, item.kind)) throw new Error('Invalid bike/setup identity.');
    if (item.kind === 'track'
      ? !slug.test(item.trackId || '') || !label(item.trackName)
      : item.trackId != null || item.trackName != null) throw new Error('Invalid track/setup combination.');
    const combination = [item.bikeId, item.kind, item.trackId || 'general'].join(':');
    if (seen.has(item.id) || seen.has(combination)) throw new Error('Duplicate setup listing.');
    seen.add(item.id);
    seen.add(combination);
    if (item.published !== true) continue;
    // A staff draft can never become public simply because an ID or price exists.
    if (item.tested !== true || item.fileVerified !== true || item.deliveryReady !== true
      || !version.test(item.oemVersion || '') || !version.test(item.gameVersion || '')
      || !slug.test(item.privateAssetId || '') || !sha256.test(item.fileSha256 || '')) {
      throw new Error('Published setup lacks verified file, compatibility or delivery prerequisites.');
    }
    // Fixed server-side price; do not trust prices, links or paths supplied with an entry.
    published.push(Object.freeze({
      id: item.id, kind: item.kind, bikeId: item.bikeId, bikeName: item.bikeName,
      trackId: item.kind === 'track' ? item.trackId : null,
      trackName: item.kind === 'track' ? item.trackName : null,
      name: item.kind === 'track' ? `${item.bikeName} — ${item.trackName}` : `${item.bikeName} — ${SETUP_TYPES[item.kind].name}`,
      oemVersion: item.oemVersion, gameVersion: item.gameVersion, priceCents: setupPriceCents(item.kind),
    }));
  }
  return Object.freeze(published);
}
