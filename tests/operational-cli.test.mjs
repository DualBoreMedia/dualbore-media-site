import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cleanEnv=()=>Object.fromEntries(Object.entries(process.env).filter(([key])=>!(/^(?:STRIPE|DATABASE|RESEND|WORKOS|CLERK|SENTRY|COMMERCE|AUTH_PROVIDER|SITE_ORIGIN|NETLIFY|CONTEXT|BRANCH|COMMIT_REF|ERROR_MONITORING|PAYMENTS|TRANSACTIONAL|LIVE_|SHIPPING_|TAX_)/i.test(key))));
const run=(script,env={})=>spawnSync(process.execPath,['scripts/'+script],{cwd:root,encoding:'utf8',env:{...cleanEnv(),...env}});

test('maintenance CLIs fail closed with useful redacted messages before provider access',()=>{
 for(const [script,message]of [['migrate-commerce.mjs','DATABASE_URL is required'],['sync-stripe-test-catalog.mjs','Test catalog sync failed'],['recover-commerce.mjs','Local test reconciliation needs configuration']]){
  const result=run(script);assert.equal(result.status,1,result.stdout+result.stderr);assert.ok((result.stdout+result.stderr).includes(message));assert.doesNotMatch(result.stdout+result.stderr,/postgres(?:ql)?:\/\/|sk_live_|Authorization:|at .+\.mjs:/);
 }
});

test('actual Netlify CLI gates allow local compilation and block missing or development commit metadata',()=>{
 assert.equal(run('netlify-build-guard.mjs').status,0);
 const missing=run('netlify-ignore.mjs');assert.equal(missing.status,0);assert.match(missing.stdout,/Skipping unapproved/);
 const hosted=run('netlify-build-guard.mjs',{NETLIFY:'true',CONTEXT:'production',BRANCH:'main'});assert.equal(hosted.status,1);assert.match(hosted.stderr,/Blocked Netlify compilation/);
 const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
 const metadata={NETLIFY:'true',CONTEXT:'production',BRANCH:'main',COMMIT_REF:revision};
 assert.equal(run('netlify-ignore.mjs',metadata).status,0);assert.equal(run('netlify-build-guard.mjs',metadata).status,1);
});

test('Sites packaging and public website CLI validate the real local build without publication',()=>{
 const packaged=run('prepare-sites-build.mjs');assert.equal(packaged.status,0,packaged.stderr);
 assert.equal(readFileSync(path.join(root,'dist/server/index.js'),'utf8'),readFileSync(path.join(root,'worker/index.js'),'utf8'));
 assert.equal(readFileSync(path.join(root,'dist/.openai/hosting.json'),'utf8'),readFileSync(path.join(root,'.openai/hosting.json'),'utf8'));
 const ready=run('check-website.mjs',{PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false'});assert.equal(ready.status,0,ready.stdout+ready.stderr);assert.match(ready.stdout,/No deployment was performed/);
 const unsafe=run('check-website.mjs',{PAYMENTS_ENABLED:'true',TRANSACTIONAL_EMAILS_ENABLED:'false'});assert.equal(unsafe.status,1);assert.match(unsafe.stdout,/PAYMENTS_ENABLED must explicitly be false/);
});
