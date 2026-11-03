import {useId,useState} from 'react';
import {BIKE_PLACEHOLDERS,BIKE_ROSTER_SOURCE,BIKE_ROSTER_VERSION,filterBikePlaceholders} from './bike-roster.js';

const brands=[...new Set(BIKE_PLACEHOLDERS.map(bike=>bike.brand))];
export function BikeLibrary(){
 const [query,setQuery]=useState(''),[brand,setBrand]=useState('all');
 const results=filterBikePlaceholders({query,brand});
 const prefix=useId();
 return <section className="mxb-library" aria-labelledby={`${prefix}-title`}>
  <div className="mxb-section-title"><div><span className="mxb-kicker">THE NEXT SETUP STARTS HERE</span><h2 id={`${prefix}-title`}>Bike library</h2></div><p>A place for each bike. These empty slots are not completed setups or promises of compatibility.</p></div>
  <p className="mxb-roster-source">Reference: <a href={BIKE_ROSTER_SOURCE} target="_blank" rel="noopener noreferrer">{BIKE_ROSTER_VERSION} official roster</a>. Your installed pack and each future file still need verification. No files, purchases or downloads are available.</p>
  <div className="mxb-library-layout">
   <aside className="mxb-library-sidebar" aria-label="Bike library filters">
    <h3>Find your bike</h3>
    <label className="mxb-field">Search bikes<input type="search" maxLength={100} placeholder="Try TC125 or Honda" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label className="mxb-field">Manufacturer<select value={brand} onChange={e=>setBrand(e.target.value)}><option value="all">All manufacturers</option>{brands.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
    <button type="button" onClick={()=>{setQuery('');setBrand('all');}}>Reset bike filters</button>
    <p>Coming soon means no setup is ready. The library never adds stock or unlocks delivery.</p>
   </aside>
   <div className="mxb-library-results">
    <p role="status">{results.length} of {BIKE_PLACEHOLDERS.length} bike placeholders</p>
    {results.length?<div className="mxb-bike-grid">{results.map(bike=><article className="mxb-bike-placeholder" key={bike.id}>
     <span className="mxb-card-eyebrow">{bike.brand} / {bike.year}</span>
     <h3>{bike.name}</h3>
     <div className="mxb-blank-slot" aria-hidden="true"><span>SETUP SLOT</span><strong>COMING SOON</strong></div>
     <p>No setup available</p><span className="mxb-bike-status">Compatibility not verified</span>
    </article>)}</div>:<div className="mxb-empty"><strong>No bikes match these filters.</strong><p>Try another model name or reset the manufacturer filter.</p></div>}
   </div>
  </div>
 </section>;
}
