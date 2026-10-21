import {testCatalog} from '../netlify/commerce/catalog.mjs';
import {captureShippingPromise} from '../netlify/operations/shipping-compliance.mjs';
import {shippingDelayNotice} from '../src/business.js';

export function demoSeed(at=new Date()){
 const now=new Date(at),stamp=now.toISOString(),day=n=>new Date(now.getTime()+n*86400000).toISOString();
 // This illustrative calendar is NOT the owner's approved fulfillment calendar.
 const calendar={timeZone:'America/New_York',weekdays:[1,2,3,4,5],holidays:[`${now.getUTCFullYear()}-12-25`],reviewedThrough:`${now.getUTCFullYear()+2}-12-31`};
 const env={COMMERCE_ENVIRONMENT:'test',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false',MARKETING_EMAILS_ENABLED:'false',DROP_WAITLIST_ENABLED:'false',SHIPPING_CALENDAR_APPROVED:'true',SHIPPING_BUSINESS_CALENDAR:JSON.stringify(calendar),SITE_ORIGIN:'http://127.0.0.1:4330'};
 const variants=Object.fromEntries(testCatalog.map((v,i)=>[v.id,{...v,inventoryPolicy:i<12?'made_to_order':'finite',priceCents:v.productId==='e92-tee'?3000:5000,availableQuantity:i===14?0:i===13?1:8,reservedQuantity:0,soldQuantity:0,version:0}]));
 const orders={},shipments={},shipmentItems={},audit={},supportTickets={};
 const states=['received','making','packing','ready_to_ship','shipped','cancelled','on_hold','making'];
 for(let i=0;i<states.length;i++){
  const id='demo-order-'+(i+1),createdAt=day(i===7?-14:-i%3),items=[['e92-tee-m',2],['e90-crewneck-l',1]].map(([variantId,quantity])=>{const v=variants[variantId];if(!v)throw Error('Demo catalog changed');return {variantId,productId:v.productId,sku:v.sku,name:v.name,size:v.size,quantity,unitPriceCents:v.priceCents,lineTotalCents:v.priceCents*quantity};});
  const subtotalCents=items.reduce((n,l)=>n+l.lineTotalCents,0);
  const o={id,orderNumber:'DBM-DEMO-'+(1001+i),requestKey:'demo-request-'+i,sessionId:'cs_test_demo_session_'+i,paymentIntentId:'pi_demo_'+i,isTest:true,testProvider:'admin-demo',status:'paid',fulfillmentStatus:states[i],version:0,currency:'usd',subtotalCents,shippingCents:995,taxCents:0,totalCents:subtotalCents+995,refundedCents:0,refundStatus:'none',createdAt,paidAt:createdAt,paymentTimestampVerified:true,customerEmail:`practice${i+1}@example.invalid`,customerUserId:i===0?'user_demoCustomer':'user_otherDemo',shippingName:`Synthetic Customer ${i+1}`,shippingAddress:{line1:'100 Demonstration Lane',city:'Example City',state:'OH',postal_code:'00000',country:'US'},items};
  o.shippingPromise=captureShippingPromise(o,env);
  if(i===5)o.shipmentDelay={status:'refund_required',partial:false,refundAmountCents:o.totalCents,refundRequiredAt:stamp};
  if(i===6){const replyBy=day(1),revisedShipDate=day(10).slice(0,10);o.shipmentDelay={status:'awaiting_consent',reason:'SYNTHETIC: blank supply delayed',basis:'Practice supplier scenario, not a real supplier',reference:'DEMO-NOT-SENT',sentAt:stamp,replyBy,revisedShipDate,previousFulfillment:'making',noticeText:shippingDelayNotice({orderNumber:o.orderNumber,reason:'SYNTHETIC supply delay',revisedShipDate,replyBy,timeZone:calendar.timeZone})};}
  orders[id]=o;
  for(const item of items)variants[item.variantId].soldQuantity+=item.quantity;
  audit['demo-audit-'+i]={id:'demo-audit-'+i,actor:'demo-admin',action:'demo-seed',target:o.orderNumber,createdAt,metadata:{synthetic:true,scenario:states[i]}};
  if([2,3,4].includes(i)){
   const p={id:'demo-package-'+i,orderId:id,packageNumber:'DEMO-PKG-'+i,status:i===4?'shipped':i===3?'packed':'draft',version:0,carrier:'DEMO carrier',service:'Practice only',trackingNumber:i===4?'':'DEMO-NOT-A-REAL-PACKAGE',trackingUrl:i===4?'':'https://example.invalid/demo-tracking',items:i===2?[{variantId:items[0].variantId,quantity:1}]:items.map(({variantId,quantity})=>({variantId,quantity})),createdAt,createdByUserId:'demo-employee',trackingEnteredByUserId:'demo-employee',...(i>2?{packedByUserId:'demo-employee',packedAt:createdAt}:{}),...(i===4?{shippedAt:stamp,carrierAcceptedAt:stamp}: {})};shipments[p.id]=p;
   for(const [n,item]of p.items.entries()){const row={id:p.id+'-'+n,shipmentId:p.id,...item};shipmentItems[row.id]=row;}
  }
 }
 supportTickets['demo-ticket']={id:'demo-ticket',ticketNumber:'SUP-DEMO-1001',version:0,userId:'user_demoCustomer',customerEmail:'practice1@example.invalid',orderNumber:'DBM-DEMO-1001',category:'returns',message:'SYNTHETIC: Can I exchange an unused tee for size L?',status:'open',createdAt:stamp,updatedAt:stamp};
 return {env,calendar,state:{variants,orders,shipments,shipmentItems,audit,supportTickets}};
}

export function demoIdentity(role='admin'){
 return {userId:role==='customer'?'user_demoCustomer':role==='employee'?'user_demoEmployee':'user_demoAdmin',email:role==='customer'?'practice1@example.invalid':role+'@example.invalid',displayName:'Synthetic '+role,role,admin:role==='admin',mfa:true,mfaEnrolled:true,sessionId:'demo-session-'+role};
}
