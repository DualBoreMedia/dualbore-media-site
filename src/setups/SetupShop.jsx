import {useEffect, useMemo, useState} from 'react';
import {FaArrowRight, FaBolt, FaDownload, FaFlagCheckered, FaMagnifyingGlass, FaShieldHalved} from 'react-icons/fa6';
import {PLANNED_PREVIEWS, PLANNED_TRACKS, SETUP_CATALOG, SETUP_TYPES, filterSetupListings, setupMoney, setupPriceCents} from './catalog.js';
import './setups.css';

export default function SetupShop() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [track, setTrack] = useState('all');
  const [bike, setBike] = useState('all');
  const publishedBikes = useMemo(() => [...new Map(SETUP_CATALOG.map(item => [item.bikeId, {id:item.bikeId, name:item.bikeName}])).values()], []);
  const published = useMemo(() => filterSetupListings(SETUP_CATALOG, {query, kind, track, bike}), [query, kind, track, bike]);
  const planned = useMemo(() => filterSetupListings(PLANNED_PREVIEWS, {query, kind, track, bike}), [query, kind, track, bike]);
  useEffect(() => {
    document.title = 'MX Bikes Setup Shop | DualBore Media';
    return () => {document.title = 'DualBore Media';};
  }, []);
  const reset = () => { setQuery(''); setKind('all'); setTrack('all'); setBike('all'); };

  return <main id="content" className="mxb-page">
    <a href="#mxb-main" className="skip-link">Skip to setup finder</a>
    <header className="mxb-header">
      <a className="mxb-brand" href="/#garage"><img src="/assets/channel-logo.jpg" alt="" width="42" height="42"/> <span>DUALBORE <em>MEDIA</em></span></a>
      <nav aria-label="Website navigation"><a href="/#vault">Videos</a><a href="/shop">Merch</a><a href="/account">My Garage</a></nav>
    </header>

    <div className="mxb-shell" id="mxb-main">
      <section className="mxb-hero" aria-labelledby="mxb-title">
        <div className="mxb-hero-copy">
          <span className="mxb-kicker"><FaFlagCheckered aria-hidden="true"/> MX BIKES / OEM TUNING</span>
          <h1 id="mxb-title">Your bike. <span>Your track.</span> Your setup.</h1>
          <p>Affordable MX Bikes setups organized by OEM bike and track. Built for players who want a better starting point without paying premium prices for every track.</p>
          <div className="mxb-hero-actions"><a className="button" href="#setup-finder">Explore the setup finder <FaArrowRight aria-hidden="true"/></a><a className="mxb-text-link" href="#how-it-works">How it works</a></div>
        </div>
        <aside className="mxb-hero-info" aria-label="Planned setup prices">
          <span>THE PLAN / PRICING</span>
          <div><strong>$1</strong><p>Per bike, per track<small>Track-specific tuning</small></p></div>
          <div><strong>$2</strong><p>General MX or SX<small>Per supported OEM bike</small></p></div>
          <p className="mxb-mini-note">Coming soon. Preview prices only; setup files, purchases and downloads are not available yet.</p>
        </aside>
      </section>

      <div className="mxb-status" role="status"><FaBolt aria-hidden="true"/><span><strong>BUILD IN PROGRESS</strong> — No setups are for sale yet. We're preparing the catalog before uploading and validating the actual files.</span></div>

      <section className="mxb-finder" id="setup-finder" aria-labelledby="finder-heading">
        <div className="mxb-section-title"><div><span className="mxb-kicker">FIND YOUR LINE</span><h2 id="finder-heading">Setup finder</h2></div><p>Search planned categories and tracks. Verified bike listings will appear here after their files are tested.</p></div>
        <div className="mxb-controls">
          <label className="mxb-field"><span>Search</span><span className="mxb-search"><FaMagnifyingGlass aria-hidden="true"/><input type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Search tracks or OEM bikes"/></span></label>
          <label className="mxb-field"><span>Setup type</span><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">All setup types</option>{Object.entries(SETUP_TYPES).map(([id,type])=><option key={id} value={id}>{type.name}</option>)}</select></label>
          <label className="mxb-field"><span>Track</span><select value={track} onChange={e=>setTrack(e.target.value)}><option value="all">All tracks / General</option>{PLANNED_TRACKS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="mxb-field"><span>OEM bike</span><select value={bike} onChange={e=>setBike(e.target.value)}><option value="all">{publishedBikes.length ? 'All supported bikes' : 'Bikes awaiting upload'}</option>{publishedBikes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="mxb-results-heading"><h3>Available setups <span>({published.length})</span></h3><button type="button" onClick={reset}>Clear filters</button></div>
        {published.length ? <div className="mxb-card-grid">{published.map(item=><article className="mxb-card" key={item.id}><span className="mxb-card-eyebrow">{SETUP_TYPES[item.kind].name}</span><h4>{item.name}</h4><p>OEM {item.oemVersion} · MX Bikes {item.gameVersion}</p><div className="mxb-card-footer"><strong>{setupMoney(setupPriceCents(item.kind))}</strong><span>Checkout not enabled</span></div></article>)}</div> : <div className="mxb-empty"><FaShieldHalved aria-hidden="true"/><strong>No verified setups listed yet.</strong><p>Purchasing and downloads stay closed until each bike/track combination has an approved file and working delivery flow.</p></div>}
        <div className="mxb-results-heading mxb-planned-title"><h3>Planned catalog <span>({planned.length})</span></h3><span>Examples, not purchasable products</span></div>
        {planned.length ? <div className="mxb-card-grid">{planned.map(item=><article className="mxb-card mxb-preview" key={item.id}><span className="mxb-card-eyebrow">{SETUP_TYPES[item.kind].name}</span><h4>{item.kind === 'track' ? item.trackName : item.name}</h4><p>{item.kind === 'track' ? 'One setup per supported bike for this track' : 'Individual setup for each supported OEM bike'}</p><div className="mxb-card-footer"><strong>{setupMoney(setupPriceCents(item.kind))}</strong><span>Planned · Not available</span></div></article>)}</div> : <div className="mxb-empty"><p>No planned items match these filters.</p><button type="button" onClick={reset}>Show all plans</button></div>}
      </section>

      <section id="how-it-works" className="mxb-about" aria-labelledby="mxb-how-heading">
        <div className="mxb-section-title"><div><span className="mxb-kicker">NO GUESSWORK</span><h2 id="mxb-how-heading">How it'll work</h2></div></div>
        <div className="mxb-steps">
          <article><span>01</span><h3>Choose your bike</h3><p>Select your exact OEM motorcycle and verify the required MX Bikes and OEM pack versions before ordering.</p></article>
          <article><span>02</span><h3>Pick your track</h3><p>Choose a tuned $1 track setup, or an all-round $2 motocross or supercross baseline.</p></article>
          <article><span>03</span><h3>Download securely</h3><p>After digital fulfillment is built and verified, eligible paid setups will be available through private account access and order delivery.</p></article>
        </div>
      </section>
      <aside className="mxb-download-note"><FaDownload aria-hidden="true"/><div><h2>My Downloads is coming later</h2><p>We're building a private library for purchased setup files. There are no downloads or orders to access yet. No email signup or payment is being collected here.</p></div></aside>
    </div>
    <footer className="mxb-footer"><a href="/#garage">DualBore Media</a><span>Independent community-made setup plans. Not affiliated with MX Bikes or Project OEM.</span></footer>
  </main>;
}
