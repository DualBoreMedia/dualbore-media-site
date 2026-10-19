import {commerceRuntime}from'../commerce/runtime.mjs';import{readBounded}from'../commerce/http.mjs';import{consumeLimit}from'./http.mjs';import{unsubscribeWithToken}from'./marketing.mjs';
import{observeHttp,reportUnexpected,requestContext}from'../observability/index.mjs';import{serverErrorReporter}from'../observability/server.mjs';import{CommerceError}from'../commerce/service.mjs';
export async function marketingHttp(request,{env=process.env,runtime=commerceRuntime,clientIp='unavailable'}={}){
 const reporter=await serverErrorReporter(env);return observeHttp(r=>marketingHandler(r,{env,runtime,clientIp,reporter}),{scope:'marketing',env,reporter})(request);
}
async function marketingHandler(request,{env,runtime,clientIp,reporter}){
 const respond=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return respond({error:'Confirm using the unsubscribe page.'},405);
 if(new URL(request.url).origin!==env.SITE_ORIGIN||request.headers.get('Origin')!==env.SITE_ORIGIN)return respond({error:'Request origin rejected.'},403);
 try{const r=await runtime(env);if(!await consumeLimit(r.repository,clientIp,'unsubscribe',{limit:30}))return respond({error:'Try again shortly.'},429);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return respond({error:'Use JSON.'},415);
  const input=JSON.parse((await readBounded(request,1024)).toString());if(!input||Object.keys(input).sort().join()!=='confirmed,token')return respond({error:'Check the link and confirm your preference.'},400);
  await r.repository.transaction(s=>unsubscribeWithToken(s,{...input,method:'POST'}));return respond({saved:true});
 }catch(error){const expected=error instanceof SyntaxError||error instanceof CommerceError&&error.status<500;if(!expected)await reportUnexpected(error,{scope:'marketing'},{env,reporter});return respond({error:'We could not confirm this preference. Check your link or try again later.',reference:requestContext().requestId},expected?400:503);}
}
