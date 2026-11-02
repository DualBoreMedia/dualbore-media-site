// Public presentation data only. No private setup files, access grants or payment state belong here.
// Selling a digital product requires a separate verified server-side fulfillment implementation.
export const SETUP_TYPES = Object.freeze({
  track: Object.freeze({name: 'Track-specific', priceCents: 100, short: 'Custom-tuned for one track and one OEM bike'}),
  'general-mx': Object.freeze({name: 'General Motocross', priceCents: 200, short: 'A versatile motocross baseline for one OEM bike'}),
  'general-sx': Object.freeze({name: 'General Supercross', priceCents: 200, short: 'A versatile supercross baseline for one OEM bike'}),
});

export const PLANNED_TRACKS = Object.freeze([
  Object.freeze({id: 'mxb-club', name: 'MXB Club'}),
  Object.freeze({id: 'forest', name: 'Forest'}),
  Object.freeze({id: 'assen', name: 'Assen'}),
  Object.freeze({id: 'maryland', name: 'Maryland'}),
]);

// Approved listings only. There are NO downloadable files or validated bike combinations yet.
export const SETUP_CATALOG = Object.freeze([]);

// Owner-supplied files have been inspected, but are not hosted, tested in-game or for sale.
// These are public listing previews ONLY, not access grants or verified inventory.
export const RECEIVED_SETUP_PREVIEWS = Object.freeze([
  Object.freeze({id: 'mx2oem-2023-husqvarna-tc-125-general-sx', kind: 'general-sx', name: '2023 Husqvarna TC 125 — Supercross', trackId: null, trackName: null, bikeId: 'mx2oem-2023-husqvarna-tc-125', bikeName: '2023 Husqvarna TC 125', searchAliases: Object.freeze(['MX2OEM_2023_TC_125', 'MX2OEM_2023_Husqvarna_TC_125'])}),
  Object.freeze({id: 'mx2oem-2023-husqvarna-tc-125-assen', kind: 'track', name: '2023 Husqvarna TC 125 — Assen', trackId: 'assen', trackName: 'Assen', bikeId: 'mx2oem-2023-husqvarna-tc-125', bikeName: '2023 Husqvarna TC 125', searchAliases: Object.freeze(['MX2OEM_2023_TC_125', 'MX2OEM_2023_Husqvarna_TC_125'])}),
  Object.freeze({id: 'mx2oem-2023-husqvarna-tc-125-maryland', kind: 'track', name: '2023 Husqvarna TC 125 — Maryland', trackId: 'maryland', trackName: 'Maryland', bikeId: 'mx2oem-2023-husqvarna-tc-125', bikeName: '2023 Husqvarna TC 125', searchAliases: Object.freeze(['MX2OEM_2023_TC_125', 'MX2OEM_2023_Husqvarna_TC_125'])}),
]);

export const PLANNED_PREVIEWS = Object.freeze([
  Object.freeze({id: 'general-mx', kind: 'general-mx', name: 'General Motocross', trackId: null, trackName: null, bikeId: null, bikeName: null}),
  Object.freeze({id: 'general-sx', kind: 'general-sx', name: 'General Supercross', trackId: null, trackName: null, bikeId: null, bikeName: null}),
  ...PLANNED_TRACKS.filter(track => !RECEIVED_SETUP_PREVIEWS.some(item => item.trackId === track.id))
    .map(track => Object.freeze({id: `track-${track.id}`, kind: 'track', name: track.name, trackId: track.id, trackName: track.name, bikeId: null, bikeName: null})),
]);

export const setupPriceCents = kind => SETUP_TYPES[kind]?.priceCents ?? null;
export const setupMoney = cents => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(cents / 100);

// Match common compact game IDs and bike shorthand without relaxing exact bike/track filters.
const searchText=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function filterSetupListings(listings, {query = '', kind = 'all', track = 'all', bike = 'all'} = {}) {
  const normalized=searchText(String(query).slice(0,100));
  const terms=normalized.split(/\s+/).filter(Boolean);
  const compactQuery=normalized.replace(/\s+/g,'');
  return listings.filter(item=>{
    if((kind!=='all'&&item.kind!==kind)||(track!=='all'&&item.trackId!==track)||(bike!=='all'&&item.bikeId!==bike))return false;
    const index=searchText([item.name,item.trackName,item.bikeName,item.bikeId,SETUP_TYPES[item.kind]?.name,...(item.searchAliases||[])].join(' '));
    const compactIndex=index.replace(/\s+/g,'');
    return terms.length===0||terms.every(term=>index.includes(term)||compactIndex.includes(term))
      ||compactIndex.includes(compactQuery);
  });
}
