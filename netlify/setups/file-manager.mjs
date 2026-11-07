import {randomUUID} from 'node:crypto';
import {requireAdmin,requireFreshMfa} from '../operations/permissions.mjs';
import {CommerceError} from '../commerce/service.mjs';
import {inspectSetupUpload} from './private-assets.mjs';
import {canonicalBike,fileMatchesBike} from '../../src/setups/identity.js';

const fail=(code,message,status=400)=>{throw new CommerceError(code,message,status);};
function product(state,id){
 if(typeof id!=='string'||!Object.hasOwn(state.products,id)||state.products[id].draft.type!=='mx_setup')fail('setup_not_found','Setup draft not found.',404);
 return state.products[id];
}
export function createSetupFileManager({repository,now=()=>new Date()}){
 return {
  async read(principal,productId){
   requireAdmin(principal);
   return repository.transaction(state=>({file:product(state,productId).setupFile||null}));
  },
  async attach(principal,{productId,expectedVersion,filename,bytes}={}){
   requireAdmin(principal);requireFreshMfa(principal);
   if(typeof principal.userId!=='string'||!principal.userId)fail('sign_in_required','Sign in again.',401);
   if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)fail('invalid_version','Reload the saved draft before uploading.');
   try{inspectSetupUpload(bytes,filename);}catch{fail('invalid_setup_file','Choose a supported .stp file, no larger than 2 MB, with a simple filename.');}
   return repository.transaction(async(state,assets)=>{
    const row=product(state,productId);
    if(row.version!==expectedVersion)fail('stale_record','This product changed. Reload before uploading.',409);
    if(row.status==='archived')fail('archived_product','Archived products cannot receive new files.',409);
    if(!assets)fail('setup_storage_unavailable','Private setup storage is not configured.',503);
    const inspected=inspectSetupUpload(bytes,filename),bike=canonicalBike(row.draft);
    if(bike&&!fileMatchesBike(inspected.embeddedBikeId,bike))fail('bike_file_mismatch','The file bike ID does not match the selected bike. Choose the correct file or draft.',409);
    const at=now().toISOString(),meta=await assets.put(bytes,{filename,actor:principal.userId,createdAt:at});
    row.setupFileHistory??=[];
    if(row.setupFile&&!row.setupFileHistory.some(f=>f.version===row.version))row.setupFileHistory.push({...row.setupFile,version:row.version,recordedAt:at});
    row.setupFile={assetId:meta.id,sha256:meta.sha256,sizeBytes:meta.sizeBytes,embeddedBikeId:meta.embeddedBikeId,filename};
    row.draft.compatibility='unverified';
    if(row.setupPreview)row.setupPreview.stage='File received';
    row.version++;row.updatedAt=at;
    const id=randomUUID();state.audit[id]={id,actor:principal.userId,action:'setup-file-attached',target:productId,createdAt:at,metadata:{assetId:meta.id,sha256:meta.sha256,version:row.version}};
    return {saved:true,product:row};
   });
  },
 };
}
