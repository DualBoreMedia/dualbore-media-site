import {useState} from 'react';
import {filterShopProducts,shopAudiences,shopCategories,shopSorts} from './shop-discovery.js';
import './storefront.css';

export function useShopDiscovery(products,priceForProduct){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [audience,setAudience]=useState('all');
 const [sort,setSort]=useState('featured');
 const reset=()=>{setQuery('');setCategory('all');setAudience('all');setSort('featured');};
 const categories=[...shopCategories,...[...new Set(products.map(p=>p.category).filter(Boolean))].filter(id=>!shopCategories.some(o=>o.id===id)).map(id=>({id,label:id}))];
 const audiences=[...shopAudiences,...[...new Set(products.map(p=>p.audience).filter(v=>v&&v!=='unspecified'))].filter(id=>!shopAudiences.some(o=>o.id===id)).map(id=>({id,label:id}))];
 const results=filterShopProducts(products,{query,category,audience,sort},priceForProduct);
 const categoryCounts=Object.fromEntries(categories.map(option=>[option.id,filterShopProducts(products,{query,category:option.id,audience}).length]));
 const audienceCounts=Object.fromEntries(audiences.map(option=>[option.id,filterShopProducts(products,{query,category,audience:option.id}).length]));
 return {categories,audiences,query,setQuery,category,setCategory,audience,setAudience,sort,setSort,reset,results,total:products.length,categoryCounts,audienceCounts};
}
export function ShopFilters({shop}){
 const hasFilters=Boolean(shop.query.trim())||shop.category!=='all'||shop.audience!=='all'||shop.sort!=='featured';
 return <section className="shop-discovery" aria-label="Find garage merchandise">
  <div className="shop-discovery__heading"><div><span className="eyebrow">FIND YOUR GARAGE GEAR</span><h2>Explore the shop</h2></div><p aria-live="polite" aria-atomic="true" role="status">{shop.results.length} of {shop.total} designs</p></div>
  <form className="shop-discovery__fields" role="search" aria-label="Search and filter merchandise" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);shop.setQuery(String(form.get('query')||''));shop.setCategory(String(form.get('category')||'all'));shop.setAudience(String(form.get('audience')||'all'));shop.setSort(String(form.get('sort')||'featured'));}}>
   <label><span>Search products</span><input type="search" name="query" maxLength={100} value={shop.query} onInput={event=>shop.setQuery(event.currentTarget.value)} onChange={event=>shop.setQuery(event.currentTarget.value)} placeholder="E92, tee, SV1000S..." autoComplete="off" enterKeyHint="search"/></label>
   <label><span>Category</span><select aria-label="Category" name="category" value={shop.category} onChange={event=>shop.setCategory(event.currentTarget.value)}>{(shop.categories||shopCategories).map(option=><option key={option.id} value={option.id}>{option.label} ({shop.categoryCounts[option.id]}){shop.categoryCounts[option.id]===0?' · coming soon':''}</option>)}</select></label>
   <label><span>Gender / age</span><select aria-label="Gender / age" name="audience" value={shop.audience} onChange={event=>shop.setAudience(event.currentTarget.value)}>{(shop.audiences||shopAudiences).map(option=><option key={option.id} value={option.id}>{option.label} ({shop.audienceCounts[option.id]}){shop.audienceCounts[option.id]===0?' · not confirmed':''}</option>)}</select></label>
   <label><span>Sort by</span><select aria-label="Sort by" name="sort" value={shop.sort} onChange={event=>shop.setSort(event.currentTarget.value)}>{shopSorts.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <button type="submit" className="button shop-discovery__apply">Apply filters</button>
  </form>
  <div className="shop-discovery__foot"><p>Results update as you search or choose a filter. Prices shown are planned release prices. Fit details will be available before orders open.</p>{hasFilters&&<button type="button" className="text-link" onClick={shop.reset}>Clear shop filters</button>}</div>
 </section>;
}
export function ShopEmpty({shop}){
 return <div className="shop-discovery__empty" role="status"><h3>No matching products yet.</h3><p>Try a different category or search. New gear will only appear after its details are approved.</p><button type="button" className="button" onClick={shop.reset}>Show all merchandise</button></div>;
}
