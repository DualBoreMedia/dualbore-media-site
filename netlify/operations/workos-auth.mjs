import {decodeJwt} from 'jose';
import {AuthError} from './permissions.mjs';
import {allWorkosPages,workosPages} from './workos-pagination.mjs';

export const workosCookie='__Host-dbm-session';
export const cookieName=env=>new URL(env.SITE_ORIGIN).protocol==='https:'?workosCookie:'dbm-local-session';
export function readCookie(request,name){const values=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):null;}
export function workosConfig(env){
 let origin;try{const u=new URL(env.SITE_ORIGIN);if(u.origin!==env.SITE_ORIGIN||u.username||u.password||!(u.protocol==='https:'||env.COMMERCE_ENVIRONMENT!=='production'&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error();origin=u.origin;}catch{throw new AuthError('auth_unavailable','Secure sign-in is not configured yet.',503);}
 if(!env.WORKOS_API_KEY||!/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID||'')||typeof env.WORKOS_COOKIE_PASSWORD!=='string'||env.WORKOS_COOKIE_PASSWORD.length<32)throw new AuthError('auth_unavailable','Secure sign-in is not configured yet.',503);
 return {origin,clientId:env.WORKOS_CLIENT_ID,cookiePassword:env.WORKOS_COOKIE_PASSWORD};
}
export const workosIssuer=env=>'https://api.workos.com/user_management/'+env.WORKOS_CLIENT_ID;
export async function workosClient(env){const {WorkOS}=await import('@workos-inc/node');return new WorkOS(env.WORKOS_API_KEY,{clientId:env.WORKOS_CLIENT_ID,issuer:workosIssuer(env)});}
const denied=()=>{throw new AuthError('sign_in_required','Please sign in again to continue.');};
// Bounded provider pagination must find the exact current record. Failure closes access.
async function findSession(api,userId,id){for await(const rows of workosPages(options=>api.listSessions(userId,{...options,order:'desc'}))){const found=rows.find(s=>s.id===id);if(found)return found;}return null;}
export async function authenticateWorkos(request,{env=process.env,client,now=Date.now()}={}){
 const config=workosConfig(env),url=new URL(request.url);
 if(url.origin!==config.origin||request.headers.has('Origin')&&request.headers.get('Origin')!==config.origin)throw new AuthError('origin_rejected','Open your account on the DualBore Media website.',403);
 // Cookie writes require a browser Origin. No JWT supplied by a customer can override this session.
 if(request.method!=='GET'&&request.headers.get('Origin')!==config.origin)throw new AuthError('origin_rejected','Refresh the page before saving.',403);
 const sealed=readCookie(request,cookieName(env));if(!sealed||sealed.length>16000)denied();
 try{
  const c=client||await workosClient(env),api=c.userManagement;
  const verified=await api.loadSealedSession({sessionData:sealed,cookiePassword:config.cookiePassword}).authenticate();
  if(!verified.authenticated||verified.impersonator||!verified.user?.id||!verified.sessionId)denied();
  // decodeJwt follows the SDK signature/issuer/expiry verification, never replaces it.
  const claims=decodeJwt(verified.accessToken);
  if(claims.sub!==verified.user.id||claims.sid!==verified.sessionId||claims.iss!==workosIssuer(env)||!Number.isFinite(claims.exp)||claims.exp*1000<=now)denied();
  const [user,session,memberships]=await Promise.all([api.getUser(claims.sub),findSession(api,claims.sub,claims.sid),env.WORKOS_STAFF_ORGANIZATION_ID?allWorkosPages(options=>api.listOrganizationMemberships({organizationId:env.WORKOS_STAFF_ORGANIZATION_ID,userId:claims.sub,...options})):Promise.resolve([])]);
  if(user.id!==claims.sub||!session||session.userId!==user.id||session.status!=='active'||session.impersonator||!Number.isFinite(Date.parse(session.expiresAt))||Date.parse(session.expiresAt)<=now)denied();
  if(!user.emailVerified||typeof user.email!=='string'||!user.email.includes('@'))throw new AuthError('email_verification_required','Verify your email before accessing orders.',403);
  const active=memberships.filter(m=>m.userId===user.id&&m.organizationId===env.WORKOS_STAFF_ORGANIZATION_ID&&m.status==='active');
  if(active.length>1)denied();
  const member=active[0],role=['employee','admin'].includes(member?.role?.slug)?member.role.slug:'customer';
  let mfa=false,mfaEnrolled=false;
  if(role!=='customer'){
   const factors=await c.multiFactorAuth.listUserAuthFactors({userId:user.id});
   mfaEnrolled=factors.data.some(f=>f.userId===user.id&&f.type==='totp');
   // WorkOS has no documented policy-read API. This evidence switch MUST stay false
   // until the staff org's Require MFA policy and no-SSO setup pass real QA.
   // Organization-scoped auth, a fresh active password authentication and current
   // enrollment are all required; enrollment alone never grants privileged access.
   mfa=env.WORKOS_STAFF_MFA_POLICY_VERIFIED==='true'&&mfaEnrolled&&claims.org_id===env.WORKOS_STAFF_ORGANIZATION_ID&&session.organizationId===claims.org_id&&session.authMethod==='password'&&verified.authenticationMethod==='Password'&&Number.isFinite(claims.auth_time)&&claims.auth_time*1000<=now&&now-claims.auth_time*1000<=600000;
  }
  return Object.freeze({userId:'workos:'+user.id,sessionId:session.id,email:user.email.trim().toLowerCase(),displayName:[user.firstName,user.lastName].filter(x=>typeof x==='string').join(' ').slice(0,160),role,admin:role==='admin',mfa,mfaEnrolled});
 }catch(error){if(error instanceof AuthError)throw error;if([401,403,404].includes(error?.status))denied();throw new AuthError('auth_unavailable','Account access is temporarily unavailable.',503);}
}
