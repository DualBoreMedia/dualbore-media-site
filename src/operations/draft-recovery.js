// Text-only recovery for an authenticated Admin owner in this browser tab.
// The server is authoritative: recovering text does not mean saving or publishing.
// Never store tokens, passwords, addresses, prices, SKUs, STP bytes, file names,
// compatibility claims, or a customer's personal data.
const prefix='dbm-admin-text-recovery-v1';
export const TEXT_RECOVERY_AGE_MS=12*60*60*1000;
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const safeText=data=>data&&typeof data==='object'&&!Array.isArray(data)&&
 typeof data.name==='string'&&data.name.length<=120&&
 typeof data.description==='string'&&data.description.length<=3000;
const validVersion=value=>value===null||(Number.isSafeInteger(value)&&value>=0);
function key(ownerId,editor,productId){
 if(!safeId(ownerId)||!['merch','mx_setup'].includes(editor)||!safeId(productId))return null;
 return [prefix,ownerId,editor,productId].join(':');
}
function store(explicit){try{return explicit??globalThis.sessionStorage;}catch{return null;}}
export function clearTextRecovery({ownerId,editor,productId,storage}){
 const k=key(ownerId,editor,productId);if(!k)return false;
 try{const api=store(storage);if(!api)return false;api.removeItem(k);return true;}catch{return false;}
}
export function clearOwnerTextRecoveries(ownerId,storage){
 if(!safeId(ownerId))return 0;
 try{
  const api=store(storage);if(!api)return 0;
  const prefixForOwner=prefix+':'+ownerId+':',toDelete=[];
  for(let i=0;i<api.length;i++){const k=api.key(i);if(k?.startsWith(prefixForOwner))toDelete.push(k);}
  for(const k of toDelete)api.removeItem(k);
  return toDelete.length;
 }catch{return 0;}
}
export function saveTextRecovery({ownerId,editor,productId,expectedVersion=null,text,storage,now=Date.now()}){
 const k=key(ownerId,editor,productId);
 if(!k||!validVersion(expectedVersion)||!safeText(text)||!Number.isFinite(now))return false;
 const payload={format:1,expectedVersion,createdAt:now,name:text.name,description:text.description};
 try{const api=store(storage);if(!api)return false;api.setItem(k,JSON.stringify(payload));return true;}catch{return false;}
}
export function readTextRecovery({ownerId,editor,productId,expectedVersion=null,storage,now=Date.now()}){
 const k=key(ownerId,editor,productId);if(!k||!validVersion(expectedVersion))return null;
 try{
  const api=store(storage),raw=api?.getItem(k);
  if(!raw)return null;
  if(raw.length>4096){api.removeItem(k);return null;}
  const data=JSON.parse(raw);
  if(!data||data.format!==1||data.expectedVersion!==expectedVersion||
     !safeText(data)||!Number.isFinite(data.createdAt)||data.createdAt>now||
     now-data.createdAt>TEXT_RECOVERY_AGE_MS){api.removeItem(k);return null;}
  return {name:data.name,description:data.description};
 }catch{return null;}
}
