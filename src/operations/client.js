import {reportBrowserError} from '../observability/client.js';
import {workosSessionFetch} from './workos-session.js';
export const fulfillmentLabels = Object.freeze({received:'Order received',making:'Making your order',packing:'Packing',ready_to_ship:'Ready to ship',shipped:'Shipped',delivered:'Delivered',cancelled:'Cancelled',on_hold:'On hold',unfulfilled:'Not started'});
export const fulfillmentSteps = ['received','making','packing','ready_to_ship','shipped','delivered'];
export const label = value => fulfillmentLabels[value] || String(value || 'Pending').replaceAll('_',' ');
export const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100) : 'Pending';
export const date = value => { const time=new Date(value); return Number.isNaN(time.valueOf())?'Pending':new Intl.DateTimeFormat('en-US',{dateStyle:'medium'}).format(time); };
export function safeTrackingUrl(value) { try { const url=new URL(value); return url.protocol==='https:'&&!url.username&&!url.password?url.href:null; } catch { return null; } }
const messages={duplicate_tracking:'That tracking number is already used by another package. Review the existing shipment before continuing.',video_sync_disabled:'Video refresh is not enabled. The last verified feed is still available.',step_up_required:'Verify your sign-in again before this sensitive change. Nothing was changed. Return to this view and review the change again.',admin_required:'This account does not have administrator access. Contact an administrator.',staff_required:'This account does not have staff access. Contact an administrator.',refund_reconciliation_required:'This refund needs a Stripe review before another attempt. No new refund was issued.',refund_unavailable:'Stripe could not confirm this refund. Keep the same request and review its status.',stale_record:'This record changed. Reload before saving.',unauthorized:'Sign in again to continue.',forbidden:'This account does not have access to this area.',mfa_required:'Complete two-step verification to access garage operations.',auth_unavailable:'Secure sign-in is not configured yet.',version_conflict:'This record changed. Refresh and review it before saving.',invalid_transition:'This status change is not available. Refresh and review the order.',payments_disabled:'Payments are disabled. No charge or refund was processed.',staff_reconciliation_required:'This staff change needs an authentication-provider review. Finish the intended change in the authentication provider, then use Verify provider outcome.',staff_enrollment_required:'Verify the account email and enroll two-step verification before granting staff access.',stale_role:'The account role changed. Reload before saving.',staff_provider_unavailable:'Staff accounts are temporarily unavailable. Try again shortly.',invalid_product:'Review the product fields and confirm the saved metadata.',duplicate_sku:'That SKU is already in use. Choose a unique SKU.',publication_blocked:'Publication blocked. Complete all merchandise fields. Digital setups also require verified private storage and delivery, which are not enabled.',rate_limited:'Too many requests. Wait a moment and try again.'};
export function operationsQuery({admin=false,staff=false,staffManagement=false,query={}}={}) {
 const params=new URLSearchParams();if(admin)params.set('admin','true');if(staff)params.set('staff','true');if(staffManagement)params.set('staffManagement','true');
 for(const key of ['page','search','status','fulfillmentStatus','customer','dateFrom','dateTo','sort','shipmentStatus','orderNumber'])if(query[key]!==undefined&&query[key]!=='')params.set(key,String(query[key]));
 return params.size?'?'+params.toString():'';
}
export async function operationsRequest(getToken,payload,{signal,admin=false,staff=false,staffManagement=false,query={},fetcher=fetch}={}) {
 const token=await getToken?.();
 const cookieAuth=getToken?.cookieSession===true;
 if(!token&&!cookieAuth)throw new Error(messages.unauthorized);
 let response;
 try { const url='/api/operations'+(!payload?operationsQuery({admin,staff,staffManagement,query}):'');const options={method:payload?'POST':'GET',headers:{...(cookieAuth?{}:{Authorization:`Bearer ${token}`}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal,cache:'no-store',credentials:cookieAuth?'same-origin':'omit'};response=await(cookieAuth?workosSessionFetch(url,options,fetcher):fetcher(url,options)); }
 catch(error) { if(error.name==='AbortError')throw error;reportBrowserError(new Error('Operations connection unavailable')); throw new Error('The garage is temporarily unavailable. Your changes were not confirmed. Try again.'); }
 let data;try {data=await response.json();}catch {throw new Error('The garage could not load. Please try again.');}
 if(!response.ok){if(response.status>=500)reportBrowserError(new Error('Operations service unavailable'),{reference:data.reference||response.headers?.get('X-Request-ID')});const error=new Error(messages[data.code||data.error?.code||data.error]||(response.status===403?messages.forbidden:response.status===401?messages.unauthorized:'We could not save this change. Refresh and try again.'));error.code=typeof data.code==='string'?data.code:undefined;throw error;}
 return data;
}

export async function uploadSetupFile(getToken,{productId,expectedVersion,file},{fetcher=fetch}={}) {
 if(!file||!Number.isSafeInteger(file.size)||file.size<48||file.size>2*1024*1024||!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,119}\.stp$/i.test(file.name))throw new Error('Choose a supported .stp file, no larger than 2 MB, with a simple filename.');
 const token=await getToken?.(),cookieAuth=getToken?.cookieSession===true;
 if(!token&&!cookieAuth)throw new Error(messages.unauthorized);
 let response;
 try {
  const url='/api/setup-files?'+new URLSearchParams({productId});
  const options={method:'POST',headers:{...(cookieAuth?{}:{Authorization:`Bearer ${token}`}), 'Content-Type':'application/octet-stream','X-Setup-Filename':encodeURIComponent(file.name),'X-Product-Version':String(expectedVersion)},body:file,cache:'no-store',credentials:cookieAuth?'same-origin':'omit'};
  response=await(cookieAuth?workosSessionFetch(url,options,fetcher):fetcher(url,options));
 }catch{throw new Error('Private file upload could not be confirmed. Reload the draft before trying again.');}
 let data;try{data=await response.json();}catch{throw new Error('Private file upload could not be confirmed. Reload the draft before trying again.');}
 if(!response.ok){const error=new Error(messages[data.code]||'Private file upload was rejected. Check the file and reload the saved draft.');error.code=data.code;throw error;}
 return data;
}

// Patch the loaded page only; authorized server filters still govern every read.
export function updateOrderPage(data,order,query={}){
 const match=o=>(!query.fulfillmentStatus||o.fulfillmentStatus===query.fulfillmentStatus)&&(!query.status||o.status===query.status)&&(!query.shipmentStatus||(o.shipments||[]).some(p=>p.status===query.shipmentStatus));
 const previous=data.orders||[],orders=previous.map(o=>o.orderNumber===order.orderNumber&&(order.version??0)>=(o.version??0)?order:o).filter(match);
 const removed=previous.length-orders.length;
 return {...data,orders,...(data.pagination?{pagination:{...data.pagination,total:Math.max(0,data.pagination.total-removed)}}:{})};
}
