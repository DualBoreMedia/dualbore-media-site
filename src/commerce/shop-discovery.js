// Shop discovery is display-only. It never creates inventory, changes cart data or authorizes checkout.
export const shopCategories = Object.freeze([
  {id:'all',label:'All products'},
  {id:'apparel',label:'All apparel'},
  {id:'tees',label:'T-shirts'},
  {id:'crewnecks',label:'Crewnecks'},
  {id:'accessories',label:'Accessories'},
  {id:'stickers',label:'Stickers'},
]);
export const shopAudiences = Object.freeze([
  {id:'all',label:'All shoppers'},
  {id:'men',label:"Men's"},
  {id:'women',label:"Women's"},
  {id:'unisex',label:'Unisex'},
  {id:'kids',label:'Kids'},
]);
export const shopSorts = Object.freeze([
  {id:'featured',label:'Featured'},
  {id:'price-low',label:'Price: low to high'},
  {id:'price-high',label:'Price: high to low'},
  {id:'name',label:'Name: A to Z'},
]);
const normalized = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function filterShopProducts(products,{query='',category='all',audience='all',sort='featured'}={},priceForProduct=product=>product.previewPrice){
  if(!Array.isArray(products))return [];
  const terms=normalized(query).slice(0,100).split(/\s+/).filter(Boolean);
  const found=products.filter(product=>{
    if(category!=='all' && (category==='apparel'? !['tees','crewnecks'].includes(product.category):product.category!==category))return false;
    // No fit/gender/age category can be inferred from a photo or a generic size label.
    if(audience!=='all' && product.audience!==audience)return false;
    const keywords=product.category==='tees'?'t-shirt tshirt t shirt shirts tee tees'
      :product.category==='crewnecks'?'crewneck sweatshirt sweatshirts sweater pullover':'';
    const index=normalized([product.name,product.detail,product.type,product.notes,product.id,keywords].join(' '));
    return terms.every(term=>index.includes(term));
  });
  if(sort==='price-low'||sort==='price-high'){
    const direction=sort==='price-low'?1:-1;
    return found.sort((a,b)=>direction*(Number(priceForProduct(a))-Number(priceForProduct(b)))||a.name.localeCompare(b.name));
  }
  if(sort==='name')return found.sort((a,b)=>a.name.localeCompare(b.name));
  return found;
}
