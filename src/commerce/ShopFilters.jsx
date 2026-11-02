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
 return {query,setQuery,category,setCategory,audience,setAudience,sort,setSort,reset,results,total:products.length};
}
export function ShopFilters({shop}){
 const hasFilters=Boolean(shop.query.trim())||shop.category!=='all'||shop.audience!=='all'||shop.sort!=='featured';
 return <section className="shop-discovery" aria-label="Find garage merchandise">
  <div className="shop-discovery__heading"><div><span className="eyebrow">FIND YOUR GARAGE GEAR</span><h2>Explore the shop</h2></div><p aria-live="polite" aria-atomic="true">{shop.results.length} of {shop.total} designs</p></div>
  <div className="shop-discovery__fields" role="search" aria-label="Search and filter merchandise">
   <label><span>Search products</span><input type="search" maxLength={100} value={shop.query} onChange={event=>shop.setQuery(event.target.value)} placeholder="E92, tee, SV1000S..." autoComplete="off"/></label>
   <label><span>Category</span><select value={shop.category} onChange={event=>shop.setCategory(event.target.value)}>{shopCategories.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <label><span>Gender / age</span><select value={shop.audience} onChange={event=>shop.setAudience(event.target.value)}>{shopAudiences.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
   <label><span>Sort by</span><select value={shop.sort} onChange={event=>shop.setSort(event.target.value)}>{shopSorts.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
  </div>
  <div className="shop-discovery__foot"><p>Gender-specific, unisex and kids' fits have not been confirmed. Accessories and stickers have no approved listings yet.</p>{hasFilters&&<button type="button" className="text-link" onClick={shop.reset}>Clear shop filters</button>}</div>
 </section>;
}
export function ShopEmpty({shop}){
 return <div className="shop-discovery__empty" role="status"><h3>No matching products yet.</h3><p>Try a different category or search. New gear will only appear after its details are approved.</p><button type="button" className="button" onClick={shop.reset}>Show all merchandise</button></div>;
}
