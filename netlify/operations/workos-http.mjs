import {createHash} from 'node:crypto';
import {EncryptJWT,jwtDecrypt,errors} from 'jose';
import pg from 'pg';
import {createPostgresRepository} from '../commerce/repository.mjs';
import {authenticateWorkos,cookieName,readCookie,workosConfig,workosClient} from './workos-auth.mjs';
import {observeHttp,reportUnexpected} from '../observability/index.mjs';
import {serverErrorReporter} from '../observability/server.mjs';
import {AuthError,requireStaff} from './permissions.mjs';
const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const json=(body,status=200)=>Response.json(body,{status,headers:security});
const pools=new Map();
function repositoryFor(env){if(!env.DATABASE_URL)throw Error('Missing database');if(!pools.has(env.DATABASE_URL))pools.set(env.DATABASE_URL,new pg.Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:5000}));return createPostgresRepository(pools.get(env.DATABASE_URL));}
const cookie=(name,value,env,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(env.SITE_ORIGIN).protocol==='https:'?'; Secure':''}`;
const statePrefix=env=>new URL(env.SITE_ORIGIN).protocol==='https:'?'__Host-dbm-oauth-':'dbm-local-oauth-';
const stateCookie=(env,state)=>statePrefix(env)+createHash('sha256').update(state).digest('hex').slice(0,24);
export function safeAuthDestination(value,fallback='/account'){
 try{const url=new URL(value,'https://return.invalid');if(url.origin!=='https://return.invalid'||!['/account','/staff','/admin'].includes(url.pathname)||url.hash||[...url.searchParams].some(([key,v])=>key!=='view'||!['overview','orders','products','inventory','activity','support','employees','shipments','profile','help'].includes(v))||url.searchParams.getAll('view').length>1)return fallback;return url.pathname+url.search;}catch{return fallback;}
}
const redirect=(url,cookies=[])=>{const headers=new Headers(security);headers.set('Location',url);for(const value of cookies)headers.append('Set-Cookie',value);return new Response(null,{status:303,headers});};
async function limit(repository,key,now){const id=createHash('sha256').update('workos:'+key).digest('hex');if(typeof repository.consumeRateLimit==='function')return repository.consumeRateLimit(id,{limit:20,windowMs:60000,now});return repository.transaction(s=>{for(const[k,v]of Object.entries(s.limits))if(v.expiresAt<=now)delete s.limits[k];const row=s.limits[id]??={id,count:0,expiresAt:now+60000};return ++row.count<=20;});}
async function handleWorkos(request,{env=process.env,client,repository,clientIp='unavailable',now=Date.now(),reporter,log}={}){
 let callback=false,callbackCookie,returnTo='/account';
 try{
  if(env.AUTH_PROVIDER!=='workos')return json({error:'Secure sign-in is unavailable.'},503);
  const config=workosConfig(env),url=new URL(request.url),action=url.pathname.split('/').at(-1);
  if(url.origin!==config.origin||request.headers.has('Origin')&&request.headers.get('Origin')!==config.origin||request.method==='POST'&&request.headers.get('Origin')!==config.origin)return json({error:'Request origin rejected.'},403);
  const methods={'sign-in':'GET',callback:'GET',session:'GET',refresh:'POST',logout:'POST'};
  if(!Object.hasOwn(methods,action)||url.pathname!=='/api/auth/'+action)return json({error:'Not found.'},404);
  if(request.method!==methods[action])return new Response(null,{status:405,headers:{...security,Allow:methods[action]}});
  callback=request.method==='GET'&&action==='callback';
  if(env.AUTH_ACCESS_MODE==='staff-only'&&action==='sign-in'&&(url.searchParams.get('staff')!=='1'||url.searchParams.has('signup')))return json({error:'Customer accounts are not open yet.',code:'accounts_closed'},403);
  repository||=repositoryFor(env);if(!await limit(repository,clientIp,now))return json({error:'Too many attempts. Try again shortly.'},429);
  if(!client)client=await workosClient(env);
  const api=client.userManagement;
  if(request.method==='GET'&&action==='sign-in'){
   const staff=url.searchParams.get('staff')==='1';if(staff&&!env.WORKOS_STAFF_ORGANIZATION_ID)return json({error:'Staff sign-in is not configured.'},503);
   const pending=(request.headers.get('Cookie')||'').split(';').filter(value=>value.trim().startsWith(statePrefix(env))).length;
   if(pending>=5)return json({error:'Finish an open sign-in tab or wait thirty minutes before starting another.',code:'too_many_sign_ins'},429);
   returnTo=safeAuthDestination(url.searchParams.get('returnTo'),staff?'/staff':'/account');
   if(env.AUTH_ACCESS_MODE==='staff-only'&&returnTo.split('?')[0]==='/account')returnTo='/admin';
   if(!staff&&returnTo.split('?')[0]!=='/account')returnTo='/account';
   const pkce=await api.getAuthorizationUrlWithPKCE({provider:'authkit',clientId:config.clientId,redirectUri:config.origin+'/api/auth/callback',...(staff?{organizationId:env.WORKOS_STAFF_ORGANIZATION_ID}:{}),...(staff&&url.searchParams.get('step_up')==='1'?{maxAge:0}:{}),screenHint:url.searchParams.get('signup')==='1'?'sign-up':'sign-in'});
   const key=createHash('sha256').update(config.cookiePassword).digest();
   const sealed=await new EncryptJWT({state:pkce.state,verifier:pkce.codeVerifier,returnTo}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuedAt().setExpirationTime('10m').setAudience('dbm-oauth').setIssuer(config.origin).encrypt(key);
   // Retain the encrypted destination briefly after state expiry for recovery only.
   // Code exchange still requires the JWT's original ten-minute lifetime.
   return redirect(pkce.url,[cookie(stateCookie(env,pkce.state),sealed,env,1800)]);
  }
  if(request.method==='GET'&&action==='callback'){
   const invalidState=()=>{throw new AuthError('invalid_auth_state','Sign-in could not be verified. Please try again.',400);};
   const requestedState=url.searchParams.get('state');if(!requestedState||requestedState.length>512)invalidState();callbackCookie=stateCookie(env,requestedState);
   const state=readCookie(request,callbackCookie);if(!state||!url.searchParams.get('code'))invalidState();
   let payload;try{({payload}=await jwtDecrypt(state,createHash('sha256').update(config.cookiePassword).digest(),{issuer:config.origin,audience:'dbm-oauth',currentDate:new Date(now)}));}catch(error){
    // jose authenticates/decrypts and checks issuer/audience before exp. An
    // expired payload may select a safe recovery page, never authorize exchange.
    if(error instanceof errors.JWTExpired&&error.payload?.state===requestedState)returnTo=safeAuthDestination(error.payload.returnTo);
    invalidState();
   }
   if(payload.state!==url.searchParams.get('state')||typeof payload.verifier!=='string')invalidState();
   returnTo=safeAuthDestination(payload.returnTo);
   if(env.AUTH_ACCESS_MODE==='staff-only'&&returnTo.split('?')[0]==='/account')invalidState();
   const id=createHash('sha256').update('oauth-used:'+payload.state).digest('hex');
   const fresh=await repository.transaction(s=>{if(s.limits[id])return false;s.limits[id]={id,count:1,expiresAt:now+600000};return true;});if(!fresh)invalidState();
   const result=await api.authenticateWithCode({clientId:config.clientId,code:url.searchParams.get('code'),codeVerifier:payload.verifier,session:{sealSession:true,cookiePassword:config.cookiePassword}});
   if(!result.sealedSession||result.impersonator)throw Error('Missing session');
   return redirect(returnTo,[cookie(callbackCookie,'',env,0),cookie(cookieName(env),result.sealedSession,env,86400)]);
  }
  if(request.method==='POST'&&action==='refresh'){
   const sealed=readCookie(request,cookieName(env));if(!sealed)return json({error:'Please sign in again.'},401);
   const refreshed=await api.loadSealedSession({sessionData:sealed,cookiePassword:config.cookiePassword}).refresh();
   if(!refreshed.authenticated||!refreshed.sealedSession){
    if(refreshed.retryable===true)return json({error:'Sign-in refresh is temporarily unavailable. Your session has been kept. Try again shortly.',code:'auth_refresh_unavailable'},503);
    const response=json({error:'Please sign in again.',code:'sign_in_required'},401);response.headers.append('Set-Cookie',cookie(cookieName(env),'',env,0));return response;
   }
   const response=json({ok:true});response.headers.append('Set-Cookie',cookie(cookieName(env),refreshed.sealedSession,env,86400));return response;
  }
  if(request.method==='GET'&&action==='session'){
   const principal=await authenticateWorkos(request,{env,client,now});
   if(env.AUTH_ACCESS_MODE==='staff-only')requireStaff(principal);
   return json({signedIn:true,user:{id:principal.userId,firstName:principal.displayName},mfa:principal.mfa,mfaFresh:principal.mfaFresh});
  }
  if(request.method==='POST'&&action==='logout'){
   const principal=await authenticateWorkos(request,{env,client,now});await api.revokeSession({sessionId:principal.sessionId});
   const response=json({ok:true});response.headers.append('Set-Cookie',cookie(cookieName(env),'',env,0));return response;
  }
  return json({error:'Not found.'},404);
 }catch(error){await reportUnexpected(error,{scope:'auth'},{env,reporter,log});if(callback)return redirect(returnTo+(returnTo.includes('?')?'&':'?')+'auth='+(error?.code==='invalid_auth_state'?'state_expired':'provider_unavailable'),callbackCookie?[cookie(callbackCookie,'',env,0)]:[]);if(error?.code==='sign_in_required'||error?.code==='email_verification_required')return json({error:'Please sign in with a verified email.',code:error.code},401);return json({error:'Secure sign-in is temporarily unavailable. Try again shortly.',code:'auth_unavailable'},503);}
}
export async function workosHttp(request,options={}){const env=options.env||process.env,reporter=options.reporter||await serverErrorReporter(env);return observeHttp(req=>handleWorkos(req,{...options,env,reporter}),{scope:'auth',env,reporter,log:options.log})(request);}
