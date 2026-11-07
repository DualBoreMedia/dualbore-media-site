// Server-only attachment delivery. Order snapshots pin immutable file versions;
// neither a browser return URL nor current catalog edits authorize a delivery.
import {inspectSetupUpload} from './private-assets.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=value=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,200);
export const setupItems=order=>(order?.items||[]).filter(item=>item.type==='mx_setup');

export function paidSetupOrder(state,order) {
 return order&&['paid','fulfilled'].includes(order.status)&&!['on_hold','cancelled'].includes(order.fulfillmentStatus)
  &&!['partial','full','pending'].includes(order.refundStatus)&&!(order.refundedCents>0)
  &&Object.values(state.events).some(e=>e.orderId===order.id&&e.status==='processed'&&['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type));
}
export function setupDeliveryRefs(order) {
 const items=setupItems(order);
 if(!items.length||items.length>20)throw Error('Setup delivery needs review.');
 return items.map((item,index)=>{
  const file=item.setupFile;
  if(!file||!/^[a-f0-9-]{36}$/i.test(file.assetId||'')||!/^[a-f0-9]{64}$/.test(file.sha256||'')
   ||!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<48||file.sizeBytes>2*1024*1024
   ||!/^MX[12]OEM_[A-Za-z0-9_]{1,60}$/.test(file.embeddedBikeId||'')
   ||!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.stp$/i.test(file.filename||''))throw Error('Setup file snapshot needs review.');
  return {...file,filename:`${index+1}-${file.filename.slice(0,-4).slice(0,110)}.stp`};
 });
}
export async function setupEmailAttachments(assets,refs) {
 if(!assets||!Array.isArray(refs)||!refs.length||refs.length>20||refs.reduce((sum,f)=>sum+f.sizeBytes,0)>8*1024*1024)throw Error('Setup attachments need review.');
 const attachments=[];
 for(const ref of refs){
  const asset=await assets.read(ref.assetId);
  if(!asset)throw Error('Private setup file unavailable.');
  const inspected=inspectSetupUpload(asset.bytes,ref.filename);
  if(inspected.sha256!==ref.sha256||inspected.embeddedBikeId!==ref.embeddedBikeId||inspected.sizeBytes!==ref.sizeBytes)throw Error('Private setup integrity needs review.');
  attachments.push({filename:ref.filename,content:Buffer.from(asset.bytes).toString('base64')});
 }
 return attachments;
}
export function renderSetupEmail(order) {
 const test=order.isTest===true||/^cs_test_/.test(order.sessionId||''),number=clean(order.orderNumber||order.id);
 const notice=test?'SANDBOX TEST. No real payment was taken.':'';
 const items=setupItems(order).map(item=>`${clean(item.name)} | ${clean(item.oemBike)} | OEM ${clean(item.bikeVersion)} | MX Bikes ${clean(item.gameVersion)}`);
 const text=[notice,`DualBore Media | Setup files for ${number}`,'Payment confirmed. Your purchased .stp files are attached.',...items,'Keep the original .stp extension. Use only the exact bike, OEM pack and game versions shown in your purchase.','This is delivery of your purchase, not a marketing subscription.'].filter(Boolean).join('\n');
 return{subject:`${test?'[TEST] ':''}Your DualBore Media setup files | ${number}`,text,html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Your setup files</title></head><body><main><h1>Setup files for ${escape(number)}</h1>${notice?`<p><strong>${escape(notice)}</strong></p>`:''}<p>Payment confirmed. Your purchased .stp files are attached.</p><ul>${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><p>Keep the original .stp extension. Use only the exact bike, OEM pack and game versions shown in your purchase.</p><p>This is delivery of your purchase, not a marketing subscription.</p></main></body></html>`};
}
