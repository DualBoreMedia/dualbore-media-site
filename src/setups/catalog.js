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
]);

// Approved listings only. There are NO downloadable files or validated bike combinations yet.
export const SETUP_CATALOG = Object.freeze([]);

export const PLANNED_PREVIEWS = Object.freeze([
  Object.freeze({id: 'general-mx', kind: 'general-mx', name: 'General Motocross', trackId: null, trackName: null, bikeId: null, bikeName: null}),
  Object.freeze({id: 'general-sx', kind: 'general-sx', name: 'General Supercross', trackId: null, trackName: null, bikeId: null, bikeName: null}),
  ...PLANNED_TRACKS.map(track => Object.freeze({id: `track-${track.id}`, kind: 'track', name: track.name, trackId: track.id, trackName: track.name, bikeId: null, bikeName: null})),
]);

export const setupPriceCents = kind => SETUP_TYPES[kind]?.priceCents ?? null;
export const setupMoney = cents => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(cents / 100);

export function filterSetupListings(listings, {query = '', kind = 'all', track = 'all', bike = 'all'} = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  return listings.filter(item => (kind === 'all' || item.kind === kind)
    && (track === 'all' || item.trackId === track)
    && (bike === 'all' || item.bikeId === bike)
    && [item.name, item.trackName, item.bikeName, SETUP_TYPES[item.kind]?.name]
      .some(value => String(value || '').toLocaleLowerCase().includes(search)));
}
