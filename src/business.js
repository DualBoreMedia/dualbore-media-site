// Owner-confirmed facts shared by public copy and future fulfillment rules.
export const supportContact = Object.freeze({email: 'midohiomx@gmail.com', href: 'mailto:midohiomx@gmail.com'});
export const shippingCommitment = Object.freeze({
  businessDays: 5,
  processing: 'Made to order. Ships within 5 business days after payment confirmation. Weekends and holidays do not count. Shipment means handing the merchandise to the carrier, not creating a shipping label. Carrier transit time is additional.',
});

export function shippingDelayNotice({orderNumber, reason, revisedShipDate, replyBy, timeZone}) {
  let deadline='[reply deadline and approved time zone required]';
  try{if(replyBy&&timeZone)deadline=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'longOffset'}).format(new Date(replyBy))+` (${timeZone})`;}catch{/* Incomplete preview only. The server requires valid dates/calendar. */}
  return `DualBore Media | ${orderNumber}\nWe cannot meet the current shipment promise: ${reason}\nProposed shipment date (carrier handoff, not delivery): ${revisedShipDate} (${timeZone||'approved time zone required'}).\nPlease reply by ${deadline} to expressly accept this revised date, or cancel for a prompt refund for the unshipped portion, including applicable shipping and tax. For an entirely unshipped order, this means the full remaining payment. We will not treat silence as consent. If you do not agree by that deadline, we will cancel the unshipped merchandise and arrange the required refund. You may cancel delayed, unshipped merchandise before actual shipment even after agreeing to the delay. Carrier transit time is additional.\nReply to ${supportContact.email}. No marketing subscription is created.`;
}
