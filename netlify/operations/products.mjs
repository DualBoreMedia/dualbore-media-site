import {RECEIVED_SETUP_PREVIEWS,setupPriceCents} from '../../src/setups/catalog.js';
import {merch,previewSizes} from '../../src/content.js';
import approvedImagePaths from './product-images.json' with {type:'json'};
import {randomUUID} from 'node:crypto';
import {requireAdmin,requireFreshMfa} from './permissions.mjs';
import {CommerceError} from '../commerce/service.mjs';
import {canonicalBike,fileMatchesBike,setupIdentity,setupStage} from '../../src/setups/identity.js';

const fail=(message,code='invalid_product',status=400)=>{throw new CommerceError(code,message,status);};
const fields=['name','type','category','audience','sku','priceCents','description','images','fulfillment','sizes','bikeId','oemBike','bikeVersion','gameVersion','track','discipline','compatibility'];
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function productImage(value){return typeof value==='string'&&/^\/assets\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp)$/.test(value)&&!value.includes('..');}
export function validateProduct(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(k=>!fields.includes(k)))fail('Use only the product fields provided.');
 const p={};
 for(const key of fields){const value=input[key];if(value===undefined)continue;
  if(['images','sizes'].includes(key)){if(!Array.isArray(value)||value.length>12||value.some(v=>!text(v,200))||new Set(value).size!==value.length)fail('Review images and sizes.');p[key]=value.map(v=>v.trim());}
  else if(key==='priceCents'){if(value!==null&&(!Number.isSafeInteger(value)||value<1||value>1000000))fail('Use a USD price from $0.01 to $10,000.');p[key]=value;}
  else {if(!text(value,key==='description'?3000:120))fail('Review the product text.');p[key]=value.trim();}
 }
 if(!['physical','mx_setup'].includes(p.type))fail('Choose physical merchandise or MX Bikes setup.');
 if(p.sku&&!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(p.sku))fail('Use an uppercase SKU with letters, numbers, hyphens or underscores.');
 if(p.images?.some(v=>!productImage(v)))fail('Choose an existing local /assets JPG, PNG or WebP image. Private files and external URLs are not accepted.');
 if(p.sizes?.some(v=>!/^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/.test(v)))fail('Review the size labels.');
 if(p.fulfillment&&!['made_to_order','stocked','digital'].includes(p.fulfillment))fail('Choose a supported fulfillment method.');
 if(p.discipline&&!['MX','SX','track'].includes(p.discipline))fail('Choose MX, SX or a specific track.');
 if(p.compatibility&&!['unverified','testing','verified'].includes(p.compatibility))fail('Choose a compatibility review status.');
 if(p.bikeId){const bike=canonicalBike(p);if(!bike)fail('Choose a bike from the reference roster.');p.oemBike=bike.name;}
 if(p.discipline&&p.discipline!=='track'&&p.track)fail('General MX/SX setups must not have a track.');
 return p;
}
export function publicationIssues(p){
 const missing=['name','category','audience','sku','description','fulfillment'].filter(k=>!p[k]).map(k=>`Add ${k}.`);
 if(!Number.isSafeInteger(p.priceCents)||p.priceCents<1)missing.push('Add an approved USD price.');
 if(p.type==='physical'){
  if(!p.images?.length)missing.push('Add an approved product image.');
  if(p.images?.some(path=>!approvedImagePaths.includes(path)))missing.push('Product images must exist in the reviewed repository asset registry.');
  if(!p.sizes?.length)missing.push('Add approved size labels.');
  if(!['made_to_order','stocked'].includes(p.fulfillment))missing.push('Choose physical fulfillment.');
 }else{
  for(const k of ['oemBike','bikeVersion','gameVersion','discipline'])if(!p[k])missing.push(`Add ${k}.`);
  if(p.discipline==='track'&&!p.track)missing.push('Add the exact track.');
  if(p.compatibility!=='verified')missing.push('Compatibility testing is not verified.');
  // No private-file upload/delivery infrastructure is enabled by this manager.
  missing.push('Digital publication is blocked until actual files, private storage and authorized delivery are independently verified.');
 }
 return missing;
}
function unique(state,p,id){
 const identity=p.type==='mx_setup'&&setupIdentity(p);
 if(identity&&Object.values(state.products||{}).some(row=>row.id!==id&&row.status!=='archived'&&[row.draft,row.setupPreview].filter(Boolean).some(p=>setupIdentity(p)===identity)))fail('A draft already exists for this bike and setup type or track. Open the existing setup.','duplicate_setup',409);
 const skus=[p.sku,...(p.sizes||[]).map(size=>`${p.sku}-${size.toUpperCase().replaceAll(' ','-')}`)].filter(Boolean);
 if(new Set(skus).size!==skus.length)fail('Size labels generate duplicate SKUs.');
 const occupied=Object.values(state.products||{}).filter(x=>x.id!==id).flatMap(x=>[x.draft,x.published].filter(Boolean).flatMap(v=>[v.sku,...(v.sizes||[]).map(size=>`${v.sku}-${size.toUpperCase().replaceAll(' ','-')}`)]));
 if(skus.some(sku=>occupied.includes(sku)||Object.values(state.variants).some(v=>v.sku===sku&&(v.productId!==id||!p.sizes?.some(size=>size===v.size&&`${p.sku}-${size.toUpperCase().replaceAll(' ','-')}`===sku)))))fail('This SKU is already in use.','duplicate_sku',409);
}
export function publicProducts(state){return Object.values(state.products||{}).filter(p=>p.status==='published'&&p.published?.type==='physical').map(p=>({id:p.id,...Object.fromEntries(['name','type','category','audience','sku','priceCents','description','images','fulfillment','sizes'].map(k=>[k,p.published[k]]))}));}
export function publicSetupPreviews(state){return Object.values(state.products||{}).filter(p=>p.status!=='archived'&&p.setupPreview).map(p=>({id:p.id,...Object.fromEntries(['bikeId','name','description','discipline','track','bikeVersion','gameVersion','stage','priceCents'].map(k=>[k,p.setupPreview[k]]))}));}
export function createProductManager({repository,now=()=>new Date()}){
 const atTime=()=>now().toISOString();
 return {async mutate(principal,input){
  requireAdmin(principal);requireFreshMfa(principal);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','productId','expectedVersion','product','priceApproved'].includes(k))||!['product-save','product-publish','product-unpublish','product-archive','product-import','product-import-setups','product-preview-publish','product-preview-unpublish'].includes(input.action))fail('Choose a product action.');
  if(typeof principal.userId!=='string'||!principal.userId)fail('Sign in again.','unauthorized',401);
  return repository.transaction(s=>{
   s.products??={};let row;
   if(input.action==='product-import-setups'){
    for(const item of RECEIVED_SETUP_PREVIEWS){const id='setup-'+item.id;if(Object.hasOwn(s.products,id))continue;
     const identity=setupIdentity({oemBike:item.bikeName,discipline:item.kind==='track'?'track':item.kind==='general-sx'?'SX':'MX',track:item.trackName||''});
     if(Object.values(s.products).some(row=>row.status!=='archived'&&[row.draft,row.setupPreview].filter(Boolean).some(p=>setupIdentity(p)===identity)))continue;
     s.products[id]={id,status:'draft',version:0,draft:{type:'mx_setup',name:item.name,sku:'MXB-'+item.id.toUpperCase(),priceCents:setupPriceCents(item.kind),description:'Owner-supplied setup received. Compatibility testing and private delivery are not verified.',images:[],sizes:[],category:'MX Bikes setups',audience:'',fulfillment:'digital',oemBike:item.bikeName,bikeVersion:'',gameVersion:'',discipline:item.kind==='track'?'track':item.kind==='general-sx'?'SX':'MX',track:item.trackName||'',compatibility:'unverified'},createdAt:atTime(),updatedAt:atTime()};
    }
    const aid=randomUUID();s.audit[aid]={id:aid,actor:principal.userId,action:input.action,target:'setup-catalog',createdAt:atTime(),metadata:{}};return {saved:true};
   }
   if(input.action==='product-import'){
    for(const item of merch)if(!Object.hasOwn(s.products,item.id)){
     const prefix=Object.values(s.variants).find(v=>v.productId===item.id)?.sku.replace(/-(?:2XL|XL|L|M|S)$/,'')||'DBM-'+item.id.toUpperCase();
     s.products[item.id]={id:item.id,status:'draft',version:0,draft:{type:'physical',name:item.name,sku:prefix,priceCents:item.previewPrice*100,description:item.notes,images:[item.image],category:item.category||item.type,audience:'',fulfillment:'made_to_order',sizes:[...previewSizes]},createdAt:atTime(),updatedAt:atTime()};
    }
    const aid=randomUUID();s.audit[aid]={id:aid,actor:principal.userId,action:input.action,target:'catalog',createdAt:atTime(),metadata:{}};return {saved:true};
   }

   if(input.productId){if(typeof input.productId!=='string'||!Object.hasOwn(s.products,input.productId))fail('Product not found.','not_found',404);row=s.products[input.productId];if(input.expectedVersion!==row.version)fail('This product changed. Reload before saving.','stale_record',409);}
   else if(input.action!=='product-save')fail('Save a draft first.');
   const at=now().toISOString(),id=row?.id||randomUUID();
   if(input.action==='product-save'){
    if(row?.status==='archived')fail('Archived products cannot be edited.');
    const draft=validateProduct(input.product);unique(s,draft,id);
    if(row?.setupFile&&draft.type!=='mx_setup')fail('A setup with an attached file cannot become physical merchandise.','invalid_product',409);
    if(row?.setupFile&&canonicalBike(draft)&&!fileMatchesBike(row.setupFile.embeddedBikeId,canonicalBike(draft)))fail('The attached file belongs to another bike. Create a separate draft for the other bike.','bike_file_mismatch',409);
    row={...row,id,status:row?.status||'draft',version:(row?.version??-1)+1,draft,createdAt:row?.createdAt||at,updatedAt:at};s.products[id]=row;
   }else if(input.action.startsWith('product-preview-')){
    if(row.status==='archived'||row.draft.type!=='mx_setup')fail('Choose an active MX Bikes draft.');
    if(input.action==='product-preview-publish'){
     const p=row.draft,bike=canonicalBike(p);
     if(!bike||!setupIdentity(p)||!p.name||!p.description)fail('Save a bike, setup type, track when needed, name and description before sharing a preview.','publication_blocked',409);
     unique(s,p,id);
     row.setupPreview={bikeId:bike.id,name:p.name,description:p.description,discipline:p.discipline,track:p.discipline==='track'?p.track:'',bikeVersion:p.bikeVersion||'',gameVersion:p.gameVersion||'',stage:setupStage(row),priceCents:p.priceCents??null};
    }else delete row.setupPreview;
    row.version++;row.updatedAt=at;
   }else if(input.action==='product-publish'){
    if(row.status==='archived')fail('Archived products cannot be published.');
    const issues=publicationIssues(row.draft);if(issues.length)fail(issues.join(' '),'publication_blocked',409);
    if(input.priceApproved!==true)fail('Explicitly approve the saved price before publication.');
    unique(s,row.draft,id);row.published=structuredClone(row.draft);row.status='published';row.version++;row.updatedAt=at;row.approvedBy=principal.userId;
    // Preserve all stock, reservations, order snapshots and provider IDs. New
    // variants have zero stock and no payment mapping, so cannot accept sales.
    const wanted=new Set();
    for(const size of row.published.sizes){const sku=`${row.published.sku}-${size.toUpperCase().replaceAll(' ','-')}`;let v=Object.values(s.variants).find(v=>v.productId===id&&v.size===size);const vid=v?.id||randomUUID();wanted.add(vid);s.variants[vid]={...v,id:vid,productId:id,sku,name:row.published.name,size,active:true,priceCents:row.published.priceCents,productionPriceCents:row.published.priceCents,inventoryPolicy:row.published.fulfillment,availableQuantity:v?.availableQuantity||0,reservedQuantity:v?.reservedQuantity||0,soldQuantity:v?.soldQuantity||0,stripePriceId:v?.stripePriceId||null,version:(v?.version||0)+1};if(v&&v.productionPriceCents!==row.published.priceCents)delete s.variants[vid].liveStripePriceId;}
    for(const v of Object.values(s.variants))if(v.productId===id&&!wanted.has(v.id))v.active=false;
   }else{
    if(row.status==='archived')fail('Archived products cannot change status.');
    if(input.action==='product-unpublish'&&row.status!=='published')fail('Only published products can be unpublished.');
    row.status=input.action==='product-archive'?'archived':'draft';row.version++;row.updatedAt=at;
    for(const v of Object.values(s.variants))if(v.productId===id)v.active=false;
   }
   const auditId=randomUUID();s.audit[auditId]={id:auditId,actor:principal.userId,action:input.action,target:id,createdAt:at,metadata:{version:row.version,status:row.status,...input.action==='product-publish'?{priceCents:row.published.priceCents}:{}}};
   return {saved:true,product:row};
  });
 }};
}
