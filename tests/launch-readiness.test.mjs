import test from 'node:test';
import assert from 'node:assert/strict';
import {checkLaunch,requiredDeclarations,runLaunchCheck} from '../scripts/check-launch.mjs';
const calendar=JSON.stringify({timeZone:'America/New_York',weekdays:[1,2,3,4,5],holidays:[],reviewedThrough:'2027-12-31'});
const configuration={now:()=>Date.parse('2026-10-13T12:00:00Z'),policyText:'Final approved customer policies.',catalogText:'Reviewed catalog.',declarations:requiredDeclarations.map(name=>`${name}=`).join('\n'),env:{SHIPPING_CALENDAR_APPROVED:'true',SHIPPING_BUSINESS_CALENDAR:calendar,FULFILLMENT_CAPACITY_VERIFIED:'true',SHIPPING_DELAY_WORKFLOW_VERIFIED:'true',BUSINESS_ADDRESS_CONFIRMED:'true',APPAREL_LABELS_VERIFIED:'true',ARTWORK_RIGHTS_VERIFIED:'true',STRIPE_SECRET_KEY:'sk_live_placeholder-for-test',STRIPE_WEBHOOK_SECRET:'mock',DATABASE_URL:'postgresql://mock',RESEND_API_KEY:'mock',RESEND_FROM:'orders@business.org',STORE_COUNTRY:'US',STORE_CURRENCY:'usd',SHIPPING_RATE_CENTS:'995',SHIPPING_CONFIGURATION_APPROVED:'true',BUSINESS_LEGAL_NAME:'Reviewed Company',BUSINESS_POSTAL_ADDRESS:'Reviewed postal address',SUPPORT_EMAIL:'support@business.org',POLICIES_APPROVED:'true',LIVE_CATALOG_APPROVED:'true',TAX_CONFIGURATION_APPROVED:'true',RESEND_DOMAIN_VERIFIED:'true',RESEND_REPLY_TO:'support@business.org',AUTH_PROVIDER:'workos',WORKOS_API_KEY:'fixture-server-key',WORKOS_CLIENT_ID:'client_fixture',WORKOS_COOKIE_PASSWORD:'fixture-only-32-character-session-secret',WORKOS_STAFF_ORGANIZATION_ID:'org_fixture',WORKOS_STAFF_MFA_POLICY_VERIFIED:'true',WORKOS_PRODUCTION_VERIFIED:'true',COVERAGE_THRESHOLDS_PASSED:'true',ERROR_MONITORING_VERIFIED:'true',SOURCEMAPS_VERIFIED:'true',CORRELATION_REDACTION_VERIFIED:'true',BROWSER_E2E_VERIFIED:'true',SECURITY_REVIEW_PASSED:'true',REQUIRED_TESTS_PASSED:'true',MIGRATIONS_VERIFIED:'true',MARKETING_SUPPRESSION_VERIFIED:'true',FRONTEND_PRODUCTION_QA_VERIFIED:'true',PAYMENTS_ENABLED:'true',TRANSACTIONAL_EMAILS_ENABLED:'true',COMMERCE_ENVIRONMENT:'production',AUTH_PRODUCTION_VERIFIED:'true',ADMIN_MFA_VERIFIED:'true',STAFF_MFA_VERIFIED:'true',PACKING_SLIP_QA_VERIFIED:'true',CODERABBIT_REVIEW_PASSED:'true',GITHUB_CI_VERIFIED:'true',OHIO_TAX_REGISTRATION_VERIFIED:'true',PRODUCTION_DATABASE_VERIFIED:'true',DATABASE_BACKUP_RESTORE_VERIFIED:'true',STRIPE_WEBHOOK_VERIFIED:'true',RESEND_DELIVERY_VERIFIED:'true',PROCESSING_TIME_APPROVED:'true',RETURN_WINDOW_APPROVED:'true',RETENTION_POLICY_APPROVED:'true',SUPPORT_WORKFLOW_APPROVED:'true',LIVE_INVENTORY_APPROVED:'true'}};
test('launch checks explicitly approved configuration without performing deployment',()=>{assert.equal(checkLaunch(configuration).ready,true);});

test('sales readiness never waives capacity, calendar, delay, address, apparel or artwork evidence',()=>{
 for(const key of ['FULFILLMENT_CAPACITY_VERIFIED','SHIPPING_DELAY_WORKFLOW_VERIFIED','BUSINESS_ADDRESS_CONFIRMED','APPAREL_LABELS_VERIFIED','ARTWORK_RIGHTS_VERIFIED','SHIPPING_CALENDAR_APPROVED'])assert.equal(checkLaunch({...configuration,env:{...configuration.env,[key]:'false'}}).ready,false,key);
 assert.equal(checkLaunch({...configuration,env:{...configuration.env,SHIPPING_BUSINESS_CALENDAR:'{}'}}).ready,false);
 assert.equal(checkLaunch({...configuration,now:()=>Date.parse('2028-01-01T12:00:00Z')}).ready,false);
});
test('launch validator blocks legal placeholders and test-only catalogs',()=>{
  for(const policyText of ['TODO business address','Draft for review','This is not an approved customer policy','Return policy pending']) assert.equal(checkLaunch({...configuration,policyText}).ready,false);
  for(const catalogText of ['TEST DATA','Draft catalog only','isTest: true','price_test_123']) assert.equal(checkLaunch({...configuration,catalogText}).ready,false);
});
test('launch validator catches missing declarations, test secret, shipping and business gaps',()=>{
  const result=checkLaunch({...configuration,declarations:'',env:{...configuration.env,STRIPE_SECRET_KEY:'sk_test_mock',SHIPPING_CONFIGURATION_APPROVED:'false',BUSINESS_POSTAL_ADDRESS:'TODO',SUPPORT_EMAIL:''}});assert.ok(result.blockers.some(item=>item.includes('declaration')));assert.ok(result.blockers.some(item=>item.includes('live mode')));assert.ok(result.blockers.some(item=>item.includes('shipping')));assert.ok(result.blockers.some(item=>item.includes('POSTAL_ADDRESS')));
});
test('current local site remains blocked from launch with safe diagnostics',async()=>{
  const result=await runLaunchCheck({env:{}});assert.equal(result.ready,false);assert.ok(result.blockers.length>5);assert.ok(!JSON.stringify(result).includes('postgresql://'));
});

test('predeployment permits disabled switches and defers only deployed webhook verification',()=>{
  const env={...configuration.env,PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
  delete env.STRIPE_WEBHOOK_SECRET; delete env.STRIPE_WEBHOOK_VERIFIED;
  assert.equal(checkLaunch({...configuration,env,phase:'predeploy'}).ready,true);
  assert.equal(checkLaunch({...configuration,env}).ready,false);
  for(const key of ['STAFF_MFA_VERIFIED','PACKING_SLIP_QA_VERIFIED','CODERABBIT_REVIEW_PASSED','GITHUB_CI_VERIFIED','OHIO_TAX_REGISTRATION_VERIFIED','ADMIN_MFA_VERIFIED','AUTH_PRODUCTION_VERIFIED','PRODUCTION_DATABASE_VERIFIED','DATABASE_BACKUP_RESTORE_VERIFIED','RESEND_DELIVERY_VERIFIED','LIVE_INVENTORY_APPROVED','POLICIES_APPROVED','TAX_CONFIGURATION_APPROVED','WORKOS_STAFF_MFA_POLICY_VERIFIED','WORKOS_PRODUCTION_VERIFIED','COVERAGE_THRESHOLDS_PASSED','ERROR_MONITORING_VERIFIED','SOURCEMAPS_VERIFIED','CORRELATION_REDACTION_VERIFIED','BROWSER_E2E_VERIFIED']) {
    assert.equal(checkLaunch({...configuration,env:{...env,[key]:'false'},phase:'predeploy'}).ready,false,key);
  }
});

test('predeployment rejects enabled switches, missing secrets and unknown phases',()=>{
  const env={...configuration.env,PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'};
  for(const key of ['PAYMENTS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED'])assert.equal(checkLaunch({...configuration,env:{...env,[key]:'true'},phase:'predeploy'}).ready,false,key);
  for(const key of ['STRIPE_SECRET_KEY','DATABASE_URL','RESEND_API_KEY','WORKOS_API_KEY'])assert.equal(checkLaunch({...configuration,env:{...env,[key]:''},phase:'predeploy'}).ready,false,key);
  assert.equal(checkLaunch({...configuration,phase:'skip-checks'}).ready,false);
});
