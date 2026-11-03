import test from 'node:test';
import assert from 'node:assert/strict';
import {getMarketingPreference,recordMarketingConsent,issueUnsubscribeToken,unsubscribeWithToken} from '../netlify/operations/marketing.mjs';
const state=()=>({marketingContacts:{},marketingEvents:{}});
const signup=(s,extra={})=>recordMarketingConsent(s,{email:'member@example.com',consent:true,source:'drop-waitlist',policyVersion:'privacy-2026-10-14',now:'2026-10-14T01:00:00Z',...extra});

test('marketing consent is explicit and records timestamp source policy separately from purchases',()=>{
  const s=state();assert.deepEqual(getMarketingPreference(s,'member@example.com'),{subscribed:false,suppressed:false});
  for(const consent of [undefined,null,1,'true'])assert.throws(()=>signup(s,{consent}),{code:'invalid_marketing_consent'});
  for(const source of ['purchase','checkout','payment',undefined])assert.throws(()=>signup(s,{source}),{code:'invalid_marketing_consent'});
  assert.equal(Object.keys(s.marketingContacts).length,0);
  assert.deepEqual(signup(s),{subscribed:true,suppressed:false});
  const contact=Object.values(s.marketingContacts)[0];assert.equal(contact.consentedAt,'2026-10-14T01:00:00.000Z');assert.equal(contact.consentSource,'drop-waitlist');assert.equal(contact.policyVersion,'privacy-2026-10-14');
  assert.equal(Object.values(s.marketingEvents)[0].type,'consent-recorded');
});
test('verified account opt-out is immediately suppressed and later consent cannot silently resubscribe',()=>{
  const s=state();signup(s);
  assert.deepEqual(signup(s,{consent:false,source:'account-preferences',actorUserId:'user_member'}),{subscribed:false,suppressed:true});
  const before=structuredClone(s);assert.deepEqual(signup(s),{subscribed:false,suppressed:true});assert.deepEqual(s,before);
  assert.deepEqual(getMarketingPreference(s,' MEMBER@EXAMPLE.COM '),{subscribed:false,suppressed:true});
});
test('capability is random, contains no email, persisted only as hash, and requires confirmed POST',()=>{
  const s=state();signup(s);const token=issueUnsubscribeToken(s,{email:'member@example.com'});
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.equal(JSON.stringify(s).includes(token),false);
  const before=structuredClone(s);
  assert.throws(()=>unsubscribeWithToken(s,{token,method:'GET',confirmed:true}),{status:405});
  for(const confirmed of [false,undefined,'true'])assert.throws(()=>unsubscribeWithToken(s,{token,method:'POST',confirmed}),{code:'confirmation_required'});
  assert.deepEqual(s,before);assert.deepEqual(unsubscribeWithToken(s,{token,method:'POST',confirmed:true}),{saved:true});
  assert.equal(getMarketingPreference(s,'member@example.com').suppressed,true);
  const after=structuredClone(s);assert.deepEqual(unsubscribeWithToken(s,{token,method:'POST',confirmed:true}),{saved:true});assert.deepEqual(s,after);
});
test('issuing another capability preserves older links and cannot suppress a different contact',()=>{
  const s=state();signup(s);signup(s,{email:'other@example.com'});
  const first=issueUnsubscribeToken(s,{email:'member@example.com'}),second=issueUnsubscribeToken(s,{email:'member@example.com'});assert.notEqual(first,second);
  unsubscribeWithToken(s,{token:first,method:'POST',confirmed:true});
  assert.equal(getMarketingPreference(s,'member@example.com').suppressed,true);assert.equal(getMarketingPreference(s,'other@example.com').subscribed,true);
  assert.throws(()=>unsubscribeWithToken(s,{token:'A'.repeat(43),method:'POST',confirmed:true}),{code:'invalid_unsubscribe'});
});
test('absence of persistence and malformed email/policy fail closed',()=>{
  assert.throws(()=>signup({}),/persistence/);
  const s=state();for(const email of ['x\r\n@example.com','__proto__','<person@example.com>'])assert.throws(()=>signup(s,{email}),{code:'invalid_marketing_email'});
  assert.throws(()=>signup(s,{policyVersion:''}),{code:'invalid_marketing_consent'});
  assert.equal(Object.keys(s.marketingContacts).length,0);
});
