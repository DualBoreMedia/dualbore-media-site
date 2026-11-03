import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAdminRelease} from '../scripts/check-admin-release.mjs';
const evidence=['WORKOS_PRODUCTION_VERIFIED','WORKOS_STAFF_MFA_POLICY_VERIFIED','ADMIN_OWNERS_VERIFIED','AUTH_PRODUCTION_VERIFIED','ADMIN_MFA_VERIFIED','STAFF_MFA_VERIFIED','PRODUCTION_DATABASE_VERIFIED','MIGRATIONS_VERIFIED','DATABASE_BACKUP_RESTORE_VERIFIED','SECRETS_SCOPED_VERIFIED','SECURITY_REVIEW_PASSED','REQUIRED_TESTS_PASSED','COVERAGE_THRESHOLDS_PASSED','BROWSER_E2E_VERIFIED','FRONTEND_PRODUCTION_QA_VERIFIED','CODERABBIT_REVIEW_PASSED','GITHUB_CI_VERIFIED','ERROR_MONITORING_VERIFIED','SOURCEMAPS_VERIFIED','CORRELATION_REDACTION_VERIFIED'];
const safe={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://dualboremedia.com',AUTH_PROVIDER:'workos',VITE_AUTH_PROVIDER:'workos',AUTH_ACCESS_MODE:'staff-only',VITE_AUTH_ACCESS_MODE:'staff-only',WORKOS_ENVIRONMENT:'production',WORKOS_API_KEY:'sk_live_syntheticfixture',WORKOS_CLIENT_ID:'client_fixture',WORKOS_COOKIE_PASSWORD:'a-test-only-cookie-password-at-least-32-characters',WORKOS_STAFF_ORGANIZATION_ID:'org_fixture',WORKOS_STAFF_GOOGLE_ENABLED:'true',DATABASE_URL:'postgresql://fixture:fixture@database.example.invalid/clean?sslmode=verify-full',ERROR_MONITORING_ENABLED:'true',VITE_ERROR_MONITORING_ENABLED:'true',SENTRY_DSN:'https://fixture@o1.ingest.sentry.io/1',VITE_SENTRY_DSN:'https://fixture@o1.ingest.sentry.io/1',RELEASE_SHA:'a'.repeat(40),...Object.fromEntries(['PAYMENTS_ENABLED','REFUNDS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED','MARKETING_EMAILS_ENABLED','DROP_WAITLIST_ENABLED'].map(k=>[k,'false'])),...Object.fromEntries(evidence.map(k=>[k,'true']))};
test('admin-only readiness is separate from merchandise legal, Stripe and email activation',()=>{
 assert.deepEqual(checkAdminRelease({env:safe}),{ready:true,blockers:[],level:'admin-only'});
 assert.equal(safe.STRIPE_SECRET_KEY,undefined);assert.equal(safe.RESEND_API_KEY,undefined);assert.equal(safe.OHIO_TAX_REGISTRATION_VERIFIED,undefined);
});
test('every admin release prerequisite fails closed independently and diagnostics never expose values',()=>{
 for(const key of [...evidence,...Object.keys(safe).filter(k=>!evidence.includes(k))]){
  const env={...safe};delete env[key];assert.equal(checkAdminRelease({env}).ready,false,key);
 }
 for(const changes of [{PAYMENTS_ENABLED:'true'},{REFUNDS_ENABLED:'true'},{TRANSACTIONAL_EMAILS_ENABLED:'true'},{MARKETING_EMAILS_ENABLED:'true'},{DROP_WAITLIST_ENABLED:'true'},{SITE_ORIGIN:'http://dualboremedia.com'},{SITE_ORIGIN:'https://evil.example'},{WORKOS_API_KEY:'sk_test_syntheticfixture'},{WORKOS_COOKIE_PASSWORD:'short'},{DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1/dbm_sandbox?sslmode=verify-full'},{DATABASE_URL:'postgresql://fixture:fixture@database.example.invalid/clean?sslmode=disable'},{VITE_AUTH_PROVIDER:'clerk'},{VITE_AUTH_ACCESS_MODE:'customer'},{WORKOS_ENVIRONMENT:'staging'},{COMMERCE_TEST_ENABLED:'true'},{COMMERCE_MOCK:'true'},{STRIPE_SECRET_KEY:'sk_live_not_needed'},{RESEND_API_KEY:'re_not_needed'},{VITE_WORKOS_API_KEY:'must-never-print-this'},{re_synthetic_leaked_name:''}]){
  const result=checkAdminRelease({env:{...safe,...changes}});assert.equal(result.ready,false,JSON.stringify(Object.keys(changes)));assert.ok(!JSON.stringify(result).includes('must-never-print-this'));assert.ok(!JSON.stringify(result).includes('re_synthetic_leaked_name'));
 }
 assert.equal(checkAdminRelease().ready,false);
});
