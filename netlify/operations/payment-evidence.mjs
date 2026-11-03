import {CommerceError} from '../commerce/service.mjs';
const unavailable=()=>{throw new CommerceError('payment_time_unverified','The original payment event needs verification in Stripe. No payment time was inferred or inventory released.',409);};

// Authenticated provider retrieval, not a browser timestamp or a newly minted
// reconciliation timestamp. Stripe's Events list has a 30-day history limit.
export async function originalPaidEvent(stripe,order,{live,now=Date.now}){
  if(!stripe.events?.list){if(live)unavailable();return null;}
  const earliest=Math.floor(Date.parse(order.createdAt)/1000),seen=new Set();let cursor,best;
  if(!Number.isSafeInteger(earliest))unavailable();
  for(let page=0;page<20;page++){
    let result;try{result=await stripe.events.list({types:['checkout.session.completed','checkout.session.async_payment_succeeded'],created:{gte:earliest},limit:100,...cursor?{starting_after:cursor}:{}});}catch{unavailable();}
    if(!Array.isArray(result?.data))unavailable();
    for(const event of result.data){
      const session=event?.data?.object;
      if(session?.id!==order.sessionId||session.payment_status!=='paid')continue;
      if(!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)||event.livemode!==live||session.livemode!==live||session.metadata?.order_id!==order.id||!/^evt_[A-Za-z0-9_]+$/.test(event.id||'')||!Number.isSafeInteger(event.created)||event.created<earliest||event.created*1000>now())unavailable();
      if(!best||event.created<best.created)best=event;
    }
    if(!result.has_more){if(!best)unavailable();return best;}
    const next=result.data.at(-1)?.id;if(!next||seen.has(next))unavailable();seen.add(next);cursor=next;
  }
  unavailable();
}
