import {useEffect, useState} from 'react';
import {BIKE_PLACEHOLDERS, BIKE_ROSTER_SOURCE, BIKE_ROSTER_VERSION, filterBikePlaceholders} from './bike-roster.js';
import {RECEIVED_SETUP_PREVIEWS} from './catalog.js';

const brands = [...new Set(BIKE_PLACEHOLDERS.map(bike => bike.brand))];
const previewStages = {Draft: 'Coming soon', 'File received': 'Sample preview', Testing: 'In review', Verified: 'Verified preview'};
const validPreview = preview => preview && BIKE_PLACEHOLDERS.some(bike => bike.id === preview.bikeId)
  && ['MX', 'SX', 'track'].includes(preview.discipline) && Object.hasOwn(previewStages, preview.stage)
  && ['name', 'description', 'track', 'bikeVersion', 'gameVersion'].every(key => typeof preview[key] === 'string' && preview[key].length <= 3000)
  && (preview.priceCents === null || Number.isSafeInteger(preview.priceCents) && preview.priceCents > 0);

export function BikeLibrary() {
  const [brand, setBrand] = useState('all');
  const [query, setQuery] = useState('');
  const [bikeId, setBikeId] = useState(() => new URLSearchParams(location.search).get('bike') || '');
  const [previews, setPreviews] = useState([]);
  const [requestState, setRequestState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const bikes = filterBikePlaceholders({query, brand});
  const bike = BIKE_PLACEHOLDERS.find(item => item.id === bikeId);

  useEffect(() => {
    const pop = () => {
      setBikeId(new URLSearchParams(location.search).get('bike') || '');
      setBrand('all');
      setQuery('');
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRequestState('loading');
    setPreviews([]);
    fetch('/api/products', {signal: controller.signal, cache: 'no-store'})
      .then(response => {if (!response.ok) throw Error(); return response.json();})
      .then(data => {
        if (!Array.isArray(data.setupPreviews) || data.setupPreviews.length > 1000 || !data.setupPreviews.every(validPreview)) throw Error();
        if (!controller.signal.aborted) {
          setPreviews(data.setupPreviews);
          setRequestState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviews([]);
          setRequestState('error');
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const choose = id => {
    setBikeId(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set('bike', id);
    else url.searchParams.delete('bike');
    const next = url.pathname + url.search + url.hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
  };
  const focusNext = id => requestAnimationFrame(() => document.getElementById(id)?.focus());
  const chooseBrand = (value, moveFocus = false) => {setBrand(value); choose(''); if (moveFocus) focusNext('mxb-bike-results-title');};
  const received = bike ? RECEIVED_SETUP_PREVIEWS.filter(preview => preview.bikeName === bike.name) : [];
  const approved = previews.filter(preview => preview.bikeId === bikeId);
  const generalSlots = [
    {discipline: 'MX', name: 'General Motocross', track: '', price: 2},
    {discipline: 'SX', name: 'General Supercross', track: '', price: 2},
  ];
  const trackSlots = [...new Set([
    ...received.filter(preview => preview.kind === 'track').map(preview => preview.trackName),
    ...approved.filter(preview => preview.discipline === 'track').map(preview => preview.track),
  ])].map(track => ({discipline: 'track', track, name: track, price: 1}));
  const renderSlot = slot => {
    const preview = approved.find(item => item.discipline === slot.discipline && item.track === slot.track);
    const sample = received.find(item => slot.discipline === 'SX' ? item.kind === 'general-sx'
      : slot.discipline === 'track' ? item.trackName === slot.track : item.kind === 'general-mx');
    const status = preview ? previewStages[preview.stage] : sample ? 'Sample preview' : 'Coming soon';
    return <article className="mxb-card mxb-preview" key={slot.discipline + slot.track}>
      <span className="mxb-card-eyebrow">{slot.discipline === 'track' ? 'Track-specific' : slot.discipline === 'MX' ? 'Motocross' : 'Supercross'}</span>
      <h4>{preview?.name || slot.name}</h4>
      {preview?.description && <p>{preview.description}</p>}
      <span className="mxb-bike-status">{status}</span>
      {preview && (preview.bikeVersion || preview.gameVersion) && <p className="mxb-compatibility">
        {preview.bikeVersion && <span>OEM pack: {preview.bikeVersion}</span>}
        {preview.gameVersion && <span>MX Bikes: {preview.gameVersion}</span>}
      </p>}
      <div className="mxb-card-footer"><strong>{preview?.priceCents ? `$${(preview.priceCents / 100).toFixed(2)}` : `$${slot.price}`}</strong><span>Planned price</span></div>
    </article>;
  };

  return <section className="mxb-library" id="setup-finder" aria-labelledby="bike-finder-title">
    <div className="mxb-section-title"><div><span className="mxb-kicker">Manufacturer / Motorcycle / Setup / Track</span><h2 id="bike-finder-title">Choose your bike</h2></div><p>Find your exact model, then explore general and track-specific setups.</p></div>
    <div className="mxb-library-layout">
      <aside className="mxb-library-sidebar" aria-label="Bike library filters">
        <label className="mxb-field">Manufacturer<select value={brand} onChange={event => chooseBrand(event.target.value)}><option value="all">All manufacturers</option>{brands.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="mxb-field">Search bikes<input type="search" maxLength={100} value={query} onChange={event => {setQuery(event.target.value); if (bikeId) choose('');}} placeholder="Try TC125 or YZF"/></label>
        <label className="mxb-field mxb-exact-bike">Exact bike<select value={bikeId} onChange={event => choose(event.target.value)}><option value="">Select an exact bike</option>{[...new Map([...bikes, ...BIKE_PLACEHOLDERS.filter(item => item.id === bikeId)].map(item => [item.id, item])).values()].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="mxb-filter-footer"><p role="status">{bikes.length} {bikes.length === 1 ? 'motorcycle' : 'motorcycles'} found</p><button type="button" onClick={() => {setBrand('all'); setQuery(''); choose('');}}>Reset bike filters</button></div>
      </aside>
      <div className="mxb-library-results">
        {requestState !== 'ready' && <div className="mxb-request-state">
          <p role="status">{requestState === 'loading' ? 'Loading setup previews...' : 'Setup previews could not load. You can still browse motorcycles.'}</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry setup previews</button>
        </div>}
        <div aria-busy={requestState === 'loading'}>
          {!bike ? brand === 'all' && !query.trim() ? <>
            <h3 className="mxb-results-title" id="mxb-manufacturers-title" tabIndex={-1}>Browse by manufacturer</h3>
            <div className="mxb-manufacturer-grid">{brands.map(item => {
              const count = BIKE_PLACEHOLDERS.filter(entry => entry.brand === item).length;
              return <button type="button" key={item} onClick={() => chooseBrand(item, true)}><strong>{item}</strong><span>{count} {count === 1 ? 'model' : 'models'}</span></button>;
            })}</div>
          </> : <>
            <h3 className="mxb-results-title" id="mxb-bike-results-title" tabIndex={-1}>{brand === 'all' ? 'Matching motorcycles' : `${brand} motorcycles`}</h3>
            {bikes.length ? <div className="mxb-bike-grid">{bikes.map(item => <button type="button" className="mxb-bike-choice" key={item.id} onClick={() => {choose(item.id); focusNext('mxb-selected-bike-heading');}} aria-label={`View ${item.name} setups`}><span>{item.brand} / {item.year}</span><strong>{item.model}</strong><small>View setups <span aria-hidden="true">→</span></small></button>)}</div>
              : <div className="mxb-empty"><strong>No motorcycles match.</strong><p>Try a different model or reset your filters.</p></div>}
          </> : <>
            <div className="mxb-selected-bike"><span className="mxb-kicker">{bike.brand} / {bike.year}</span><h3 id="mxb-selected-bike-heading" tabIndex={-1}>{bike.name}</h3><button type="button" onClick={() => {choose(''); focusNext(brand === 'all' && !query.trim() ? 'mxb-manufacturers-title' : 'mxb-bike-results-title');}}>Change motorcycle</button></div>
            <section className="mxb-setup-group" aria-label="General setups"><h3 className="mxb-group-title">General setups</h3><div className="mxb-card-grid">{generalSlots.map(renderSlot)}</div></section>
            <section className="mxb-setup-group" aria-label="Track setups"><h3 className="mxb-group-title">Track setups</h3>{trackSlots.length ? <div className="mxb-card-grid">{trackSlots.map(renderSlot)}</div> : requestState !== 'loading' ? <div className="mxb-empty mxb-track-empty"><p>Track setups coming soon.</p></div> : null}</section>
          </>}
        </div>
      </div>
    </div>
    <p className="mxb-roster-source">Bike list: <a href={BIKE_ROSTER_SOURCE} target="_blank" rel="noopener noreferrer">{BIKE_ROSTER_VERSION} official roster</a>. Confirm your game and OEM pack versions when compatibility details become available. Sample previews are not compatibility verified.</p>
  </section>;
}
