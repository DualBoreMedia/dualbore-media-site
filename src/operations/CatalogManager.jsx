import {rememberOperationsView} from './workos-session.js';
import {useState} from 'react';
import {Products} from './Products.jsx';
import {MxBikes} from './MxBikes.jsx';
export function CatalogManager({products,auth,reload,initialType='physical'}){
 const [type,setType]=useState(initialType);
 return <section aria-label="Unified catalog"><h2>Catalog</h2><label className="ops-field">Product type filter<select aria-label="Product type filter" value={type} onChange={e=>{setType(e.target.value);rememberOperationsView(e.target.value==='mx_setup'?'MX Bikes':'Catalog');}}><option value="physical">Merchandise</option><option value="mx_setup">MX Bikes setups</option></select></label>{type==='mx_setup'?<MxBikes products={products} auth={auth} reload={reload}/>:<Products products={products.filter(p=>p.draft.type==='physical')} auth={auth} reload={reload}/>}</section>;
}
