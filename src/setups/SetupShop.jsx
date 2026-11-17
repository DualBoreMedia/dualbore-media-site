import {useEffect, useMemo, useState} from 'react';
import {FaArrowRight, FaFlagCheckered, FaMagnifyingGlass} from 'react-icons/fa6';
import {PLANNED_PREVIEWS, PLANNED_TRACKS, RECEIVED_SETUP_PREVIEWS, SETUP_CATALOG, SETUP_TYPES, filterSetupListings, setupMoney, setupPriceCents} from './catalog.js';
import './setups.css';
import {BikeLibrary} from './BikeLibrary.jsx';
import {PrimaryNavigation} from '../PrimaryNavigation.jsx';

export default function SetupShop() {
  const staffOnly = import.meta.env.VITE_AUTH_ACCESS_MODE === 'staff-only';
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [track, setTrack] = useState('all');
  const [bike, setBike] = useState('all');
  const [section,setSection] = useState('bikes');
  const shownBikes = useMemo(() => [...new Map([...RECEIVED_SETUP_PREVIEWS, ...SETUP_CATALOG].map(item => [item.bikeId, {id:item.bikeId, name:item.bikeName}])).values()], []);
  const received = useMemo(() => filterSetupListings(RECEIVED_SETUP_PREVIEWS, {query, kind, track, bike}), [query, kind, track, bike]);
  const published = useMemo(() => filterSetupListings(SETUP_CATALOG, {query, kind, track, bike}), [query, kind, track, bike]);
  const planned = useMemo(() => filterSetupListings(PLANNED_PREVIEWS, {query, kind, track, bike}), [query, kind, track, bike]);
  useEffect(() => {
    document.title = 'MX Bikes Setup Shop | DualBore Media';
    return () => {document.title = 'DualBore Media';};
  }, []);
  const reset = () => { setQuery(''); setKind('all'); setTrack('all'); setBike('all'); };

  return <main id="content" className="mxb-page">
    <a href="#mxb-main" className="skip-link">Skip to setup finder</a>


    <PrimaryNavigation active="setups" panelId="panel-setups"/>
    <div className="mxb-shell" id="panel-setups" role="tabpanel" aria-labelledby="tab-setups"><div id="mxb-main"/>
      <section className="mxb-hero" aria-labelledby="mxb-title">
        <div className="mxb-hero-copy">
          <span className="mxb-kicker"><FaFlagCheckered aria-hidden="true"/> MX BIKES / OEM TUNING</span>
          <h1 id="mxb-title">Your bike. <span>Your setup.</span></h1>
          <p>Explore MX Bikes setups by motorcycle, riding style and track.</p>
          <div className="mxb-hero-actions"><a className="button" href="#setup-finder" onClick={event=>{event.preventDefault();setSection('bikes');requestAnimationFrame(()=>document.getElementById('setup-finder')?.scrollIntoView({block:'start'}));}}>Browse motorcycles <FaArrowRight aria-hidden="true"/></a></div>
        </div>
        <aside className="mxb-hero-info" aria-label="Planned setup prices">
          <span>PLANNED PRICES / USD</span>
          <div><strong>$1</strong><p>Track setup<small>Per motorcycle and track</small></p></div>
          <div><strong>$2</strong><p>General MX or SX<small>Per motorcycle</small></p></div>
        </aside>
      </section>

      <p className="mxb-status" role="status"><span className="mxb-status-dot" aria-hidden="true"/><span><strong>Setups coming soon.</strong> Purchases and downloads are closed.</span></p>

      <nav className="mxb-section-nav" aria-label="Setup catalog views">
        <button type="button" aria-pressed={section==='bikes'} aria-controls="bike-library-view" onClick={()=>setSection('bikes')}>Browse motorcycles</button>
        <button type="button" aria-pressed={section==='previews'} aria-controls="setup-preview-view" onClick={()=>setSection('previews')}>Setup previews</button>
      </nav>
      <div id="bike-library-view" hidden={section!=='bikes'}>{section==='bikes'&&<BikeLibrary/>}</div>
      <div id="setup-preview-view" hidden={section!=='previews'}>
      <section className="mxb-finder" id="preview-finder" aria-labelledby="finder-heading">
        <div className="mxb-section-title"><div><span className="mxb-kicker">FIND YOUR LINE</span><h2 id="finder-heading">Setup finder</h2></div><p>A look at the collection ahead.</p></div>
        <div className="mxb-controls">
          <label className="mxb-field"><span>Search</span><span className="mxb-search"><FaMagnifyingGlass aria-hidden="true"/><input type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search tracks or OEM bikes"/></span></label>
          <label className="mxb-field"><span>Setup type</span><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All setup types</option>{Object.entries(SETUP_TYPES).map(([id,type])=><option key={id} value={id}>{type.name}</option>)}</select></label>
          <label className="mxb-field"><span>Track</span><select value={track} onChange={e=>setTrack(e.target.value)}><option value="all">All tracks / General</option>{PLANNED_TRACKS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="mxb-field"><span>OEM bike</span><select value={bike} onChange={e=>setBike(e.target.value)}><option value="all">All listed bikes</option>{shownBikes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="mxb-results-heading"><h3>Available setups <span>({published.length})</span></h3><button type="button" onClick={reset}>Clear filters</button></div>
        {published.length ? <div className="mxb-card-grid">{published.map(item=><article className="mxb-card" key={item.id}><span className="mxb-card-eyebrow">{SETUP_TYPES[item.kind].name}</span><h4>{item.name}</h4><p>OEM {item.oemVersion} · MX Bikes {item.gameVersion}</p><div className="mxb-card-footer"><strong>{setupMoney(setupPriceCents(item.kind))}</strong><span>Planned price</span></div></article>)}</div> : <div className="mxb-empty"><strong>The first releases are on the way.</strong></div>}
        <div className="mxb-results-heading mxb-planned-title"><h3>Sample previews <span>({received.length})</span></h3><span>Compatibility not yet verified</span></div>
        {received.length ? <div className="mxb-card-grid">{received.map(item=><article className="mxb-card mxb-preview" key={item.id}><span className="mxb-card-eyebrow">{SETUP_TYPES[item.kind].name}</span><h4>{item.name}</h4><span className="mxb-bike-status">Sample preview</span><div className="mxb-card-footer"><strong>{setupMoney(setupPriceCents(item.kind))}</strong><span>Planned price</span></div></article>)}</div> : <div className="mxb-empty"><p>No sample previews match.</p><button type="button" onClick={reset}>Show all previews</button></div>}
        <div className="mxb-results-heading mxb-planned-title"><h3>Coming next <span>({planned.length})</span></h3></div>
        {planned.length ? <div className="mxb-card-grid">{planned.map(item=><article className="mxb-card mxb-preview" key={item.id}><span className="mxb-card-eyebrow">{SETUP_TYPES[item.kind].name}</span><h4>{item.kind === 'track' ? item.trackName : item.name}</h4><span className="mxb-bike-status">Coming soon</span><div className="mxb-card-footer"><strong>{setupMoney(setupPriceCents(item.kind))}</strong><span>Planned price</span></div></article>)}</div> : <div className="mxb-empty"><p>No upcoming previews match.</p><button type="button" onClick={reset}>Show all previews</button></div>}
      </section>

      </div>
    </div>
    <footer className="mxb-footer"><a href="/#garage">DualBore Media</a><span>Independent community-made setup plans. Not affiliated with MX Bikes or Project OEM.</span></footer>
  </main>;
}
