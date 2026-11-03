import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const production = await readFile(new URL('../.github/workflows/production-checks.yml', import.meta.url), 'utf8');
const sales = await readFile(new URL('../.github/workflows/live-sales-readiness.yml', import.meta.url), 'utf8');

test('development CI independently runs engineering, browser and non-selling public-site checks', () => {
  assert.match(production, /push:\s*\n\s+branches:\s*\[main, codex\/commerce-test-foundation\]/);
  assert.match(production, /pull_request:/);
  assert.match(production, /run: npm run test:coverage/);
  assert.match(production, /run: npm run check:website/);
  assert.match(production, /website-readiness:\s*\n\s+name: Public website configuration with commerce disabled\s*\n\s+runs-on:/);
  assert.doesNotMatch(production, /website-readiness:[\s\S]*?\n\s+needs:/);
  assert.match(production, /website-readiness:[\s\S]*?PAYMENTS_ENABLED: 'false'[\s\S]*?TRANSACTIONAL_EMAILS_ENABLED: 'false'/);
  assert.doesNotMatch(production, /run: npm run check:sales/);
  assert.doesNotMatch(production, /^  sales-readiness:/m);
});

test('strict sales checks are manual, protected, main-only and still fail on missing requirements', () => {
  assert.match(sales, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(sales, /^\s+(?:push|pull_request):/m);
  assert.match(sales, /CONFIRM_READINESS_CHECK: \$\{\{ inputs\.confirm_readiness_check \}\}/);
  assert.match(sales, /environment:\s*\n\s+name: live-sales-readiness/);
  assert.match(sales, /github\.ref != 'refs\/heads\/main'/);
  assert.match(sales, /run: npm run check:predeploy/);
  assert.match(sales, /run: npm run check:sales/);
  assert.doesNotMatch(sales, /continue-on-error|\[deploy netlify\]/i);
  assert.match(sales, /if: always\(\) && steps\.install\.outcome == 'success'/);
});
