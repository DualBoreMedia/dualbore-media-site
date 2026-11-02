import {useState} from 'react';
import {filterShopProducts,shopAudiences,shopCategories,shopSorts} from './shop-discovery.js';
import './storefront.css';

export function useShopDiscovery(products,priceForProduct){
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [audience,setAudience]=useState('all');
 const [sort,setSort]=useState('featured');
 const reset=()=>{setQuery('');setCategory('all');setAudience('all');setSort('featured');};
 const results=filterShopProducts(products,{query,category,audience,sort},priceForProduct);
 const categoryCounts=Object.fromEntries(shopCategories.map(option=>[option.id,filterShopProducts(products,{query,category:option.id,audience}).length]));
 const audienceCounts=Object.fromEntries(shopAudiences.map(option=>[option.id,filterShopProducts(products,{query,category,audience:option.id}).length]));
 return {query,setQuery,category,setCategory,audience,setAudience,sort,setSort,reset,results,total:products.length,categoryCounts,audienceCounts};
}
export function ShopFilters({shop}){
 const hasFilters=Boolean(shop.query.trim())||shop.category!=='all'||shop.audience!=='all'||shop.sort!=='featured';
 return <section className="shop-discovery" aria-label="Find garage merchandise">
  <div className="shop-discovery__heading"><div><span className="eyebrow">FIND YOUR GARAGE GEAR</span><h2>Explore the shop</h2></div><p aria-live="polite" aria-atomic="true" role="status">{shop.results.length} of {shop.total} designs</p></div>
  <form className="shop-discovery__fields" role="search" aria-label="Search and filter merchandise" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);shop.setQuery(String(form.get('query')||''));shop.setCategory(String(form.get('category')||'all'));shop.setAudience(String(form.get('audience')||'all'));shop.setSort(String(form.get('sort')||'featured'));}}>
   <label><span>Search products</span><input type="search" name="query" maxLength={100} value={shop.query} onInput={event=>shop.setQuery(event.currentTarget.value)} onChange={event=>shop.setQuery(event.currentTarget.value)} placeholder="E92, tee, SV1000S..." autoComplete="off" enterKeyHint="search"/></label>
   <label><span>Category</span><select name="category" value={shop.category} onChange={event=>shop.setCategory(event.currentTarget.value)}>{shopCategories.map(option=><option key={option.id} value={option.id}>{option.label} ({shop.categoryCounts[option.id]}){shop.categoryCounts[option.id]===0?' · coming soon':''}</option>)}</select></label>
   <label><span>Gender / age</span><select name="audience" value={shop.audience} onChange={event=>shop.setAudience(event.currentTarget.value)}>{shopAudiences.map(option=><option key={option.id} value={option.id}>{option.label} ({shop.audienceCounts[option.id]}){shop.audienceCounts[option.id]===0?' · not confirmed':''}</option>)}</select></label>
   <label><span>Sort by</span><select name="sort" value={shop.sort} onChange={event=>shop.setSort(event.currentTarget.value)}>{shopSorts.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <button type="submit" className="button shop-discovery__apply">Apply filters</button>
  </form>
  <div className="shop-discovery__foot"><p>Results update as you type or select a filter. Search also works with Enter or Apply filters. Prices sort by planned release price; local test-checkout prices may differ. Gender-specific, unisex and kids' fits are unconfirmed. Accessories and stickers are coming soon.</p>{hasFilters&&<button type="button" className="text-link" onClick={shop.reset}>Clear shop filters</button>}</div>
 </section>;
}
export function ShopEmpty({shop}){
 return <div className="shop-discovery__empty" role="status"><h3>No matching products yet.</h3><p>Try a different category or search. New gear will only appear after its details are approved.</p><button type="button" className="button" onClick={shop.reset}>Show all merchandise</button></div>;
}
