import {approvedShippingCalendar,captureShippingPromise} from '../netlify/operations/shipping-compliance.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const requiredDeclarations=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','DATABASE_URL','RESEND_API_KEY','RESEND_FROM','RESEND_REPLY_TO','AUTH_PROVIDER','WORKOS_API_KEY','WORKOS_CLIENT_ID','WORKOS_COOKIE_PASSWORD','WORKOS_STAFF_ORGANIZATION_ID','PAYMENTS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED'];
export function checkLaunch({policyText='',catalogText='',declarations='',env={},phase='activation',now=Date.now}={}) {
  const blockers=[];
  if(!['activation','predeploy'].includes(phase))return {ready:false,blockers:['Unknown readiness phase.'],phase};
  if(!policyText.trim() || /\[[^\]]*REQUIRED\]|TODO|placeholder|draft for review|not an approved|still need confirmation|review required|policy pending|owner decisions still required/i.test(policyText)) blockers.push('Customer policies contain draft or placeholder wording.');
  if(!catalogText.trim() || /test data|test-only|draft catalog|test pricing|testPrice|isTest\s*:\s*true|testOnly\s*:\s*true|price_test_|prod_test_|price_[^\s"']*test/i.test(catalogText)) blockers.push('Catalog remains test data or has no reviewed live catalog.');
  for(const name of requiredDeclarations) {
    if(!new RegExp(`^${name}=`, 'm').test(declarations)) blockers.push(`Environment declaration missing: ${name}.`);
    if(!env[name] && !(phase==='predeploy' && name==='STRIPE_WEBHOOK_SECRET')) blockers.push(`Production configuration missing: ${name}.`);
  }
  if(env.STRIPE_SECRET_KEY && !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY)) blockers.push('Stripe is not configured for reviewed live mode.');
  if(env.DATABASE_URL && !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL)) blockers.push('A PostgreSQL connection is required.');
  if(env.STORE_COUNTRY!=='US' || env.STORE_CURRENCY!=='usd') blockers.push('USA/USD shipping and currency configuration is unverified.');
  if(!/^\d+$/.test(env.SHIPPING_RATE_CENTS ?? '') || Number(env.SHIPPING_RATE_CENTS)<=0 || env.SHIPPING_CONFIGURATION_APPROVED!=='true') blockers.push('Final production shipping price and configuration require approval.');
  for(const name of ['BUSINESS_LEGAL_NAME','BUSINESS_POSTAL_ADDRESS','SUPPORT_EMAIL']) if(!env[name] || /TODO|placeholder|example\./i.test(env[name])) blockers.push(`Business information missing or unverified: ${name}.`);
  if(!approvedShippingCalendar(env)||!captureShippingPromise({paidAt:new Date(now()).toISOString()},env).verified)blockers.push('An owner-approved shipping business calendar, holidays, timezone and sufficient review horizon are required.');
  for(const key of ['FULFILLMENT_CAPACITY_VERIFIED','SHIPPING_DELAY_WORKFLOW_VERIFIED','BUSINESS_ADDRESS_CONFIRMED','APPAREL_LABELS_VERIFIED','ARTWORK_RIGHTS_VERIFIED'])if(env[key]!=='true')blockers.push('Required legal/fulfillment verification missing: '+key+'.');
  if(env.POLICIES_APPROVED!=='true') blockers.push('Final customer policies have not been approved.');
  if(env.LIVE_CATALOG_APPROVED!=='true') blockers.push('Live prices, inventory and Stripe catalog require approval.');
  if(env.TAX_CONFIGURATION_APPROVED!=='true') blockers.push('Tax configuration requires owner/professional review.');
  if(env.RESEND_DOMAIN_VERIFIED!=='true') blockers.push('Transactional sender domain is not confirmed as verified.');
  if(!env.RESEND_FROM||/resend\.dev|example\./i.test(env.RESEND_FROM))blockers.push('Production email domain required.');
  if(!env.RESEND_REPLY_TO||/example\./i.test(env.RESEND_REPLY_TO))blockers.push('A confirmed monitored reply-to address is required.');
  if(env.AUTH_PROVIDER!=='workos')blockers.push('The selected WorkOS authentication provider is not configured.');
  if(!env.WORKOS_CLIENT_ID?.startsWith('client_')||!env.WORKOS_API_KEY||env.WORKOS_COOKIE_PASSWORD?.length<32)blockers.push('WorkOS server credentials and a strong session-cookie secret are required.');
  if(!env.WORKOS_STAFF_ORGANIZATION_ID?.startsWith('org_')||env.WORKOS_STAFF_MFA_POLICY_VERIFIED!=='true')blockers.push('The private staff organization and mandatory MFA policy require verification.');
  if(env.WORKOS_PRODUCTION_VERIFIED!=='true')blockers.push('WorkOS production environment and free-tier configuration require real verification.');
  for(const [key,message]of Object.entries({COVERAGE_THRESHOLDS_PASSED:'Coverage must meet enforced line, statement, function and branch thresholds.',ERROR_MONITORING_VERIFIED:'A controlled exception must reach the configured monitoring service.',SOURCEMAPS_VERIFIED:'Monitoring source-map resolution must be verified for the release.',CORRELATION_REDACTION_VERIFIED:'Request/release correlation and secret/PII redaction require verification.',BROWSER_E2E_VERIFIED:'Required rendered browser flows and failure artifacts require verification.'}))if(env[key]!=='true')blockers.push(message);
  if(env.COMMERCE_ENVIRONMENT!=='production')blockers.push('Production environment is not selected.');
  for(const [key,message]of Object.entries({SECURITY_REVIEW_PASSED:'Critical/high security findings require resolution.',REQUIRED_TESTS_PASSED:'Required release-candidate tests need fresh passing evidence.',MIGRATIONS_VERIFIED:'Production migrations require verification.',MARKETING_SUPPRESSION_VERIFIED:'Durable production marketing suppression requires verification.',FRONTEND_PRODUCTION_QA_VERIFIED:'The configured production-shaped frontend requires rendered verification.',AUTH_PRODUCTION_VERIFIED:'Managed production sign-in, verification, recovery and sessions require real validation.',ADMIN_MFA_VERIFIED:'Administrator MFA and role authorization require real validation.',STAFF_MFA_VERIFIED:'Employee MFA, least privilege and revocation require real validation.',PACKING_SLIP_QA_VERIFIED:'Staff-only whole-order and package packing slips require rendered and print verification.',CODERABBIT_REVIEW_PASSED:'CodeRabbit must have no unresolved Critical/Major issues.',GITHUB_CI_VERIFIED:'Independent CI must pass for the exact release commit.',OHIO_TAX_REGISTRATION_VERIFIED:'Ohio vendor registration and Stripe tax setup require verification.',PRODUCTION_DATABASE_VERIFIED:'A separate production database and applied migrations require verification.',DATABASE_BACKUP_RESTORE_VERIFIED:'Production backup and restore rehearsal is required.',STRIPE_WEBHOOK_VERIFIED:'Post-deployment live Stripe webhook signature and event delivery require verification.',RESEND_DELIVERY_VERIFIED:'Production sender delivery and lifecycle retry require verification.',PROCESSING_TIME_APPROVED:'Final processing time is missing.',RETURN_WINDOW_APPROVED:'Final return window is missing.',RETENTION_POLICY_APPROVED:'Data retention and account deletion policy require approval.',SUPPORT_WORKFLOW_APPROVED:'Support inbox and response workflow require confirmation.',LIVE_INVENTORY_APPROVED:'Production inventory modes, active variants and made-to-order fulfillment capacity require approval.'}))if(env[key]!=='true' && !(phase==='predeploy' && key==='STRIPE_WEBHOOK_VERIFIED'))blockers.push(message);
  if(phase==='predeploy'){
    if(env.PAYMENTS_ENABLED!=='false')blockers.push('Pre-deployment requires PAYMENTS_ENABLED=false.');
    if(env.TRANSACTIONAL_EMAILS_ENABLED!=='false')blockers.push('Pre-deployment requires TRANSACTIONAL_EMAILS_ENABLED=false.');
  }else{
    if(env.PAYMENTS_ENABLED!=='true')blockers.push('Payments remain intentionally disabled pending explicit launch approval.');
    if(env.TRANSACTIONAL_EMAILS_ENABLED!=='true')blockers.push('Production transactional email remains intentionally disabled.');
  }
  return {ready:blockers.length===0,blockers,phase};
}

export async function runLaunchCheck({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),env=process.env,phase='activation'}={}) {
  const read=async path=>{try{return await readFile(resolve(root,path),'utf8');}catch{return '';}};
  const [policyText,catalog,serverCatalog,declarations]=await Promise.all([read('src/commerce/Pages.jsx'),read('src/commerce/catalog.js'),read('netlify/commerce/catalog.mjs'),read('.env.example')]);
  const result=checkLaunch({policyText,catalogText:`${catalog}\n${serverCatalog}`,declarations,env,phase});
  return result;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const phase=args.length===0?'activation':args.length===1&&args[0]==='--phase=predeploy'?'predeploy':'invalid';
  const result=await runLaunchCheck({phase});
  console.log((phase==='predeploy'?'Pre-deployment: ':'')+(result.ready?'Launch configuration checks passed. No deployment was performed.':`Launch blocked (${result.blockers.length}):\n${result.blockers.map(item=>`- ${item}`).join('\n')}\nNo deployment was performed.`));
  process.exitCode=result.ready?0:1;
}
