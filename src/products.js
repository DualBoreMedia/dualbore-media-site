import {merch} from './content.js';

export function listingProduct(p){return {...p,detail:p.description,notes:p.description,type:p.category,image:p.images[0],previewPrice:p.priceCents/100,managed:true,testVariantsEnabled:false};}

// A fresh successful response is the authority for legacy suppression as well as
// managed snapshots. Never reconstruct this list from an error or stale storage.
export function publicCatalogProducts(data){
 if(!data||!Array.isArray(data.products)||!Array.isArray(data.hiddenProductIds)||data.products.length>1000||data.hiddenProductIds.length>1000)throw Error('Invalid public catalog.');
 const ids=new Set();
 const text=value=>typeof value==='string'&&value.length>0&&value.length<=3000;
 for(const product of data.products){
  if(!product||!text(product.id)||ids.has(product.id)||product.type!=='physical'||!text(product.name)||!text(product.description)||!text(product.category)||!text(product.audience)||!text(product.sku)||!Number.isSafeInteger(product.priceCents)||product.priceCents<1||!Array.isArray(product.images)||!product.images.length||product.images.length>12||product.images.some(image=>typeof image!=='string'||!/^\/assets\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/.test(image)||image.includes('..'))||!Array.isArray(product.sizes)||!product.sizes.length||product.sizes.some(size=>!text(size)))throw Error('Invalid public product.');
  ids.add(product.id);
 }
 if(data.hiddenProductIds.some(id=>!text(id)||ids.has(id)))throw Error('Invalid hidden product list.');
 return [...merch.filter(product=>!data.hiddenProductIds.includes(product.id)&&!ids.has(product.id)),...data.products.map(listingProduct)];
}
