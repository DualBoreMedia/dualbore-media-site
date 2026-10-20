import {inventoryPolicy,madeToOrder,publicAvailableQuantity} from './inventory.mjs';
import {commerceRuntime,loopback,hostedEnvironment} from './runtime.mjs';
import {CommerceError} from './service.mjs';
import {operationLog} from '../operations/log.mjs';
import {observeHttp,reportUnexpected,requestContext} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';
import {workosCookie,readCookie} from '../operations/workos-auth.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(body,status=200)=>Response.json(body,{status,headers});
export async function readBounded(request,max=8192){let length=0;const chunks=[];const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw new CommerceError('too_large','Request too large.',413);}chunks.push(value);}return Buffer.concat(chunks);}
export async function commerceHttp(request,{env=process.env,runtime=commerceRuntime,clientIp='unavailable'}={}){
 const reporter=await serverErrorReporter(env);
 return observeHttp(r=>commerceHandler(r,{env,runtime,clientIp,reporter}),{scope:'commerce',env,reporter})(request);
}
async function commerceHandler(request,{env,runtime,clientIp,reporter}){
 const url=new URL(request.url),route=url.pathname.split('/').at(-1);
 const live=env.COMMERCE_ENVIRONMENT==='production';
 if(live&&(url.origin!==env.SITE_ORIGIN||url.protocol!=='https:'))return json({error:'Not available.'},404);
 if(!live&&(hostedEnvironment(env)||!loopback(request.url)||env.COMMERCE_TEST_ENABLED!=='true'))return route==='config'?json({enabled:false,mode:'test',reason:'Test checkout is not configured.',shippingCents:700}):json({error:'Not available.'},404);
 try{
  if(route==='config'){
   if(request.method!=='GET')return json({error:'Use GET.'},405);
   if(live&&env.PAYMENTS_ENABLED!=='true')return json({enabled:false,mode:'production',reason:'Orders are not open yet.'});
   try{const r=await runtime(env);return json({enabled:true,mode:live?'production':'test',shippingCents:Number(live?env.SHIPPING_RATE_CENTS:env.TEST_SHIPPING_RATE_CENTS||700),mock:r.mock});}catch{return json({enabled:false,mode:live?'production':'test',shippingCents:700,reason:'The store is not configured yet.'});}
  }
  const r=await runtime(env);
  if(route==='catalog'){
   if(request.method!=='GET')return json({error:'Use GET.'},405);
   if(!live||env.PAYMENTS_ENABLED!=='true'||env.LIVE_CATALOG_APPROVED!=='true')return json({enabled:false,variants:[]});
   const variants=await r.repository.transaction(s=>Object.values(s.variants).filter(v=>v.active&&v.liveStripePriceId&&Number.isSafeInteger(v.productionPriceCents)&&v.productionPriceCents>0).map(v=>({id:v.id,productId:v.productId,name:v.name,size:v.size,sku:v.sku,unitAmount:v.productionPriceCents,inventoryPolicy:inventoryPolicy(v),availableQuantity:publicAvailableQuantity(v),available:madeToOrder(v)||v.availableQuantity>0})));
   return json({enabled:true,mode:'production',shippingCents:Number(env.SHIPPING_RATE_CENTS),variants});
  }
  if(route==='webhook'){
   if(request.method!=='POST')return json({error:'Use POST.'},405);
   if(!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')||r.mock||!r.stripe)return json({error:'Webhook is not configured.'},503);
   let event;try{event=r.stripe.webhooks.constructEvent(await readBounded(request,262144),request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET);}catch{return json({error:'Invalid webhook signature.'},400);}
   try{return json(await r.service.webhook(event));}catch(error){
    operationLog('webhook',error instanceof CommerceError?error.code:'unavailable',{eventId:event?.id,status:error.status||503});
    if(event?.livemode===live&&/^evt_[A-Za-z0-9_]+$/.test(event.id||''))try{await r.repository.transaction(s=>{if(s.events[event.id]?.status!=='processed')s.events[event.id]={id:event.id,type:String(event.type).slice(0,100),status:'failed',createdAt:new Date().toISOString(),lastError:error instanceof CommerceError?error.code:'processing-unavailable'};});}catch{}
    throw error;
   }
  }
  if(route==='order'){
   if(request.method!=='GET')return json({error:'Use GET.'},405);
   const {consumeLimit}=await import('../operations/http.mjs');if(!await consumeLimit(r.repository,clientIp,'order-lookup',{limit:120}))return json({error:'Too many requests. Try again shortly.',code:'rate_limited'},429);
   const result=await r.service.status(url.searchParams.get('session_id'),request.headers.get('X-Order-Token'));
   result.mock=r.mock===true;result.status=({checkout_pending:'pending',payment_pending:'pending',payment_failed:'failed'})[result.status]||result.status;return json(result);
  }
  if(route==='simulate'){
   if(!r.mock||env.COMMERCE_MOCK!=='true')return json({error:'Not available.'},404);
   if(request.method!=='POST')return json({error:'Use POST.'},405);
   if(request.headers.get('Origin')!==url.origin)return json({error:'Request origin rejected.'},403);
   let input;try{input=JSON.parse((await readBounded(request)).toString('utf8'));}catch{return json({error:'Invalid simulation.'},400);}
   if(!input||Object.keys(input).length!==2||!['paid','pending','failed','expired'].includes(input.action))return json({error:'Invalid simulation.'},400);
   await r.service.status(input.sessionId,request.headers.get('X-Order-Token'));
   const session=await r.stripe.checkout.sessions.retrieve(input.sessionId);if(!session)return json({error:'Mock session unavailable after restart. Start a new local simulation.'},409);
   const types={paid:'checkout.session.completed',pending:'checkout.session.completed',failed:'checkout.session.async_payment_failed',expired:'checkout.session.expired'};
   session.payment_status=input.action==='paid'?'paid':'unpaid';session.status=input.action==='expired'?'expired':'complete';
   session.customer_details={email:'synthetic-customer@example.invalid'};
   session.collected_information={shipping_details:{name:'Synthetic Test Customer',address:{line1:'123 Example Street',city:'Example',state:'OH',postal_code:'00000',country:'US'}}};
   await r.service.webhook({id:'evt_mock_'+input.sessionId+'_'+input.action,type:types[input.action],livemode:false,data:{object:session}});
   return json({simulated:true});
  }
  if(route==='checkout'){
   if(live&&env.PAYMENTS_ENABLED!=='true')return json({error:'Orders are not open yet. Your cart is saved.',code:'payments_disabled'},503);
   if(request.method!=='POST')return json({error:'Use POST.'},405);
   if(request.headers.get('Origin')!==url.origin)return json({error:'Request origin rejected.'},403);
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Use JSON.'},415);
   let input;try{input=JSON.parse((await readBounded(request)).toString('utf8'));}catch(e){if(e instanceof CommerceError)throw e;return json({error:'Invalid JSON.'},400);}
   const {consumeLimit}=await import('../operations/http.mjs');
   if(!await consumeLimit(r.repository,clientIp,'checkout-ip',{limit:30}))return json({error:'Too many checkout attempts. Wait a moment and try again.',code:'rate_limited'},429);
   if(!await consumeLimit(r.repository,request.headers.get('Idempotency-Key')||'missing-key','checkout-request',{limit:12}))return json({error:'Too many checkout attempts. Wait a moment and try again.',code:'rate_limited'},429);
   let customer;if(request.headers.has('Authorization')||env.AUTH_PROVIDER==='workos'&&(readCookie(request,workosCookie)||readCookie(request,'dbm-local-session'))){const {authenticate}=await import('../operations/auth.mjs');try{customer=await authenticate(request,{env});}catch{return json({error:'Sign in again with a verified email or use guest checkout.',code:'sign_in_required'},401);}}
   return json({...await r.service.checkout(input,{requestKey:request.headers.get('Idempotency-Key'),quoteToken:request.headers.get('X-Cart-Quote'),customer}),mock:r.mock===true});
  }
  return json({error:'Not found.'},404);
 }catch(e){await reportUnexpected(e,{scope:'commerce'},{env,reporter});return json({error:e instanceof CommerceError?e.message:'The garage store is temporarily unavailable. Your cart is saved.',code:e instanceof CommerceError?e.code:'unavailable',reference:requestContext().requestId,...(e instanceof CommerceError?e.details:{})},e instanceof CommerceError?e.status:503);}
}
