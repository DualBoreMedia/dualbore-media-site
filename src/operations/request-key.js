// Idempotency keys must use browser entropy. Create them only for a confirmed
// change, so a limited browser can still read the private dashboard safely.
export function createRequestKey(cryptoApi=globalThis.crypto){
 try{
  if(typeof cryptoApi?.randomUUID==='function'){
   const key=cryptoApi.randomUUID();
   if(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key))return key;
  }
 }catch{}
 try{
  if(typeof cryptoApi?.getRandomValues==='function'){
   const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
   bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
   const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
   return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
 }catch{}
 throw new Error('Your browser could not create a secure request. Nothing was changed. Use an updated browser on the secure website and try again.');
}
