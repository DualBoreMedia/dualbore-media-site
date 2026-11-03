import {useEffect,useState} from 'react';
import {addItem,restoreCart,storageKey,validateReplacement} from './cart.js';
import {fixtureById,fixtureCart,checkAvailability} from './fixtures.js';

export const testCommerceEnabled=import.meta.env.MODE==='commerce'&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
const scenarioKey='dbm-test-scenario-v1';
const savedItems=()=>{try{return restoreCart(localStorage.getItem(storageKey));}catch{return [];}};
const savedScenario=()=>{try{const id=localStorage.getItem(scenarioKey);return fixtureById(id)?id:'in-stock';}catch{return 'in-stock';}};
export function useTestCart(){
  const [items,setItems]=useState(()=>testCommerceEnabled?savedItems():[]);
  const [scenario,setScenario]=useState(()=>testCommerceEnabled?savedScenario():'in-stock');
  const [storageWarning,setStorageWarning]=useState('');
  useEffect(()=>{if(!testCommerceEnabled)return;try{localStorage.setItem(storageKey,JSON.stringify({version:1,items}));localStorage.setItem(scenarioKey,scenario);}catch{setStorageWarning('Your browser cannot save this cart. Keep this page open while testing.');}},[items,scenario]);
  return {items,scenario,storageWarning,count:items.reduce((sum,item)=>sum+item.quantity,0),
    add:(id,quantity)=>{const next=addItem(items,id,quantity);checkAvailability(next,scenario);setItems(next);},
    replace:next=>setItems(validateReplacement(next)),
    loadFixture:id=>{if(!fixtureById(id))return;setScenario(id);setItems(fixtureCart(id));},
  };
}
