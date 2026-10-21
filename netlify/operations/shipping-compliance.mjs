import {shippingCommitment, shippingDelayNotice} from '../../src/business.js';
import {CommerceError} from '../commerce/service.mjs';

const fail = (message, code = 'shipping_review_required') => {throw new CommerceError(code, message, 409);};
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(value) && Number.isFinite(Date.parse(value));
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 600 && !/[\u0000-\u001f]/.test(value);
const localDate = (value, timeZone) => new Intl.DateTimeFormat('en-CA', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const handed = packageRecord => ['shipped','delivered'].includes(packageRecord.status);

export function approvedShippingCalendar(env) {
  if(env.SHIPPING_CALENDAR_APPROVED !== 'true') return null;
  try {
    const c = JSON.parse(env.SHIPPING_BUSINESS_CALENDAR);
    if(!c || typeof c.timeZone !== 'string' || !validDate(c.reviewedThrough) || !Array.isArray(c.weekdays) || !c.weekdays.length || new Set(c.weekdays).size !== c.weekdays.length || !c.weekdays.every(day=>Number.isInteger(day)&&day>=0&&day<=6) || !Array.isArray(c.holidays) || !c.holidays.every(validDate)) return null;
    localDate('2026-01-01T00:00:00Z',c.timeZone);
    return {timeZone:c.timeZone,weekdays:c.weekdays,holidays:c.holidays,reviewedThrough:c.reviewedThrough};
  } catch {return null;}
}

export function captureShippingPromise(order, env) {
  const calendar = approvedShippingCalendar(env);
  const base = {businessDays:shippingCommitment.businessDays,paymentConfirmedAt:order.paidAt,verified:false};
  if(!calendar || !instant(order.paidAt) || order.paymentTimestampVerified===false) return base;
  const day = new Date(localDate(order.paidAt,calendar.timeZone)+'T12:00:00Z');
  let remaining = shippingCommitment.businessDays;
  // Count dates AFTER payment confirmation. No order cutoff is inferred.
  for(let step=0;step<40&&remaining;step++) {
    day.setUTCDate(day.getUTCDate()+1);
    if(calendar.weekdays.includes(day.getUTCDay())&&!calendar.holidays.includes(day.toISOString().slice(0,10))) remaining--;
  }
  const dueDate = day.toISOString().slice(0,10);
  if(remaining || dueDate>calendar.reviewedThrough) return base;
  return {...base,verified:true,dueDate,calendar};
}

export function shippingReview(order, now = new Date()) {
  const promise = order.shippingPromise;
  if(order.status==='refunded') return {status:'closed'};
  if(order.shipmentDelay?.status==='refund_required') return {status:'refund_required',partial:order.shipmentDelay.partial};
  if(order.fulfillmentStatus==='cancelled') return {status:['paid','fulfilled'].includes(order.status)&&order.refundStatus!=='full'&&(order.refundedCents||0)<order.totalCents?'refund_required':'closed'};
  if(['shipped','delivered'].includes(order.fulfillmentStatus)) return {status:'shipped'};
  if(!promise?.verified) return {status:'calendar_unconfirmed'};
  const delay = order.shipmentDelay;
  const dueDate = delay?.status==='consented' ? delay.revisedShipDate : promise.dueDate;
  const today = localDate(now,promise.calendar.timeZone);
  if(delay?.status==='awaiting_consent') return {status:Date.parse(delay.replyBy)<=new Date(now).getTime()?'cancel_refund_due':'awaiting_consent',dueDate,replyBy:delay.replyBy};
  return {status:today>dueDate?'cancel_refund_due':today===dueDate?'due_today':'upcoming',dueDate};
}

export function assertCarrierHandoff(order, input, now = new Date(), env = {}) {
  if(input.carrierAccepted!==true) fail('Confirm physical carrier possession. Creating a label is not shipment.','carrier_handoff_required');
  if(!['paid','fulfilled'].includes(order.status)||order.refundStatus==='full'||['on_hold','cancelled'].includes(order.fulfillmentStatus)) fail('This order cannot be handed to the carrier while unpaid, refunded, held or cancelled.');
  if(env.COMMERCE_ENVIRONMENT==='production'&&!order.shippingPromise?.verified) fail('Verify the original payment time and business-day deadline before carrier handoff.');
  if(['awaiting_consent','refund_required'].includes(order.shipmentDelay?.status)||shippingReview(order,now).status==='cancel_refund_due') fail('Resolve the shipment delay, cancellation and refund review before handing off this package.');
}

// Only the MFA-authorized administrator service calls this. It records manual
// customer communications; it does not send email or pretend a refund succeeded.
export function changeShippingDelay(state, order, input, now = new Date()) {
  const time = new Date(now).toISOString();
  const packages = Object.values(state.shipments).filter(p=>p.orderId===order.id);
  if(!['paid','fulfilled'].includes(order.status)||['shipped','delivered','cancelled'].includes(order.fulfillmentStatus)) fail('Select an active paid order with unshipped merchandise.');
  const current = order.shipmentDelay;
  if(input.operation==='notice') {
    const review=shippingReview(order,now),promise=order.shippingPromise;
    if(!promise?.verified||!['upcoming','due_today'].includes(review.status)) fail('A verified, unexpired shipment promise is required. Expired or unanswered delays require cancellation review.');
    if(input.confirmed!==true||!text(input.reason)||!text(input.basis)||!text(input.reference)||!validDate(input.revisedShipDate)||!instant(input.sentAt)||!instant(input.replyBy)) fail('Record the complete notice, reasonable basis, message reference and customer response deadline.','invalid_delay_notice');
    if(input.revisedShipDate<=review.dueDate||input.revisedShipDate>promise.calendar.reviewedThrough||!promise.calendar.weekdays.includes(new Date(input.revisedShipDate).getUTCDay())||promise.calendar.holidays.includes(input.revisedShipDate)) fail('Use a later shipment date supported by the approved operating calendar.','invalid_delay_notice');
    if(Date.parse(input.sentAt)>new Date(now).getTime()||Date.parse(input.sentAt)<Date.parse(order.paidAt)||Date.parse(input.replyBy)<new Date(now).getTime()||Date.parse(input.replyBy)<=Date.parse(input.sentAt)||localDate(input.replyBy,promise.calendar.timeZone)>review.dueDate) fail('The notice and response deadline must precede the current shipment deadline.','invalid_delay_notice');
    const expected = shippingDelayNotice({orderNumber:order.orderNumber,reason:input.reason,revisedShipDate:input.revisedShipDate,replyBy:input.replyBy,timeZone:promise.calendar.timeZone});
    if(input.noticeText!==expected) fail('Use the complete delay notice with cancellation, refund and express-consent choices.','invalid_delay_notice');
    const history=current?[...(current.history||[]),Object.fromEntries(Object.entries(current).filter(([key])=>key!=='history'))]:[];
    order.shipmentDelay={status:'awaiting_consent',reason:input.reason,basis:input.basis,reference:input.reference,sentAt:input.sentAt,replyBy:input.replyBy,revisedShipDate:input.revisedShipDate,noticeText:expected,previousFulfillment:current?.previousFulfillment||order.fulfillmentStatus,history};
    order.fulfillmentStatus='on_hold';
    return {next:'awaiting_consent'};
  }
  if(input.operation==='response') {
    if(!current||!['awaiting_consent','consented'].includes(current.status)||!['consent','cancel'].includes(input.decision)||!text(input.reference)||!instant(input.receivedAt)||Date.parse(input.receivedAt)<Date.parse(current.sentAt)||Date.parse(input.receivedAt)>new Date(now).getTime()) fail('Record the actual customer decision, time and message reference.','invalid_delay_response');
    if(input.decision==='consent') {
      if(current.status!=='awaiting_consent'||Date.parse(input.receivedAt)>=Date.parse(current.replyBy)||new Date(now).getTime()>=Date.parse(current.replyBy)) fail('Consent was not recorded before the deadline. Review cancellation and refund instead.','invalid_delay_response');
      Object.assign(current,{status:'consented',responseAt:input.receivedAt,responseReference:input.reference});
      order.fulfillmentStatus=current.previousFulfillment;
      return {next:'consented'};
    }
  } else if(input.operation!=='review'||shippingReview(order,now).status!=='cancel_refund_due') fail('No expired delay or shipment promise requires cancellation review.');
  if(input.confirmed!==true)fail('Confirm cancellation of the unshipped merchandise and the required refund.','confirmation_required');
  // Full unshipped orders require all remaining payment, including shipping/tax.
  // Split shipments require a reviewed allocation, never a fabricated amount.
  const partial=packages.some(handed);
  order.shipmentDelay={...current,status:'refund_required',partial,cancelledAt:time,...(input.reference?{responseReference:input.reference}:{}),refundRequiredAt:time,refundAmountCents:partial?null:order.totalCents-(order.refundedCents||0)};
  order.fulfillmentStatus=partial?'on_hold':'cancelled';
  return {next:'refund_required',partial};
}
