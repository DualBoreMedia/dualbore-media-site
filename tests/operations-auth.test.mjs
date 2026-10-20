import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticate, requireAdmin,requireStaff} from '../netlify/operations/auth.mjs';

const env = {SITE_ORIGIN: 'https://garage.example', CLERK_SECRET_KEY: 'test-secret-not-a-key', CLERK_PUBLISHABLE_KEY: 'test-public-not-a-key'};
const request = (headers = {}) => new Request('https://garage.example/api/operations/me', {headers: {Authorization: 'Bearer signed.session.token', ...headers}});
function fixture() {
  const auth = {userId: 'user_a', sessionId: 'sess_a', sessionClaims: {azp: env.SITE_ORIGIN}, factorVerificationAge: [1, 1]};
  const user = {id: 'user_a', firstName: 'Garage', lastName: 'Member', primaryEmailAddressId: 'email_a',
    emailAddresses: [{id: 'email_a', emailAddress: 'Member@Example.com', verification: {status: 'verified'}}],
    privateMetadata: {}, twoFactorEnabled: true};
  const session = {id: 'sess_a', userId: 'user_a', status: 'active', expireAt: Date.now() + 60000};
  const calls = [];
  const client = {
    authenticateRequest: async (req, options) => {calls.push({req, options}); return {isAuthenticated: true, tokenType: 'session_token', toAuth: () => auth};},
    sessions: {getSession: async id => {assert.equal(id, 'sess_a'); return session;}},
    users: {getUser: async id => {assert.equal(id, 'user_a'); return user;}}
  };
  return {auth, user, session, client, calls};
}
const authenticateWith = f => authenticate(request(), {env, client: f.client});

test('production markers never select legacy Clerk or infer an authentication provider', async () => {
  for (const marker of ['COMMERCE_ENVIRONMENT', 'CONTEXT', 'NODE_ENV']) {
    for (const provider of [undefined, 'clerk', 'unknown']) {
      const f = fixture();
      await assert.rejects(authenticate(request(), {env: {...env, [marker]: 'production', AUTH_PROVIDER: provider}, client: f.client}), {code: 'auth_unavailable', status: 503});
      assert.equal(f.calls.length, 0, 'legacy verification must not be attempted');
    }
  }
});

test('managed auth verifies Bearer, authorized party and current user/session on every request', async () => {
  const f = fixture();
  const identity = await authenticate(request({Cookie: '__session=forged'}), {env, client: f.client});
  assert.deepEqual(identity, {userId: 'user_a', sessionId: 'sess_a', email: 'member@example.com', displayName: 'Garage Member', role: 'customer', admin: false, mfa: true, mfaEnrolled:true});
  assert.equal(f.calls[0].req.headers.has('Cookie'), false);
  assert.deepEqual(f.calls[0].options, {authorizedParties: [env.SITE_ORIGIN], acceptsToken: 'session_token'});
  f.session.status = 'revoked';
  await assert.rejects(authenticateWith(f), {code: 'sign_in_required', status: 401});
});
test('missing configuration, cookies only, forged token and wrong origins fail closed', async () => {
  await assert.rejects(authenticate(request(), {env: {}}), {code: 'auth_unavailable', status: 503});
  const f = fixture();
  await assert.rejects(authenticate(new Request('https://garage.example/api', {headers: {Cookie: '__session=forged'}}), {env, client: f.client}), {status: 401});
  await assert.rejects(authenticate(request({Origin: 'https://attacker.example'}), {env, client: f.client}), {code: 'origin_rejected'});
  f.auth.sessionClaims.azp = 'https://attacker.example';
  await assert.rejects(authenticateWith(f), {status: 401});
  f.client.authenticateRequest = async () => ({isAuthenticated: false});
  await assert.rejects(authenticateWith(f), {status: 401});
});
test('expired, mismatched, deleted, banned, locked and impersonated accounts are rejected', async () => {
  for (const mutate of [
    f => {f.session.expireAt = Date.now() - 1;}, f => {f.session.userId = 'user_b';},
    f => {f.session.id = 'sess_b';}, f => {f.user.deleted = true;}, f => {f.user.banned = true;},
    f => {f.user.locked = true;}, f => {f.auth.actor = {sub: 'admin'};}, f => {f.session.actor = {sub: 'admin'};}
  ]) {const f = fixture(); mutate(f); await assert.rejects(authenticateWith(f), {status: 401});}
  const f = fixture(); f.client.users.getUser = async () => {throw {status: 404};};
  await assert.rejects(authenticateWith(f), {status: 401});
});
test('verified primary email is mandatory, secondary verified address cannot override it', async () => {
  const f = fixture(); f.user.emailAddresses[0].verification.status = 'unverified';
  f.user.emailAddresses.push({id: 'email_b', emailAddress: 'verified@example.com', verification: {status: 'verified'}});
  await assert.rejects(authenticateWith(f), {code: 'email_verification_required', status: 403});
});
test('admin role cannot originate from public/unsafe metadata or token claims', async () => {
  const f = fixture(); f.user.publicMetadata = {role: 'admin'}; f.user.unsafeMetadata = {role: 'admin'}; f.auth.sessionClaims.role = 'admin';
  assert.throws(() => requireAdmin({admin: false, mfa: true, mfaEnrolled:true}), {code: 'admin_required'});
  assert.equal((await authenticateWith(f)).admin, false);
  f.user.privateMetadata.role = 'admin';
  assert.equal(requireAdmin(await authenticateWith(f)).admin, true);
});
test('administrators require enrolled MFA and recently verified second factor, without downgrade', async () => {
  for (const age of [-1, 11, undefined, NaN]) {
    const f = fixture(); f.user.privateMetadata.role = 'admin'; f.auth.factorVerificationAge = [0, age];
    assert.throws(() => requireAdmin({admin: true, mfa: false}), {code: 'mfa_required'});
    const identity = await authenticateWith(f); assert.equal(identity.mfa, false); assert.throws(() => requireAdmin(identity), {status: 403});
  }
  const f = fixture(); f.user.twoFactorEnabled = false;
  assert.equal((await authenticateWith(f)).mfa, false);
});
test('provider failure is sanitized and never grants account access', async () => {
  const f = fixture(); f.client.sessions.getSession = async () => {throw new Error('secret token and customer address');};
  await assert.rejects(authenticateWith(f), error => error.code === 'auth_unavailable' && !error.message.includes('secret'));
});
test('employee role is fresh private metadata, revoked employees lose access, and MFA applies to all staff',async()=>{
 const f=fixture();f.user.privateMetadata.role='employee';assert.equal(requireStaff(await authenticateWith(f)).role,'employee');
 f.user.privateMetadata.role='customer';f.user.publicMetadata={role:'employee'};f.auth.sessionClaims.role='admin';assert.throws(()=>requireStaff({role:'customer',admin:true,mfa:true}),{code:'staff_required'});const revoked=await authenticateWith(f);assert.throws(()=>requireStaff(revoked),{code:'staff_required'});
 f.user.privateMetadata.role='employee';f.auth.factorVerificationAge=[0,11];const stale=await authenticateWith(f);assert.throws(()=>requireStaff(stale),{code:'mfa_required'});
});
