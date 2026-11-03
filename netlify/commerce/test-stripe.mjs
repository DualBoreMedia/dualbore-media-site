import {randomBytes} from 'node:crypto';
// Local deterministic boundary substitute, never a Stripe client or payment collector.
export function createMockStripe(){
 const sessions=new Map(),keys=new Map(),testPrices={};
 return {testPrices,testSessions:sessions,prices:{retrieve:async id=>testPrices[id]},tax:{registrations:{list:async()=>({data:[{id:'mock_registration'}]})}},checkout:{sessions:{
  create:async(params,{idempotencyKey})=>{if(keys.has(idempotencyKey))return sessions.get(keys.get(idempotencyKey));const id='cs_test_'+randomBytes(16).toString('hex');const value={...params,id,url:'https://checkout.stripe.com/c/pay/'+id,livemode:false,status:'open',payment_status:'unpaid',currency:'usd',amount_subtotal:params.line_items.reduce((s,l)=>s+testPrices[l.price].unit_amount*l.quantity,0),total_details:{amount_shipping:700,amount_tax:0}};value.amount_total=value.amount_subtotal+700;sessions.set(id,value);keys.set(idempotencyKey,id);return value;},
  retrieve:async id=>sessions.get(id),expire:async id=>{const s=sessions.get(id);s.status='expired';return s;}
 }}};
}
