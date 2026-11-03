import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {CommerceError} from '../commerce/service.mjs';

const fail=(code,message,status=400)=>{throw new CommerceError(code,message,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const own=(map,id)=>Object.hasOwn(map,id)?map[id]:undefined;
const sources=new Set(['account-preferences','drop-waitlist','newsletter']);
const cleanEmail=value=>{
  if(typeof value!=='string'||value.length>254||!/^\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*$/.test(value))fail('invalid_marketing_email','Enter a valid email address.');
  return value.trim().toLowerCase();
};
function timestamp(now){const date=new Date(now??Date.now());if(!Number.isFinite(date.getTime()))fail('invalid_timestamp','Invalid consent timestamp.');return date.toISOString();}
function maps(state){if(!state.marketingContacts||!state.marketingEvents)throw new Error('Marketing persistence is not configured.');}
function event(state,contact,type,fields,at){const id=randomUUID();state.marketingEvents[id]={id,contactId:contact.id,type,createdAt:at,...fields};}
function preference(contact){return {subscribed:contact?.consent===true&&!contact.suppressedAt,suppressed:Boolean(contact?.suppressedAt)};}

// Read-only: a missing record never means consent. No order/payment path calls this a signup.
export function getMarketingPreference(state,email){maps(state);return preference(own(state.marketingContacts,hash(cleanEmail(email))));}

// Call inside the repository transaction after validating the form/provider identity.
// Source and policyVersion are supplied by the server, not copied from browser fields.
export function recordMarketingConsent(state,{email,consent,source,policyVersion,actorUserId,now}={}){
  maps(state);
  if(typeof consent!=='boolean'||!sources.has(source)||typeof policyVersion!=='string'||!/^[A-Za-z0-9._/-]{1,80}$/.test(policyVersion))fail('invalid_marketing_consent','Choose an explicit email preference.');
  if(actorUserId!==undefined&&(typeof actorUserId!=='string'||actorUserId.length>200))fail('invalid_marketing_actor','Invalid account identity.');
  const address=cleanEmail(email),id=hash(address),at=timestamp(now);
  let contact=own(state.marketingContacts,id);
  if(!contact)contact=state.marketingContacts[id]={id,email:address,consent:false,createdAt:at};
  // An unsubscribed address stays suppressed even when a later signup or purchase occurs.
  // Re-enrollment requires a separate future verified resubscription workflow.
  if(contact.suppressedAt)return preference(contact);
  const fields={source,policyVersion,...(actorUserId?{actorUserId}:{})};
  if(consent){contact.consent=true;contact.consentedAt=at;contact.consentSource=source;contact.policyVersion=policyVersion;event(state,contact,'consent-recorded',fields,at);}
  else {contact.consent=false;contact.suppressedAt=at;contact.suppressionSource=source;event(state,contact,'suppressed',fields,at);}
  return preference(contact);
}

// Server email builders may request a capability; callers must never expose it in logs.
// Store only a SHA-256 digest of 256 random bits. Issuing another link does not revoke older links.
export function issueUnsubscribeToken(state,{email,now}={}){
  maps(state);const contact=own(state.marketingContacts,hash(cleanEmail(email)));
  if(!contact)fail('marketing_contact_missing','Email preferences are unavailable.',404);
  const token=randomBytes(32).toString('base64url'),id='unsubscribe:'+hash(token);
  state.marketingEvents[id]={id,contactId:contact.id,type:'unsubscribe-capability',createdAt:timestamp(now)};
  return token;
}

// GET must only display the confirmation page. An email scanner must never unsubscribe anyone.
// The public POST endpoint must also rate-limit attempts and use a no-referrer confirmation page.
export function unsubscribeWithToken(state,{token,method,confirmed,now}={}){
  maps(state);
  if(method!=='POST')fail('method_not_allowed','Confirm your email preference using POST.',405);
  if(confirmed!==true)fail('confirmation_required','Confirm that you want to unsubscribe.');
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('invalid_unsubscribe','This email preference link is invalid.',404);
  const capability=own(state.marketingEvents,'unsubscribe:'+hash(token));
  const contact=capability?.type==='unsubscribe-capability'&&own(state.marketingContacts,capability.contactId);
  if(!contact)fail('invalid_unsubscribe','This email preference link is invalid.',404);
  if(!contact.suppressedAt){const at=timestamp(now);contact.consent=false;contact.suppressedAt=at;contact.suppressionSource='unsubscribe-link';event(state,contact,'suppressed',{source:'unsubscribe-link'},at);}
  // Idempotent success reveals neither address nor signup/subscription state.
  return {saved:true};
}
