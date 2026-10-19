import {createHash} from 'node:crypto';
import {authenticate,AuthError} from './auth.mjs';
import {createOperationsService} from './service.mjs';
import {commerceRuntime} from '../commerce/runtime.mjs';
import {CommerceError} from '../commerce/service.mjs';
import {readBounded} from '../commerce/http.mjs';
import {createStaffManagement} from './staff-management.mjs';
import {observeHttp,reportUnexpected,requestContext} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';
const headers={'Cache-Control':'no-store','Vary':'Authorization, Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(body,status=200)=>Response.json(body,{status,headers});
export async function consumeLimit(repository,identity,scope,{limit=60,windowMs=60000,now=Date.now()}={}){
 const id=createHash('sha256').update(`${scope}:${identity}`).digest('hex');
 return repository.transaction(s=>{for(const [key,row]of Object.entries(s.limits))if(row.expiresAt<=now)delete s.limits[key];const row=s.limits[id]??={id,count:0,expiresAt:now+windowMs};row.count++;return row.count<=limit;});
}
export async function operationsHttp(request,{env=process.env,runtime=commerceRuntime,auth=authenticate,clientIp='unavailable',clerkClient}={}){
 const reporter=await serverErrorReporter(env);
 return observeHttp(r=>operationsHandler(r,{env,runtime,auth,clientIp,clerkClient,reporter}),{scope:'operations',env,reporter})(request);
}
async function operationsHandler(request,{env,runtime,auth,clientIp,clerkClient,reporter}){
 try {
  if(!['GET','POST'].includes(request.method))return json({error:'Use GET or POST.'},405);
  const url=new URL(request.url);
  if(!env.SITE_ORIGIN||url.origin!==env.SITE_ORIGIN||request.headers.has('Origin')&&request.headers.get('Origin')!==env.SITE_ORIGIN)return json({error:'Request origin rejected.'},403);
  const r=await runtime(env);
  if(!await consumeLimit(r.repository,clientIp,'auth-attempt',{limit:90}))return json({error:'Too many requests. Try again shortly.'},429);
  const principal=await auth(request,{env});
  const admin=url.searchParams.get('admin')==='true';
  const staff=url.searchParams.get('staff')==='true';
  if(!await consumeLimit(r.repository,principal.userId,request.method==='POST'?'write':'read',{limit:request.method==='POST'?30:90}))return json({error:'Too many requests. Try again shortly.'},429);
  const service=createOperationsService({repository:r.repository,stripe:r.stripe,env});
  if(request.method==='GET'&&url.searchParams.get('staffManagement')==='true')return json(await createStaffManagement({repository:r.repository,env,client:clerkClient}).read(principal,{search:url.searchParams.get('search')||'',page:url.searchParams.get('page')||1}));
  if(request.method==='GET')return json(await service.read(principal,{admin,staff,...Object.fromEntries([...url.searchParams].filter(([key])=>['orderNumber','search','page','status','fulfillmentStatus','customer','dateFrom','dateTo','sort','shipmentStatus'].includes(key)))}));
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return json({error:'Use JSON.'},415);
  let input;try{input=JSON.parse((await readBounded(request,16384)).toString('utf8'));}catch{return json({error:'Check the information and try again.'},400);}
  if(typeof input?.action==='string'&&input.action.startsWith('staff-'))return json(await createStaffManagement({repository:r.repository,env,client:clerkClient}).mutate(principal,input));
  return json(await service.mutate(principal,input));
 }catch(error){
  await reportUnexpected(error,{scope:'operations'},{env,reporter});
  if(env.AUTH_PROVIDER==='clerk'&&error instanceof AuthError&&error.reverify){const {reverificationErrorResponse}=await import('@clerk/shared/authorization-errors');const response=reverificationErrorResponse('strict_mfa');for(const[k,v]of Object.entries(headers))response.headers.set(k,v);return response;}
  return json({error:error instanceof AuthError||error instanceof CommerceError?error.message:'The garage is temporarily unavailable. Your changes were not confirmed.',code:error instanceof AuthError||error instanceof CommerceError?error.code:'unavailable',reference:requestContext().requestId},error instanceof AuthError||error instanceof CommerceError?error.status:503);
 }
}
