import {randomUUID} from 'node:crypto';
import {authenticate,AuthError} from '../operations/auth.mjs';
import {requireAdmin,requireFreshMfa} from '../operations/permissions.mjs';
import {operationsRuntime} from '../operations/runtime.mjs';
import {consumeLimit} from '../operations/http.mjs';
import {CommerceError} from '../commerce/service.mjs';
import {readBounded} from '../commerce/http.mjs';
import {observeHttp} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';
import {createSetupFileManager} from './file-manager.mjs';

const headers={'Cache-Control':'no-store','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(body,status=200)=>Response.json(body,{status,headers});
export async function setupFilesHttp(request,{env=process.env,runtime=operationsRuntime,auth=authenticate,clientIp='unavailable'}={}){
 const reporter=await serverErrorReporter(env);
 return observeHttp(async()=>{
  let principal,r;
  try{
   const url=new URL(request.url);
   if(!['GET','POST'].includes(request.method))return json({error:'Use GET or POST.'},405);
   if(!env.SITE_ORIGIN||url.origin!==env.SITE_ORIGIN||request.headers.has('Origin')&&request.headers.get('Origin')!==env.SITE_ORIGIN||request.method==='POST'&&request.headers.get('Origin')!==env.SITE_ORIGIN)return json({error:'Request origin rejected.'},403);
   r=await runtime(env);
   if(!await consumeLimit(r.repository,clientIp,'setup-auth',{limit:60}))return json({error:'Too many requests. Try again shortly.'},429);
   principal=await auth(request,{env});requireAdmin(principal);
   if(!await consumeLimit(r.repository,principal.userId,'setup-files',{limit:20}))return json({error:'Too many requests. Try again shortly.'},429);
   const productId=url.searchParams.get('productId');
   if(url.searchParams.getAll('productId').length!==1)return json({error:'Choose one saved setup draft.'},400);
   const manager=createSetupFileManager({repository:r.repository});
   if(request.method==='GET')return json(await manager.read(principal,productId));
   requireFreshMfa(principal);
   if(request.headers.get('Content-Type')?.split(';')[0]!=='application/octet-stream')return json({error:'Upload the .stp file as binary data.'},415);
   let filename,bytes;
   try{filename=decodeURIComponent(request.headers.get('X-Setup-Filename')||'');bytes=await readBounded(request,2*1024*1024);}catch{return json({error:'The file is invalid or larger than 2 MB.'},400);}
   const rawVersion=request.headers.get('X-Product-Version');
   const expectedVersion=/^\d+$/.test(rawVersion||'')?Number(rawVersion):null;
   return json(await manager.attach(principal,{productId,expectedVersion,filename,bytes}));
  }catch(error){
   if(error instanceof AuthError&&principal?.userId&&r){
    await r.repository.transaction(s=>{const id=randomUUID();s.audit[id]={id,actor:principal.userId,action:'authorization-denied',target:'setup-file',createdAt:new Date().toISOString(),metadata:{permission:'administration',code:error.code}};});
   }
   if(error instanceof AuthError||error instanceof CommerceError)return json({error:error.message,code:error.code},error.status);
   throw error;
  }
 },{scope:'setup-files',env,reporter})(request);
}
