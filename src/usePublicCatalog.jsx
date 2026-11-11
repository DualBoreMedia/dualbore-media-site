import {useEffect,useState} from 'react';
import {publicCatalogProducts} from './products.js';

export function usePublicCatalog(){
 const [state,setState]=useState({products:[],loading:true,error:''});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  setState({products:[],loading:true,error:''});
  fetch('/api/products',{signal:controller.signal,cache:'no-store'})
   .then(response=>{if(!response.ok)throw Error('Catalog unavailable.');return response.json();})
   .then(data=>{const products=publicCatalogProducts(data);if(!controller.signal.aborted)setState({products,loading:false,error:''});})
   .catch(()=>{if(!controller.signal.aborted)setState({products:[],loading:false,error:'Product previews are temporarily unavailable. Please try again.'});});
  return()=>controller.abort();
 },[attempt]);
 return {...state,retry:()=>setAttempt(value=>value+1)};
}

export function CatalogStatus({catalog}){
 if(catalog.loading)return <p role="status">Loading product previews...</p>;
 if(catalog.error)return <div role="status"><p>{catalog.error}</p><button type="button" className="button" onClick={catalog.retry}>Retry product previews</button></div>;
 return null;
}
