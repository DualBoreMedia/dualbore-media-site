import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';
import {safeMetadata,normalizeError,releaseMetadata,sanitizeMonitoringEvent} from './safe.mjs';
const storage = new AsyncLocalStorage();
export const requestContext = () => storage.getStore() || {};
export function structuredLog(event, metadata = {}, {level='info',log=console.log,env=process.env} = {}) {
 const row={timestamp:new Date().toISOString(),level:['info','warn','error'].includes(level)?level:'info',...releaseMetadata(env),...safeMetadata(requestContext()),...safeMetadata({...metadata,event})};
 try {log(JSON.stringify(row));} catch { /* Logging must never turn a paid order into a failed response. */ }
 return row.requestId;
}
export function createErrorReporter({sdk,env=process.env,log=console.warn} = {}) {
 if(!sdk || !env.SENTRY_DSN || env.ERROR_MONITORING_ENABLED!=='true') return {enabled:false,capture:async()=>false};
 sdk.init({dsn:env.SENTRY_DSN,...releaseMetadata(env),sendDefaultPii:false,defaultIntegrations:false,tracesSampleRate:0,autoSessionTracking:false,beforeSend:sanitizeMonitoringEvent});
 return {enabled:true,async capture(error,metadata={}) {
  if(normalizeError(error,metadata).expected)return false;
  try {sdk.withScope(scope=>{scope.setTags({...releaseMetadata(env),...safeMetadata(requestContext()),...safeMetadata(metadata)});sdk.captureException(error);});return await sdk.flush(2000);}
  catch {structuredLog('monitoring.delivery_failed',{category:'INTERNAL_ERROR'},{level:'error',env,log});return false;}
 }};
}
export async function reportUnexpected(error,metadata={},options={}) {
 const normalized=normalizeError(error,metadata);
 structuredLog(normalized.expected?'request.rejected':'request.exception',{...metadata,...normalized},{...options,level:normalized.expected?'warn':'error'});
 if(!normalized.expected && options.reporter)await options.reporter.capture(error,metadata);
 return requestContext().requestId;
}
export function observeTask(handler,{scope='background',env=process.env,reporter,log=console.log}={}){
 return async(...args)=>storage.run({requestId:randomUUID(),scope},async()=>{
  try{const result=await handler(...args);structuredLog('task.completed',{scope},{env,log});return result;}
  catch(error){await reportUnexpected(error,{scope},{env,reporter,log});throw new Error('Background task failed. Reference: '+requestContext().requestId);}
 });
}
export function observeHttp(handler,{scope='function',env=process.env,reporter,log=console.log}={}) {
 return async (request,...args)=>{
  // Only trust the hosting platform's correlation header; client-selected IDs are not propagated.
  const platform=env.NETLIFY==='true'?request.headers.get('x-nf-request-id'):null;
  const requestId=platform&&/^[A-Za-z0-9_-]{8,100}$/.test(platform)&&safeMetadata({requestId:platform}).requestId?platform:randomUUID();
  const started=Date.now();
  return storage.run({requestId,scope},async()=>{
   let response;
   try {response=await handler(request,...args);}
   catch(error){await reportUnexpected(error,{scope},{env,reporter,log});response=Response.json({error:'The garage is temporarily unavailable. Please try again.',code:'unavailable',reference:requestId},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
   // Handled server failures are operational signals too, without their private response bodies.
   structuredLog('request.completed',{scope,status:response.status,durationMs:Date.now()-started},{env,log,level:response.status>=500?'error':'info'});
   const headers=new Headers(response.headers);headers.set('X-Request-ID',requestId);
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  });
 };
}
