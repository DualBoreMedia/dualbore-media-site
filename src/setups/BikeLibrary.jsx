import {useId,useState} from 'react';
import {BIKE_PLACEHOLDERS,BIKE_ROSTER_SOURCE,BIKE_ROSTER_VERSION,filterBikePlaceholders} from './bike-roster.js';
import {PLANNED_TRACKS, RECEIVED_SETUP_PREVIEWS} from './catalog.js';

const brands=[...new Set(BIKE_PLACEHOLDERS.map(bike=>bike.brand))];
const familyOf = bike => bike.model.split(/\s+\d/, 1)[0];
const modelOrder = new Intl.Collator('en', {numeric: true});
function groupBikes(bikes, keyFor) {
  const groups = new Map();
  for (const bike of bikes) {
    const key = keyFor(bike);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bike);
  }
  return groups;
}

function BikeTracks({bike}) {
  const previews = RECEIVED_SETUP_PREVIEWS.filter(setup => setup.bikeName === bike.name);
  return <details className="mxb-bike-tracks">
    <summary>Track setups</summary>
    <ul>
      {[...PLANNED_TRACKS].sort((a,b)=>modelOrder.compare(a.name,b.name)).map(track =>
        <li key={track.id}><strong>{track.name}</strong><span>{previews.some(setup=>setup.trackId===track.id) ? 'Sample received · testing pending' : 'No verified setup'}</span></li>)}
      {previews.filter(setup=>!setup.trackId).map(setup =>
        <li key={setup.id}><strong>General Supercross</strong><span>Sample received · testing pending</span></li>)}
    </ul>
  </details>;
}

export function BikeLibrary(){
 const [query,setQuery]=useState(''),[brand,setBrand]=useState('all');
 const [family,setFamily]=useState('all');
 const families = [...new Set(BIKE_PLACEHOLDERS.filter(bike=>brand==='all'||bike.brand===brand).map(familyOf))].sort(modelOrder.compare);
 const results=filterBikePlaceholders({query,brand});
 const visible = results.filter(bike=>family==='all'||familyOf(bike)===family)
   .sort((a,b)=>modelOrder.compare(a.model,b.model)||b.year-a.year);
 const grouped = groupBikes(visible, bike=>bike.brand);
 const prefix=useId();
 return <section className="mxb-library" aria-labelledby={`${prefix}-title`}>
  <div className="mxb-section-title"><div><span className="mxb-kicker">THE NEXT SETUP STARTS HERE</span><h2 id={`${prefix}-title`}>Bike library</h2></div><p>A place for each bike. These empty slots are not completed setups or promises of compatibility.</p></div>
  <p className="mxb-roster-source">Reference: <a href={BIKE_ROSTER_SOURCE} target="_blank" rel="noopener noreferrer">{BIKE_ROSTER_VERSION} official roster</a>. Your installed pack and each future file still need verification. No files, purchases or downloads are available.</p>
  <div className="mxb-library-layout">
   <aside className="mxb-library-sidebar" aria-label="Bike library filters">
    <h3>Find your bike</h3>
    <label className="mxb-field">Search bikes<input type="search" maxLength={100} placeholder="Try TC125 or Honda" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label className="mxb-field">Manufacturer<select value={brand} onChange={e=>{setBrand(e.target.value);setFamily('all');}}><option value="all">All manufacturers</option>{brands.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    <label className="mxb-field">Model family<select value={family} onChange={e=>setFamily(e.target.value)}><option value="all">All model families</option>{families.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    <button type="button" onClick={()=>{setQuery('');setBrand('all');setFamily('all');}}>Reset bike filters</button>
    <p>Coming soon means no setup is ready. The library never adds stock or unlocks delivery.</p>
   </aside>
   <div className="mxb-library-results">
    <p role="status">{visible.length} of {BIKE_PLACEHOLDERS.length} bike placeholders</p>
    {visible.length?[...grouped.keys()].sort(modelOrder.compare).map(make=><section className="mxb-bike-group" key={make}>
     <h3>{make}</h3>
     {[...groupBikes(grouped.get(make),familyOf)].map(([modelFamily,bikes])=><section key={modelFamily}>
      <h4>{modelFamily} family</h4>
      <div className="mxb-bike-grid">{bikes.map(bike=><article className="mxb-bike-placeholder" key={bike.id}>
     <span className="mxb-card-eyebrow">{bike.brand} / {bike.year}</span>
     <h5>{bike.name}</h5>
     <p>No setup available</p><span className="mxb-bike-status">Compatibility not verified</span>
     <BikeTracks bike={bike}/>
    </article>)}</div></section>)}
    </section>):<div className="mxb-empty"><strong>No bikes match these filters.</strong><p>Try another model name or reset the filters.</p></div>}
   </div>
  </div>
 </section>;
}
