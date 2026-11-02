const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const descriptions = {
  making: ['Making your order', 'Your order is now being made in the garage.'],
  packing: ['Packing your order', 'Your order is being packed. This is not a shipping confirmation.'],
  ready_to_ship: ['Ready to ship', 'Your order is packed and ready. Shipment is confirmed separately.'],
  shipped: ['Your package has shipped', 'We have recorded this package as shipped. Carrier tracking has the latest information.'],
  delivered: ['Delivery recorded', 'Delivery has been recorded for this package.'],
  cancelled: ['Order cancelled', 'Fulfillment has been cancelled. Any refund is confirmed separately.'],
  refund: ['Refund confirmed', 'Stripe has confirmed a refund. Your bank determines when it appears.'],
};
export function lifecycleTemplate(order, type, shipment) {
  const copy=descriptions[type]; if(!copy) throw new Error('Unsupported lifecycle event.');
  const test=order.isTest===true || /^cs_test_/.test(order.sessionId || '');
  const notice=test?'SANDBOX TEST. No real payment or shipment. Do not ship this test order.':'';
  const lines=order.items.filter(item=>!shipment||shipment.items.some(i=>i.variantId===item.variantId)).map(item=>`${item.name} | ${item.size} | Qty ${shipment?.items.find(i=>i.variantId===item.variantId)?.quantity ?? item.quantity}`);
  const tracking=shipment?.trackingUrl;
  if(tracking){const url=new URL(tracking);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Unsafe tracking URL.');}
  const details=shipment?[`Package: ${shipment.packageNumber}`,`Carrier: ${shipment.carrier}`,`Tracking: ${shipment.trackingNumber}`,tracking || 'Tracking information unavailable.']:[];
  const text=[notice,`DualBore Media | ${order.orderNumber}`,copy[0],copy[1],...lines,...details].filter(Boolean).join('\n');
  const html=`<!doctype html><html lang="en"><body style="margin:0;background:#0b0d10;color:#f6f7fb;font:16px/1.6 Arial,sans-serif"><table role="presentation" width="100%"><tr><td style="padding:24px"><table role="presentation" width="100%" style="max-width:600px;margin:auto;background:#13161c;border-top:4px solid #ff2a3b"><tr><td style="padding:28px"><p style="font-weight:bold;letter-spacing:3px;color:#00f0ff">DUALBORE / MEDIA</p>${notice?`<p style="color:#ffffff">${escape(notice)}</p>`:''}<p>${escape(order.orderNumber)}</p><h1 style="font-size:30px;line-height:1.15;color:#ffffff">${escape(copy[0])}</h1><p>${escape(copy[1])}</p>${lines.map(line=>`<p style="border-bottom:1px solid #333846;padding-bottom:12px">${escape(line)}</p>`).join('')}${details.filter(line=>line!==tracking).map(line=>`<p>${escape(line)}</p>`).join('')}${tracking?`<p><a style="color:#00f0ff" href="${escape(tracking)}">Track package (opens carrier website)</a></p>`:''}<p style="color:#bcc4d0;font-size:13px">This is an order update. You have not been subscribed to marketing.</p></td></tr></table></td></tr></table></body></html>`;
  return {subject:`${test?'[TEST] ':''}${copy[0]} | ${order.orderNumber} | DualBore Media`,html,text};
}
// Called inside the same transaction as the state change. Payload cannot be supplied by a browser.
export function enqueueLifecycle(state,order,type,{shipment,eventKey,env={},now=new Date().toISOString()}={}) {
  if(['packing','ready_to_ship'].includes(type)&&env.CUSTOMER_PROGRESS_EMAILS!=='true')return false;
  const id=`${order.id}:lifecycle-${type}:${eventKey || shipment?.id || 'order'}:v1`;
  const emailType=shipment?.id?`lifecycle-${type}:${shipment.id}`:`lifecycle-${type}`;
  if(state.emails[id]||Object.values(state.emails).some(event=>event.orderId===order.id&&event.emailType===emailType)) return false;
  state.emails[id]={id,orderId:order.id,emailType,provider:'resend',status:'pending',attemptCount:0,createdAt:now,template:lifecycleTemplate(order,type,shipment)};
  return true;
}
