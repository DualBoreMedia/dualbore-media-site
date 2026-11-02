import {shopCategories,shopAudiences} from './shop-discovery.js';
const categories=new Set(shopCategories.map(x=>x.id).filter(id=>!['all','apparel'].includes(id)));
const audiences=new Set([...shopAudiences.map(x=>x.id).filter(id=>id!=='all'),'unspecified']);
const txt=(v,max=500)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const apparel=c=>['tees','crewnecks'].includes(c);
// Draft metadata must always be classified; verified product facts are required to sell.
export function productListingIssues(p,{phase='preview'}={}){
 const issues=[];if(!p||typeof p!=='object'||Array.isArray(p))return ['Product must be an object.'];
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id||''))issues.push('id: stable hyphenated ID required.');
 for(const key of ['name','detail','type','notes'])if(!txt(p[key],key==='notes'?1500:200))issues.push(key+': accurate text required.');
 if(!/^\/assets\/[A-Za-z0-9_-]+\.jpg$/.test(p.image||''))issues.push('image: approved local JPG plus 480/768px copies required.');
 if(!categories.has(p.category))issues.push('category: choose a specific product category.');
 if(!audiences.has(p.audience))issues.push('audience: men/women/unisex/kids/unspecified required.');
 if(!Number.isSafeInteger(p.previewPrice)||p.previewPrice<1)issues.push('previewPrice: approved positive whole-dollar amount required.');
 if(!['preview','published'].includes(p.listingStatus))issues.push('listingStatus: preview or published required.');
 if(typeof p.testVariantsEnabled!=='boolean')issues.push('testVariantsEnabled: explicit true/false required.');
 if(p.testVariantsEnabled&&(!apparel(p.category)||!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(p.skuRoot||'')))issues.push('skuRoot: explicit test apparel SKU required.');
 if(phase==='publish'||p.listingStatus==='published'){
  if(p.listingStatus!=='published')issues.push('listingStatus: owner-approved published state required.');
  if(p.audience==='unspecified')issues.push('audience: confirmed target fit required.');
  for(const k of ['ownerApproved','artworkRightsVerified','imagesVerified','fulfillmentVerified','shippingProfileVerified'])if(p[k]!==true)issues.push(k+': verification required.');
  if(!Number.isSafeInteger(p.salePriceCents)||p.salePriceCents<1)issues.push('salePriceCents: trusted approved price required.');
  if(apparel(p.category)){
   if(!Array.isArray(p.sizes)||!p.sizes.length||p.sizes.length>20||new Set(p.sizes).size!==p.sizes.length||p.sizes.some(s=>!txt(s,24)))issues.push('sizes: confirmed unique sizes required.');
   for(const k of ['sizeGuideVerified','garmentLabelVerified','careInstructionsVerified'])if(p[k]!==true)issues.push(k+': apparel verification required.');
  }
  if(p.audience==='kids'){if(!txt(p.ageRange,80))issues.push('ageRange: confirmed kids range required.');if(p.childProductComplianceVerified!==true)issues.push('childProductComplianceVerified: verified compliance required.');}
  if(p.category==='stickers'){if(!p.dimensionsMm||!Number.isFinite(p.dimensionsMm.width)||p.dimensionsMm.width<=0||!Number.isFinite(p.dimensionsMm.height)||p.dimensionsMm.height<=0)issues.push('dimensionsMm: confirmed dimensions required.');if(!txt(p.material,120))issues.push('material: confirmed sticker material required.');}
  if(p.category==='accessories'&&!txt(p.specifications,500))issues.push('specifications: confirmed accessory details required.');
 }
 return issues;
}
export function validateProductListings(items,{phase='preview'}={}){
 if(!Array.isArray(items))throw Error('Product listing catalog must be an array.');
 const errors=[],ids=new Set(),skus=new Set();
 for(const [index,item] of items.entries()){
  const id=item?.id||'#'+(index+1);
  for(const issue of productListingIssues(item,{phase}))errors.push(id+': '+issue);
  if(ids.has(id))errors.push(id+': duplicate ID.');ids.add(id);
  if(item?.testVariantsEnabled){if(skus.has(item.skuRoot))errors.push(id+': duplicate test SKU.');skus.add(item.skuRoot);}
 }
 if(errors.length)throw Error('Product listing validation failed:\n'+errors.join('\n'));
 return items;
}
export const productIsSaleReady=p=>productListingIssues(p,{phase:'publish'}).length===0;

// A released apparel product is sellable only for an approved size and exact approved price.
// Other categories need their own variant/fulfillment implementation, not a fake S-2XL SKU.
export function productionVariantIsApproved(variant,products){
 const p=products.find(item=>item.id===variant?.productId);
 return Boolean(p&&productIsSaleReady(p)&&apparel(p.category)
  &&p.sizes.includes(variant.size)
  &&variant.productionPriceCents===p.salePriceCents);
}
