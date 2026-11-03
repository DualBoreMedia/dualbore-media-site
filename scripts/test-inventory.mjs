import {readdir, readFile, mkdir, writeFile} from 'node:fs/promises';

const files = (await readdir('tests')).filter(name => /\.(test|integration|browser)\.mjs$/.test(name)).sort();
const groups = {UNIT: [], INTEGRATION: [], DATABASE: [], 'BROWSER / E2E': [], SECURITY: [], 'BUILD / CONFIGURATION': [], 'PROVIDER SANDBOX': [], 'LAUNCH-GATE': []};
const inventory = [];
for (const name of files) {
  const source = await readFile('tests/' + name, 'utf8');
  const declarations = [...source.matchAll(/\btest\(\s*(['"])(.*?)\1/g)].map(match => match[2]);
  const categories = [];
  if (name.endsWith('.browser.mjs')) categories.push('BROWSER / E2E');
  else if (/postgres|repository|database-pool/.test(name)) categories.push('DATABASE');
  else if (/http|service|operations\.test|marketing\.test|order-email|staff\.test/.test(name)) categories.push('INTEGRATION');
  else categories.push('UNIT');
  if (/auth|staff|client-secrets|http|checkout-client/.test(name)) categories.push('SECURITY');
  if (/build-gate|sites-worker|client-secrets/.test(name)) categories.push('BUILD / CONFIGURATION');
  if (/launch|production-gates/.test(name)) categories.push('LAUNCH-GATE');
  const entry = {file: 'tests/' + name, categories, declarations, requiresOptIn: source.includes("DBM_REAL_POSTGRES_TEST!=='true'"), providerBoundaryFixtures: /mock|fixture|stub|fake/i.test(source)};
  inventory.push(entry);
  for (const category of categories) groups[category].push(entry.file);
}
// Reviewed against the assertions and fixture boundaries, not file existence.
const matrix = [
  ['Trusted pricing, shipping, cart validation', 'COVERED', 'commerce, storefront, commerce-service: forged totals, repricing acknowledgement, quantity bounds, US destination and $7 sandbox rate. Production carrier quotes not integrated.'],
  ['Live/test catalog isolation and kill switch', 'PARTIALLY COVERED', 'production-gates and catalog-sync assertions; no enabled live Checkout or production provider verification.'],
  ['Payment verification and webhook idempotency', 'PARTIALLY COVERED', 'commerce-service/http signed-boundary fixtures, duplicate events, async payment, mismatches; actual sandbox end-to-end must be independently recorded.'],
  ['Finite stock/MTO reservations and concurrency', 'PARTIALLY COVERED', 'memory/PGlite and opt-in real PostgreSQL cross-process final-unit/MTO tests; database execution is not implied by inventory.'],
  ['Refund bounds and fulfillment/split shipments', 'COVERED', 'operations assertions cover over-refund, races, stale version, package quantities and truthful tracking; provider replies are fixtures.'],
  ['Packing slip access and data minimization', 'COVERED', 'staff assertions enforce employee/admin MFA, order/package binding, allocation and excluded private fields; browser print evidence separate.'],
  ['Hosted signup, verified email, recovery and staff MFA', 'NOT COVERED', 'Auth provider replacement in progress. Existing boundary fixtures do not verify actual managed enrollment, recovery or MFA.'],
  ['Own orders, verified guest claim, cross-account IDOR', 'PARTIALLY COVERED', 'operations and service ownership assertions; hosted auth/browser identity flow remains external integration evidence.'],
  ['Role escalation and revocation', 'PARTIALLY COVERED', 'auth/staff private role and per-request session checks plus rendered injected-principal revocation; real provider needed.'],
  ['Transactional email idempotency and suppression', 'PARTIALLY COVERED', 'order-email/lifecycle/marketing tests assert retries, escaping, independent payment success and opt-out; delivery is not proved by mocks.'],
  ['Mobile/desktop keyboard storefront and staff UI', 'PARTIALLY COVERED', 'portable browser runner executes 7 viewports in three engines; local browser availability and actual run results are reported separately.'],
  ['Monitoring delivery, source maps and alert receipt', 'NOT COVERED', 'Requires configured monitoring service and controlled real event, not a mock reporter assertion.'],
  ['Launch gates and missing business facts', 'COVERED', 'launch-readiness/production-gates reject missing real evidence. A passing unit assertion is not production readiness.'],
];
await mkdir('test-results/inventory', {recursive: true});
const report = {generatedAt: new Date().toISOString(), staticInventoryOnly: true, groups, inventory, matrix: matrix.map(([behavior, status, evidence]) => ({behavior, status, evidence})), providerSandbox: 'No tracked automated suite independently proves real provider integration. Consult ignored sandbox QA evidence; never infer from mocks.', coverageWarning: 'Test names and test counts do not establish measured code coverage. Run test:coverage and inspect all-source denominator.'};
await writeFile('test-results/inventory/inventory.json', JSON.stringify(report, null, 2));
await writeFile('test-results/inventory/matrix.md', '# Test inventory and behavior matrix\n\nThis is a static inventory, not an execution result.\n\n| Behavior | Status | Evidence and limitations |\n| --- | --- | --- |\n' + matrix.map(row => '| ' + row.join(' | ') + ' |').join('\n') + '\n\n## Test groups\n\n' + Object.entries(groups).map(([group, names]) => `### ${group}\n\n${names.length ? names.map(name => '- ' + name).join('\n') : '- No automated real provider evidence in the tracked suite.'}`).join('\n\n') + '\n');
console.log(`Inventoried ${inventory.length} test modules. Static inventory is not a passing-test or coverage claim.`);
