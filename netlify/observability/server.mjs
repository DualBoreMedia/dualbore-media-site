import {createErrorReporter,structuredLog} from './index.mjs';
let initialized;
// Import once per cold start; never send unless explicitly enabled by server configuration.
export async function serverErrorReporter(env=process.env){
 if(env.ERROR_MONITORING_ENABLED!=='true'||!env.SENTRY_DSN)return {enabled:false,capture:async()=>false};
 if(!initialized)initialized=(async()=>{
  try {const sdk=await import('@sentry/node');return createErrorReporter({sdk,env});}
  catch {structuredLog('monitoring.configuration_failed',{category:'INTERNAL_ERROR'},{env,level:'error'});return {enabled:false,capture:async()=>false};}
 })();
 return initialized;
}
