// An allowlist, rather than regex-only scrubbing, keeps customer/provider payloads out.
const token = value => typeof value === 'string' && /^[a-zA-Z0-9_.:/-]{1,120}$/.test(value) && !/(?:sk_|rk_|pk_|whsec_|re_|postgres|bearer|@)/i.test(value) ? value : undefined;
function codeFilename(value){
 if(typeof value!=='string')return undefined;
 let filename=value.split(/[?#]/)[0];
 try {const url=new URL(value);filename=url.origin+url.pathname;}catch{}
 if(filename.length>500||/[@%]|\.\.|(?:sk_|rk_|whsec_|re_)/.test(filename))return undefined;
 // Keep deployed code frames for source maps; never retain arbitrary URLs or personal local paths.
 return /(?:\/assets\/[A-Za-z0-9_.-]+\.js|\/(?:src|netlify)\/[A-Za-z0-9_./-]+\.(?:m?js|jsx|tsx?)|\/var\/task\/[A-Za-z0-9_./-]+\.m?js)$/.test(filename)?filename:undefined;
}
export function safeMetadata(input = {}) {
 const out = {};
 for (const key of ['requestId','scope','route','event','category','errorCode','provider','operation','orderReference','actorRole','environment','release','deployment']) {
  const value = token(input[key]); if (value !== undefined) out[key] = value;
 }
 for (const key of ['status','durationMs','count']) if(Number.isSafeInteger(input[key]) && input[key] >= 0) out[key] = input[key];
 return out;
}
export function normalizeError(error, {provider} = {}) {
 const status = Number.isInteger(error?.status) ? error.status : Number.isInteger(error?.statusCode) ? error.statusCode : 500;
 const code = token(error?.code) || 'unexpected_error';
 const expected = status >= 400 && status < 500 && (!provider || provider==='stripe'&&['card_declined','expired_card','incorrect_cvc','insufficient_funds'].includes(code));
 const category = status === 429 ? 'RATE_LIMIT_ERROR' : status === 401 ? 'AUTH_ERROR' : status === 403 ? 'AUTHORIZATION_ERROR' : status === 409 ? 'CONFLICT_ERROR' : expected ? 'VALIDATION_ERROR' : provider === 'stripe' ? 'PAYMENT_PROVIDER_ERROR' : provider === 'resend' ? 'EMAIL_PROVIDER_ERROR' : provider === 'postgres' ? 'DATABASE_ERROR' : 'INTERNAL_ERROR';
 return {category,errorCode:code,status,expected};
}
export function releaseMetadata(env = {}) {
 return safeMetadata({environment:env.COMMERCE_ENVIRONMENT || env.CONTEXT || 'development',release:env.COMMIT_REF || env.RELEASE_SHA || 'local',deployment:env.DEPLOY_ID});
}
// Sentry attaches ambient request, breadcrumbs and user data. Reconstruct only safe fields.
export function sanitizeMonitoringEvent(event = {}) {
 const out = {level:event.level === 'warning' ? 'warning' : 'error',tags:safeMetadata(event.tags),message:'DualBore application exception'};
 if (/^[a-f0-9]{32}$/.test(event.event_id || '')) out.event_id=event.event_id;
 for(const key of ['release','environment']) {const value=token(event[key]);if(value)out[key]=value;}
 if(event.exception?.values) out.exception={values:event.exception.values.slice(0,5).map(value=>({type:token(value.type)||'Error',value:'Application exception (details redacted)',...(value.stacktrace?{stacktrace:{frames:(value.stacktrace.frames||[]).slice(-50).map(frame=>{
  const filename=codeFilename(frame.filename);
  // Preserve only code paths needed for source-map resolution, never local variables/source context.
  return {...(filename?{filename:filename.slice(0,500)}:{}),...(Number.isInteger(frame.lineno)?{lineno:frame.lineno}:{}),...(Number.isInteger(frame.colno)?{colno:frame.colno}:{}),in_app:frame.in_app===true};
 })}}:{})}))};
 // Sentry debug IDs bind private uploaded source maps to the compiled code without source contents.
 if(event.debug_meta?.images)out.debug_meta={images:event.debug_meta.images.slice(0,50).flatMap(image=>{
  const code_file=codeFilename(image.code_file);return code_file&&/^[a-f0-9-]{36}$/i.test(image.debug_id||'')?[{type:'sourcemap',code_file,debug_id:image.debug_id}]:[];
 })};
 return out;
}
