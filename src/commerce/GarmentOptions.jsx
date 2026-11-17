import {useState} from 'react';
import {describeGarmentPreview,optionsForArtwork} from './garment-plans.js';
import './garment-options.css';

export function GarmentOptions({item,compact=false}){
 const plans=optionsForArtwork(item);
 const [choice,setChoice]=useState(()=>plans.find(option=>option.category===item.category)?.id||'tee');
 if(!plans.length)return null;
 const selected=describeGarmentPreview(item,choice);
 return <section className={'garment-options'+(compact?' garment-options--compact':'')} aria-label={'Planned garments for '+item.name}>
  <p className="garment-options__heading">Same artwork · Planned garment options</p>
  <div className="garment-options__choices" role="group" aria-label={'Choose garment style for '+item.name}>
   {plans.map(option=><button type="button" key={option.id} aria-pressed={choice===option.id} onClick={()=>setChoice(option.id)}>{option.label}</button>)}
  </div>
  <p className="garment-options__status" role="status" aria-live="polite">
   <strong>{selected.label} · {selected.pictured?'$'+selected.price+' planned':'Price pending'}</strong> {selected.message}
  </p>
  <p className="garment-options__notice">Preview only. Not available to order.</p>
 </section>;
}
