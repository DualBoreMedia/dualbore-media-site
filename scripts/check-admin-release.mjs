import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {monitoringOrigin} from './prepare-security-headers.mjs';
import {productionWorkosKey} from '../netlify/operations/workos-key.mjs';

// Read-only operating gate. Evidence declarations are operator attestations,
// not a substitute for provider/browser/database records for this exact release.
export function checkAdminRelease({env={}}={}){
 const blockers=[];
 const expected={COMMERCE_ENVIRONMENT:'production',SITE_ORIGIN:'https://dualboremedia.com',AUTH_PROVIDER:'workos',VITE_AUTH_PROVIDER:'workos',AUTH_ACCESS_MODE:'staff-only',VITE_AUTH_ACCESS_MODE:'staff-only',WORKOS_ENVIRONMENT:'production',WORKOS_STAFF_GOOGLE_ENABLED:'true',ERROR_MONITORING_ENABLED:'true',VITE_ERROR_MONITORING_ENABLED:'true'};
 for(const [key,value]of Object.entries(expected))if(env[key]!==value)blockers.push(`${key} must match the reviewed admin-only production configuration.`);
 for(const key of ['PAYMENTS_ENABLED','REFUNDS_ENABLED','TRANSACTIONAL_EMAILS_ENABLED','MARKETING_EMAILS_ENABLED','DROP_WAITLIST_ENABLED'])if(env[key]!=='false')blockers.push(`${key} must explicitly remain false.`);
 if(env.COMMERCE_MOCK==='true'||env.COMMERCE_TEST_ENABLED==='true')blockers.push('Hosted test checkout and simulation must remain disabled.');
 if(env.STRIPE_SECRET_KEY||env.RESEND_API_KEY)blockers.push('Omit payment and sending credentials from the admin-only release.');
 if(!productionWorkosKey(env))blockers.push('An isolated WorkOS production key is required; opaque sk_ keys need verified production-environment evidence.');
 if(!/^client_[A-Za-z0-9]+$/.test(env.WORKOS_CLIENT_ID||''))blockers.push('A production WorkOS client ID is required.');
 if(!/^org_[A-Za-z0-9]+$/.test(env.WORKOS_STAFF_ORGANIZATION_ID||''))blockers.push('A private production staff organization is required.');
 if(typeof env.WORKOS_COOKIE_PASSWORD!=='string'||env.WORKOS_COOKIE_PASSWORD.length<32)blockers.push('An independently generated production cookie secret is required.');
 try{const db=new URL(env.DATABASE_URL);if(!['postgres:','postgresql:'].includes(db.protocol)||!db.username||!db.password||['localhost','127.0.0.1','[::1]'].includes(db.hostname)||db.searchParams.get('sslmode')!=='verify-full')throw Error();}catch{blockers.push('A separate production PostgreSQL connection with verified TLS is required.');}
 for(const key of ['SENTRY_DSN','VITE_SENTRY_DSN'])try{monitoringOrigin(env[key]);}catch{blockers.push(`${key} must identify the verified monitoring project.`);}
 if(!/^[a-f0-9]{40}$/.test(env.RELEASE_SHA||''))blockers.push('The exact reviewed release SHA is required.');
 if(Object.keys(env).some(key=>/^(?:re_|sk_|(?:rk|pk)_(?:test|live)_)/.test(key)||/^VITE_.*(?:SECRET|PASSWORD|API_KEY|DATABASE_URL|AUTH_TOKEN|WEBHOOK_SECRET)/.test(key)))blockers.push('Remove credential-shaped variable names and client-exposed secrets through the approved rotation procedure.');
 const evidence={WORKOS_PRODUCTION_VERIFIED:'WorkOS production environment/free-tier setup',WORKOS_STAFF_MFA_POLICY_VERIFIED:'mandatory production organization MFA and bypass checks',ADMIN_OWNERS_VERIFIED:'two explicit individual owner memberships',AUTH_PRODUCTION_VERIFIED:'production sign-in, recovery and sessions',ADMIN_MFA_VERIFIED:'administrator MFA and sensitive step-up',STAFF_MFA_VERIFIED:'employee least privilege and revocation',PRODUCTION_DATABASE_VERIFIED:'clean isolated production database',MIGRATIONS_VERIFIED:'production migration checksums',DATABASE_BACKUP_RESTORE_VERIFIED:'managed production backup/restore rehearsal',SECRETS_SCOPED_VERIFIED:'approved production-only secret scopes and build-output safeguards',SECURITY_REVIEW_PASSED:'security review',REQUIRED_TESTS_PASSED:'required release tests',COVERAGE_THRESHOLDS_PASSED:'enforced measured coverage',BROWSER_E2E_VERIFIED:'browser flows',FRONTEND_PRODUCTION_QA_VERIFIED:'production-shaped non-selling frontend',CODERABBIT_REVIEW_PASSED:'CodeRabbit review',GITHUB_CI_VERIFIED:'six green jobs for this exact SHA',ERROR_MONITORING_VERIFIED:'controlled monitoring event and alert',SOURCEMAPS_VERIFIED:'release source-map resolution',CORRELATION_REDACTION_VERIFIED:'correlation and secret/PII redaction'};
 for(const [key,description]of Object.entries(evidence))if(env[key]!=='true')blockers.push(`Evidence pending: ${description} (${key}).`);
 return {ready:blockers.length===0,blockers,level:'admin-only'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=checkAdminRelease({env:process.env});
 console.log(result.ready?'Admin-only readiness checks passed. Separate deployment approval is still required.':`NO-GO: admin-only production release blocked (${result.blockers.length}):\n${result.blockers.map(message=>'- '+message).join('\n')}`);
 console.log('No deployment or activation was performed. Merchandise-sales readiness is a separate gate.');process.exitCode=result.ready?0:1;
}
