import { createHash, randomUUID } from 'node:crypto';
import {reportUnexpected,structuredLog} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';
const deliveryFailure=async(error,env)=>reportUnexpected(error,{scope:'transactional-email',provider:'resend'},{env,reporter:await serverErrorReporter(env)});

const leaseMs = 60_000;
const idempotencyWindowMs = 23 * 60 * 60 * 1000;
const address = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value);
const sender = value => address(value) || (typeof value === 'string' && /^[^\r\n<>]+ <[^<>]+>$/.test(value) && address(value.match(/<([^>]+)>$/)?.[1]));
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean = value => String(value ?? '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
const sandboxOrder = order => order?.isTest === true || /^cs_test_/.test(order?.sessionId ?? '');
const amount = (value, currency) => new Intl.NumberFormat('en-US', {style:'currency',currency}).format(value / 100);

export function renderOrderEmail(order) {
  if (!['paid','fulfilled'].includes(order?.status)) throw new Error('Verified paid order required.');
  const test = sandboxOrder(order);
  const notice = test ? 'SANDBOX TEST. No real payment was taken. Do not ship this test order.' : '';
  const currency = /^[a-z]{3}$/i.test(order.currency ?? '') ? order.currency.toUpperCase() : 'USD';
  const number = clean(order.orderNumber || order.id);
  const lines = (order.items ?? []).map(item => `${clean(item.name)} | Size ${clean(item.size)} | Qty ${item.quantity} | ${amount(item.lineTotalCents,currency)}`);
  const totals = [['Subtotal',order.subtotalCents],['Shipping',order.shippingCents],['Tax',order.taxCents],['Total',order.totalCents]].map(([label,value])=>`${label}: ${amount(value,currency)}`);
  const shipping = order.shippingAddress ?? {};
  const destination = [order.shippingName,shipping.line1,shipping.line2,[shipping.city,shipping.state,shipping.postal_code ?? shipping.postalCode].filter(Boolean).join(' '),shipping.country].filter(Boolean).map(clean);
  const text = [notice, `DualBore Media | Order ${number}`, 'Payment confirmed. Thank you for your order.', ...lines, ...totals, 'Ship to:', ...destination, 'This confirms payment, not shipment.'].join('\n');
  return {subject:`${test?'[TEST] ':''}DualBore Media order ${number} confirmed`,text,html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Order confirmation</title></head><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#f5f7fb;background:#0b0d10"><main style="max-width:600px;margin:auto;padding:28px;background:#13161c;border-top:4px solid #ff2a3b"><p style="color:#00f0ff;font-weight:bold;letter-spacing:3px">DUALBORE / MEDIA</p><h1>Order ${escape(number)} confirmed</h1>${notice?`<p><strong>${escape(notice)}</strong></p>`:''}<p>Payment confirmed. Thank you for your order.</p><ul>${lines.map(line=>`<li>${escape(line)}</li>`).join('')}</ul>${totals.map(line=>`<p>${escape(line)}</p>`).join('')}<h2>Ship to</h2><p>${destination.map(escape).join('<br>')}</p><p>This confirms payment, not shipment.</p></main></body></html>`};
}

export function renderShipmentEmail(order) {
  if(order?.status!=='fulfilled'||!order.shippedAt||!order.trackingNumber||!order.carrier)throw new Error('Recorded shipment required.');
  const test=sandboxOrder(order);const notice=test?'SANDBOX TEST. No real package was shipped. Do not ship this test order.':'';
  const tracking=new URL(order.trackingUrl);
  if(tracking.protocol!=='https:'||tracking.username||tracking.password)throw new Error('Safe tracking URL required.');
  const number=clean(order.orderNumber||order.id);
  const items=(order.items||[]).map(item=>`${clean(item.name)} | Size ${clean(item.size)} | Qty ${item.quantity}`);
  const text=[notice,`DualBore Media | Shipment for ${number}`,'Your package has been marked as shipped.',...items,`Carrier: ${clean(order.carrier)}`,`Tracking number: ${clean(order.trackingNumber)}`,`Track your package: ${tracking.href}`,'Carrier tracking provides the latest delivery status.'].join('\n');
  return {subject:`${test?'[TEST] ':''}Your DualBore Media order ${number} has shipped`,text,html:`<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;line-height:1.6;color:#f5f7fb;background:#0b0d10"><main style="max-width:600px;margin:auto;padding:28px;background:#13161c;border-top:4px solid #ff2a3b"><p style="color:#00f0ff;font-weight:bold;letter-spacing:3px">DUALBORE / MEDIA</p><h1>Order ${escape(number)} has shipped</h1>${notice?`<p><strong>${escape(notice)}</strong></p>`:''}<p>Your package has been marked as shipped.</p><ul>${items.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><p>Carrier: ${escape(clean(order.carrier))}<br>Tracking number: ${escape(clean(order.trackingNumber))}</p><p><a href="${escape(tracking.href)}">Track your package</a></p><p>Carrier tracking provides the latest delivery status.</p></main></body></html>`};
}

async function sendType({repository,orderId,type,eventId,env,fetchImpl,now}) {
  if(env.COMMERCE_ENVIRONMENT==='production' && env.TRANSACTIONAL_EMAILS_ENABLED!=='true')return {type,status:'disabled'};
  const timestamp = now().getTime();
  const id = eventId || `${orderId}:${type}`;
  const token = randomUUID();
  const claim = await repository.transaction(async state => {
    const order = state.orders[orderId];
    if (!order || !['paid','fulfilled',...(type.startsWith('lifecycle-')?['refunded']:[])].includes(order.status)) return {status:'not-paid'};
    if(type==='customer-shipment'&&order.status!=='fulfilled')return {status:'not-shipped'};
    if (order.testProvider==='mock') return {status:'mock-suppressed'};
    const previous = state.emails[id];
    if (previous?.status === 'sent' || previous?.status === 'manual-review') return {status:previous.status};
    if (previous?.status === 'sending' && Date.parse(previous.leaseExpiresAt) > timestamp) return {status:'in-progress'};
    if (previous?.retryAfter && Date.parse(previous.retryAfter) > timestamp) return {status:'retry-queued'};
    // An expired sending lease is ambiguous: the provider may have accepted before a process crash.
    if (previous?.firstAttemptAt && (previous.uncertain || previous.status === 'sending') && timestamp - Date.parse(previous.firstAttemptAt) >= idempotencyWindowMs) {
      previous.status='manual-review'; previous.lastError='delivery-uncertain-review-required'; return {status:'manual-review'};
    }
    if (!env.RESEND_API_KEY || !sender(env.RESEND_FROM) || (env.RESEND_REPLY_TO && !address(env.RESEND_REPLY_TO))) return {status:'configuration-missing'};
    const recipient = type !== 'merchant-notification' ? order.customerEmail : env.RESEND_NOTIFY_TO;
    if (!recipient && type === 'merchant-notification') return {status:'not-configured'};
    if (!address(recipient)) return {status:'recipient-invalid'};
    const template = previous?.template || (type==='customer-shipment'?renderShipmentEmail(order):renderOrderEmail(order));
    const payload = previous?.payload ?? {from:env.RESEND_FROM,to:[recipient],...template,...(env.RESEND_REPLY_TO?{reply_to:env.RESEND_REPLY_TO}:{}),...(type==='merchant-notification'?{subject:`${sandboxOrder(order)?'[TEST] ':''}Paid order ${clean(order.orderNumber || order.id)} | DualBore Media`}:{})};
    const row = {...previous,id,orderId,emailType:type,provider:'resend',providerMessageId:previous?.providerMessageId ?? null,status:'sending',attemptCount:(previous?.attemptCount ?? 0)+1,lastError:null,createdAt:previous?.createdAt ?? new Date(timestamp).toISOString(),sentAt:null,firstAttemptAt:previous?.firstAttemptAt ?? new Date(timestamp).toISOString(),leaseToken:token,leaseExpiresAt:new Date(timestamp+leaseMs).toISOString(),retryAfter:null,uncertain:Boolean(previous?.uncertain || previous?.status==='sending'),payload};
    state.emails[id]=row;
    return {status:'claimed',payload,attemptCount:row.attemptCount};
  });
  if (claim.status !== 'claimed') return {type,status:claim.status};
  let status='failed',lastError='provider-unavailable',providerMessageId=null,uncertain=true,retryable=true;
  try {
    const response = await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`dbm-order-${createHash('sha256').update(id).digest('hex')}`},body:JSON.stringify(claim.payload),signal:AbortSignal.timeout(10_000)});
    if(response.ok){
      const data=await response.json();
      if(typeof data?.id==='string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.id)){status='sent';lastError=null;providerMessageId=data.id;uncertain=false;}
      else lastError='provider-response-invalid';
    } else {
      lastError=response.status===429?'provider-rate-limited':'provider-rejected';
      uncertain=response.status>=500;
      retryable=response.status===429 || response.status>=500;
    }
  } catch {lastError='provider-unavailable';}
  await repository.transaction(async state=>{
    const row=state.emails[id];
    if(!row || row.leaseToken!==token) return;
    Object.assign(row,{status:status==='sent'?'sent':retryable?'queued':'failed',lastError,providerMessageId,uncertain:row.uncertain || uncertain,leaseToken:null,leaseExpiresAt:null,sentAt:status==='sent'?now().toISOString():null,retryAfter:status!=='sent'?new Date(timestamp+Math.min(60_000*2**Math.min(claim.attemptCount-1,6),3_600_000)).toISOString():null});
  });
  structuredLog(status==='sent'?'email.sent':'email.failed',{scope:'transactional-email',provider:'resend',operation:type},{env,level:status==='sent'?'info':'error'});
  if(status!=='sent')await deliveryFailure(Object.assign(new Error('Transactional delivery needs review'),{code:'email_delivery_failed',status:503}),env);
  return {type,status:status==='sent'?'sent':retryable?'retry-queued':'failed'};
}

export async function deliverLifecycleEmails({repository,orderId,env={},fetchImpl=fetch,now=()=>new Date()}) {
  try {
    const events=await repository.transaction(s=>Object.values(s.emails).filter(e=>e.orderId===orderId&&e.emailType.startsWith('lifecycle-')));
    const results=[];for(const e of events)results.push(await sendType({repository,orderId,type:e.emailType,eventId:e.id,env,fetchImpl,now}));
    return results;
  }catch(error){await deliveryFailure(error,env);return [{status:'storage-or-order-unavailable'}];}
}
export async function retryRecordedEmail({repository,eventId,env={},fetchImpl=fetch,now=()=>new Date()}) {
  const event=await repository.transaction(s=>s.emails[eventId]);
  if(!event)return {status:'not-found'};
  return sendType({repository,orderId:event.orderId,type:event.emailType,eventId,env,fetchImpl,now});
}

// Call only from a verified webhook/recovery worker, never a public email endpoint.
// Repository transactions must be durable and serialized across workers.
export async function deliverOrderEmails({repository,orderId,env={},fetchImpl=fetch,now=()=>new Date()}) {
  try {
    const results=[];
    for(const type of ['customer-confirmation','merchant-notification']) results.push(await sendType({repository,orderId,type,env,fetchImpl,now}));
    return {status:'processed',results};
  } catch(error) {await deliveryFailure(error,env);return {status:'storage-or-order-unavailable',results:[]};}
}

export async function deliverShipmentEmail({repository,orderId,env={},fetchImpl=fetch,now=()=>new Date()}) {
  try{return await sendType({repository,orderId,type:'customer-shipment',env,fetchImpl,now});}
  catch(error){await deliveryFailure(error,env);return {type:'customer-shipment',status:'storage-or-order-unavailable'};}
}
