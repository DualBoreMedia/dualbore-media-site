import {useState} from 'react';
import {BIKE_PLACEHOLDERS,BIKE_ROSTER_VERSION,filterBikePlaceholders} from '../setups/bike-roster.js';
import {canonicalBike,setupStage} from '../setups/identity.js';
import {operationsRequest,date} from './client.js';
import {SetupFile} from './SetupFile.jsx';
import './products.css';
const brands=[...new Set(BIKE_PLACEHOLDERS.map(b=>b.brand))];
const blank={type:'mx_setup',name:'',sku:'',category:'MX Bikes setups',audience:'',priceCents:200,description:'',images:[],sizes:[],fulfillment:'digital',bikeId:'',oemBike:'',bikeVersion:'',gameVersion:'',discipline:'MX',track:'',compatibility:'unverified'};
export function MxBikes({products=[],auth={},reload}){
 const [record,setRecord]=useState(null),[draft,setDraft]=useState(null),[brand,setBrand]=useState('all'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const rows=products.filter(p=>p.draft.type==='mx_setup'),bikes=filterBikePlaceholders({brand,query});
 const open=row=>{setRecord(row);const bike=row&&canonicalBike(row.draft);setDraft({...blank,...row?.draft,...bike?{bikeId:bike.id,oemBike:bike.name}:{}});setError('');setNotice('');};
 const baseline=record?{...blank,...record.draft,...canonicalBike(record.draft)?{bikeId:canonicalBike(record.draft).id,oemBike:canonicalBike(record.draft).name}:{}}:blank;
 const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(baseline);
 const leave=row=>{if(!dirty||window.confirm('Discard unsaved setup edits?'))open(row);};
 const change=(key,value)=>setDraft(p=>({...p,[key]:value}));
 const act=async action=>{setBusy(true);setError('');setNotice('');try{
  const result=await operationsRequest(auth.getToken,{action,...record?{productId:record.id,expectedVersion:record.version}:{},...action==='product-save'?{product:draft}:{}},{fetcher:auth.fetcher});
  if(result.product)open(result.product);await reload();setNotice({'product-preview-publish':'Public preview approved. Sales, downloads and sending stay closed.','product-preview-unpublish':'Public preview removed.','product-archive':'Setup archived. Its public preview is hidden.','product-import-setups':'Received setup drafts are ready. Existing records were preserved.'}[action]||'Setup draft saved.');
 }catch(e){setError(e.message);}finally{setBusy(false);}};
 return <section className="ops-products" aria-label="MX Bikes manager">
<header className="ops-panel ops-product-heading">
<div>
<span className="ops-muted">BIKE / SETUP / PRIVATE FILE</span>
<h2>MX Bikes</h2>
<p>Choose the bike, prepare a setup, then review its public preview.</p>
<small>Reference roster: {BIKE_ROSTER_VERSION}. In-game testing is separate.</small>
</div>
<button disabled={busy} className="ops-primary" onClick={()=>leave(null)}>Create setup draft</button>
</header>
<p role="status" className="ops-product-notice">{notice}</p>{error&&<p role="alert" className="ops-message ops-error">{error}</p>}<div className="ops-product-layout">
<section className="ops-panel ops-product-catalog">
<h3>Setup drafts ({rows.length})</h3>
<button disabled={busy} onClick={()=>act('product-import-setups')}>Import received TC125 drafts</button>
{!rows.length&&<p className="ops-muted">No setup drafts yet. Start with an exact motorcycle.</p>}
<ul className="ops-product-list">{rows.map(row=>
<li key={row.id}>
<button disabled={busy} aria-pressed={row.id===record?.id} onClick={()=>leave(row)}>
<strong>{row.draft.name||'Untitled setup'}</strong>
<span>{setupStage(row)} / {row.status}</span>
<small>Updated {date(row.updatedAt)}</small>
</button>
</li>)}</ul>
</section>
<section className="ops-panel ops-product-editor">{!draft?<>
<h3>Choose a bike, then a setup.</h3>
<p>Create a draft or open an existing record. The three original TC125 samples stay separate and untested.</p>
</>:<>
<div className="ops-detail-title">
<h3>{record?'Edit setup':'New setup draft'}</h3>
<span className="ops-status">{record?setupStage(record):'Draft'}</span>
</div>
<div className="ops-editor-status" role="status" aria-label="Setup editing status" data-dirty={dirty}>
<strong>{busy?'Saving or updating...':dirty?'Unsaved changes':record?'Saved draft':'Not saved yet'}</strong>
<span>{record?.setupPreview&&record.status!=='archived'?'Public preview visible: saved snapshot':'Public preview hidden'}</span>
</div>
<p className="ops-muted">Sales and delivery not approved.</p>
<fieldset disabled={busy||record?.status==='archived'} className="ops-product-fields">
<legend>Setup details</legend>
<h4>1. Manufacturer and exact bike</h4>
<div className="ops-form-grid">
<label className="ops-field">Manufacturer<select aria-label="Manufacturer" value={brand} onChange={e=>setBrand(e.target.value)}>
<option value="all">All manufacturers</option>{brands.map(b=>
<option key={b}>{b}</option>)}</select>
</label>
<label className="ops-field">Search bikes<input type="search" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="Try TC125 or YZF"/>
</label>
<label className="ops-field ops-field-wide">Exact bike<select aria-label="Exact bike" value={draft.bikeId} onChange={e=>{const bike=BIKE_PLACEHOLDERS.find(b=>b.id===e.target.value);setDraft(p=>({...p,bikeId:bike?.id||'',oemBike:bike?.name||''}));}}>
<option value="">Choose a reference bike</option>{[...new Map([...bikes,...BIKE_PLACEHOLDERS.filter(b=>b.id===draft.bikeId)].map(b=>[b.id,b])).values()].map(b=>
<option key={b.id} value={b.id}>{b.name}</option>)}</select>
</label>
</div>
<h4>2. Setup type and track</h4>
<div className="ops-form-grid">
<label className="ops-field">Setup type<select aria-label="Setup type" value={draft.discipline} onChange={e=>setDraft(p=>({...p,discipline:e.target.value,track:'',priceCents:e.target.value==='track'?100:200}))}>
<option value="MX">General Motocross ($2 proposed)</option>
<option value="SX">General Supercross ($2 proposed)</option>
<option value="track">Track specific ($1 proposed)</option>
</select>
</label>{draft.discipline==='track'&&<label className="ops-field">Exact track<input value={draft.track} maxLength={120} onChange={e=>change('track',e.target.value)}/>
</label>}</div>
<h4>3. Metadata and testing</h4>
<div className="ops-form-grid">{[['name','Setup name'],['sku','Setup SKU'],['bikeVersion','Tested OEM pack version'],['gameVersion','Tested MX Bikes version']].map(([key,title])=>
<label className="ops-field" key={key}>{title}<input value={draft[key]} maxLength={120} onChange={e=>change(key,e.target.value)}/>
</label>)}<label className="ops-field">Testing status<select aria-label="Testing status" value={draft.compatibility} onChange={e=>change('compatibility',e.target.value)}>
<option value="unverified">Unverified</option>
<option value="testing">Testing</option>
<option value="verified">Owner verified in game</option>
</select>
</label>
</div>
<label className="ops-field">Description<textarea value={draft.description} maxLength={3000} onChange={e=>change('description',e.target.value)}/>
</label>
<p>Record only versions and results you checked. The reference roster is not compatibility proof.</p>
</fieldset>
<div className="ops-actions ops-editor-actions">
<button className="ops-primary" disabled={busy||record?.status==='archived'} onClick={()=>act('product-save')}>Save setup draft</button>{dirty&&<span className="ops-muted">Save before attaching a file or approving a preview.</span>}</div>
<SetupFile key={record?.id||'new'} record={record} dirty={dirty} busy={busy} auth={auth} onBusyChange={setBusy} onSaved={async row=>{open(row);await reload();}}/>{record?.setupFileHistory?.length>0&&<details className="ops-file-history">
<summary>Previous private file versions ({record.setupFileHistory.length})</summary>
<ul>{record.setupFileHistory.map(file=>
<li key={file.version} className="ops-wrap">Version {file.version}: {file.filename}<br/>
<code>{file.sha256}</code>
</li>)}</ul>
</details>}<fieldset className="ops-product-publish" disabled={busy||dirty||!record||record.status==='archived'}>
<legend>Public preview only</legend>
<p>A preview shares saved metadata, never file identifiers or downloads. Edits stay private until you approve again. Payments and delivery need a separate release.</p>
<div className="ops-actions">
<button onClick={()=>act('product-preview-publish')}>Approve public preview</button>
<button disabled={!record?.setupPreview} onClick={()=>act('product-preview-unpublish')}>Hide public preview</button>
<button className="ops-danger" onClick={()=>{if(window.confirm('Archive this setup and hide its preview?'))act('product-archive');}}>Archive setup</button>
</div>
</fieldset>
</>}</section>
</div>
</section>;
}
