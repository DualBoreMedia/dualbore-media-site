import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareHeaders} from '../scripts/prepare-security-headers.mjs';

test('generated headers retain the public CSP and scope optional provider permissions to approved origins',async()=>{
 const previous=process.cwd(),directory=mkdtempSync(path.join(os.tmpdir(),'dbm-generated-headers-'));
 try{
  mkdirSync(path.join(directory,'public'));mkdirSync(path.join(directory,'dist/client'),{recursive:true});
  const source="/*\n  Content-Security-Policy: default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'\n";
  writeFileSync(path.join(directory,'public/_headers'),source);process.chdir(directory);
  await prepareHeaders({AUTH_PROVIDER:'workos'});assert.equal(readFileSync('dist/client/_headers','utf8'),source);
  await prepareHeaders({AUTH_PROVIDER:'clerk',CLERK_FRONTEND_ORIGIN:'https://clerk.example.invalid',VITE_ERROR_MONITORING_ENABLED:'true',VITE_SENTRY_DSN:'https://public@o1.ingest.us.sentry.io/1'});
  const output=readFileSync('dist/client/_headers','utf8');assert.match(output,/\/account\/\*/);assert.match(output,/https:\/\/o1\.ingest\.us\.sentry\.io/);assert.doesNotMatch(output,/public@|unsafe-eval|script-src 'unsafe-inline'/);assert.match(output,/form-action 'self'/);
  await assert.rejects(prepareHeaders({VITE_ERROR_MONITORING_ENABLED:'true',VITE_SENTRY_DSN:'https://not-sentry.example/1'}),/official HTTPS Sentry/);
  await assert.rejects(prepareHeaders({AUTH_PROVIDER:'clerk',CLERK_FRONTEND_ORIGIN:'https://clerk.example.invalid/path'}),/exact HTTPS Clerk/);
 }finally{process.chdir(previous);rmSync(directory,{recursive:true,force:true});}
});
