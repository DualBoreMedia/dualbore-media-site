import {commerceRuntime} from '../netlify/commerce/runtime.mjs';
import {originalPaidEvent} from '../netlify/operations/payment-evidence.mjs';
import {deliverOrderEmails,deliverShipmentEmail,deliverLifecycleEmails} from '../netlify/commerce/order-email.mjs';
// Explicit local maintenance. Never release on wall-clock expiry alone: ask Stripe.
try{
 const {repository,stripe,service,mock}=await commerceRuntime();
 const emailEnv=mock?{...process.env,RESEND_API_KEY:undefined}:process.env;
 const orders=await repository.transaction(s=>Object.values(s.orders));
 for(const order of orders){
  if(order.status==='checkout_pending'&&!order.sessionId){
   // Retry exact immutable request/idempotency key. Stripe may already have created it.
   await service.checkout({items:order.items.map(({variantId,quantity})=>({variantId,quantity}))},{requestKey:order.requestKey});
  }
  const current=await repository.transaction(s=>s.orders[order.id]);
  if(current.sessionId&&['checkout_pending','payment_pending'].includes(current.status)){
   const session=await stripe.checkout.sessions.retrieve(current.sessionId);
   const type=session.payment_status==='paid'?'checkout.session.completed':session.status==='expired'?'checkout.session.expired':null;
   const live=process.env.COMMERCE_ENVIRONMENT==='production';
   let original=null;
   if(session.payment_status==='paid'){
    try{original=await originalPaidEvent(stripe,current,{live});}
    catch{process.exitCode=1;console.error('A stored order requires manual payment-evidence review. No state or stock change was made for that order.');continue;}
   }
   if(type)await service.webhook(original||{id:'evt_reconcile_'+current.id.replaceAll('-','')+'_'+type.split('.').at(-1),type,livemode:live,data:{object:session}});
  }
  await deliverOrderEmails({repository,orderId:order.id,env:emailEnv});
  await deliverShipmentEmail({repository,orderId:order.id,env:emailEnv});
  await deliverLifecycleEmails({repository,orderId:order.id,env:emailEnv});
 }
 console.log('Configured order reconciliation completed. No deployment or marketing send was performed.');
}catch{console.error('Local test reconciliation needs configuration or operator review. No stock is released solely by elapsed time.');process.exitCode=1;}
