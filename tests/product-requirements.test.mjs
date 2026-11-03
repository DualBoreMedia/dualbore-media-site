import test from 'node:test';import assert from 'node:assert/strict';
import {merch} from '../src/content.js';
import {validateProductListings,productListingIssues,productIsSaleReady,productionVariantIsApproved} from '../src/commerce/product-requirements.js';
import {variants} from '../src/commerce/catalog.js';
const draft={id:'draft-item',name:'Example',detail:'Description',type:'Tee',notes:'Design detail',image:'/assets/IMG_5076.jpg',category:'tees',audience:'unspecified',listingStatus:'preview',previewPrice:30,testVariantsEnabled:false};
const ready={...draft,listingStatus:'published',audience:'unisex',salePriceCents:3000,ownerApproved:true,artworkRightsVerified:true,imagesVerified:true,fulfillmentVerified:true,shippingProfileVerified:true,sizes:['S','M'],sizeGuideVerified:true,garmentLabelVerified:true,careInstructionsVerified:true};
test('existing listings stay previews; only 15 explicit test variants exist',()=>{assert.equal(validateProductListings(merch).length,3);assert.equal(variants.length,15);assert.ok(merch.every(p=>!productIsSaleReady(p)));});
test('new items require valid filter fields and do not silently become test products',()=>{
 for(const key of ['id','name','detail','type','notes','image','category','audience','listingStatus','previewPrice','testVariantsEnabled']){const p={...draft};delete p[key];assert.throws(()=>validateProductListings([p]),/Product listing validation failed/,key);}
 assert.throws(()=>validateProductListings([draft,draft]),/duplicate ID/);
 assert.throws(()=>validateProductListings([{...draft,testVariantsEnabled:true}]),/skuRoot/);
 assert.ok(productListingIssues({...draft,category:'apparel'}).some(s=>s.includes('category')));
});
test('publication requires evidence and type-specific facts',()=>{
 assert.ok(productIsSaleReady(ready));
 for(const key of ['ownerApproved','artworkRightsVerified','imagesVerified','fulfillmentVerified','shippingProfileVerified','salePriceCents','sizes','sizeGuideVerified','garmentLabelVerified','careInstructionsVerified']){const p={...ready};delete p[key];assert.ok(!productIsSaleReady(p),key);}
 assert.ok(!productIsSaleReady({...ready,audience:'unspecified'}));
 assert.ok(!productIsSaleReady({...ready,sizes:['S','S']}));
 const kid={...ready,audience:'kids'};assert.ok(!productIsSaleReady(kid));assert.ok(productIsSaleReady({...kid,ageRange:'Verified age range',childProductComplianceVerified:true}));
 const sticker={...ready,category:'stickers'};assert.ok(!productIsSaleReady(sticker));assert.ok(productIsSaleReady({...sticker,dimensionsMm:{width:70,height:40},material:'Verified sticker material'}));
 const accessory={...ready,category:'accessories'};assert.ok(!productIsSaleReady(accessory));assert.ok(productIsSaleReady({...accessory,specifications:'Approved physical specifications'}));
});

test('production variant must match its approved apparel size and exact price',()=>{
 const p={...ready};
 assert.equal(productionVariantIsApproved({productId:p.id,size:'M',productionPriceCents:3000},[p]),true);
 assert.equal(productionVariantIsApproved({productId:p.id,size:'XL',productionPriceCents:3000},[p]),false);
 assert.equal(productionVariantIsApproved({productId:p.id,size:'M',productionPriceCents:1},[p]),false);
 assert.equal(productionVariantIsApproved({productId:p.id,size:'M',productionPriceCents:3000},[draft]),false);
 assert.equal(productionVariantIsApproved({productId:p.id,size:'M',productionPriceCents:3000},[{...p,category:'stickers',material:'Verified',dimensionsMm:{width:10,height:20}}]),false);
});
