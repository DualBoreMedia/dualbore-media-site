import {spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';

const mutations = [
  {name: 'price validation', file: 'netlify/commerce/service.mjs', from: 'price.unit_amount!==l.unitPriceCents', to: 'false', test: 'tests/coverage-business-rules.test.mjs', pattern: 'changed provider amount'},
  {name: 'admin authorization', file: 'netlify/operations/permissions.mjs', from: "if(roleOf(principal)!=='admin')", to: 'if(false)', test: 'tests/staff.test.mjs', pattern: 'employee cannot refund'},
  {name: 'over-refund prevention', file: 'netlify/operations/service.mjs', from: 'if(input.amountCents+(o.refundedCents||0)+pending>o.totalCents)', to: 'if(false)', test: 'tests/operations.test.mjs', pattern: 'refunds require confirmed MFA admin'},
  {name: 'cross-account access', file: 'netlify/operations/service.mjs', from: 'filter(o=>admin||o.customerUserId===principal.userId)', to: 'filter(o=>true)', test: 'tests/operations.test.mjs', pattern: 'verified email claims guest order'},
  {name: 'webhook signature validation', file: 'netlify/commerce/http.mjs', from: "r.stripe.webhooks.constructEvent(await readBounded(request,262144),request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET)", to: 'JSON.parse((await readBounded(request,262144)).toString())', test: 'tests/commerce-http.test.mjs', pattern: 'webhook uses official SDK'},
  {name: 'shipment quantity limit', file: 'netlify/operations/service.mjs', from: "if(!line||allocated+item.quantity>line.quantity)fail('over_allocated'", to: "if(!line)fail('over_allocated'", occurrence: 'all', test: 'tests/operations.test.mjs', pattern: 'split packages enforce allocation'},
  {name: 'payment kill switch', file: 'netlify/commerce/http.mjs', from: "if(live&&env.PAYMENTS_ENABLED!=='true')return json({error:'Orders are not open yet. Your cart is saved.'", to: "if(false)return json({error:'Orders are not open yet. Your cart is saved.'", test: 'tests/production-gates.test.mjs', pattern: 'hosted production catalog/config'},
];
await mkdir('test-results/mutations', {recursive: true});
const results = [];
for (const [index, mutation] of mutations.entries()) {
  const args = ['--test', '--test-name-pattern=' + mutation.pattern, mutation.test];
  const baseline = spawnSync(process.execPath, args, {encoding: 'utf8', timeout: 30000});
  if (baseline.status !== 0) {results.push({name: mutation.name, status: 'blocked', reason: 'Baseline targeted test did not pass'}); process.exitCode = 1; continue;}
  const marker = resolve(`test-results/mutations/${index}.marker`); await rm(marker, {force: true});
  const result = spawnSync(process.execPath, ['--import', './scripts/mutation-loader.mjs', ...args], {encoding: 'utf8', timeout: 30000, env: {...process.env, DBM_MUTATION_SPEC: JSON.stringify(mutation), DBM_MUTATION_MARKER: marker}});
  const output = (result.stdout || '') + (result.stderr || '');
  const applied = await readFile(marker, 'utf8').then(value => value === 'applied', () => false);
  const killed = applied && result.status !== 0 && /ERR_ASSERTION|AssertionError/.test(output) && !/SyntaxError/.test(output);
  await writeFile(`test-results/mutations/${index}.txt`, output);
  results.push({name: mutation.name, status: killed ? 'killed' : applied && result.status === 0 ? 'survived' : 'inconclusive', mutationApplied: applied, sourceChangedOnDisk: false});
  if (!killed) process.exitCode = 1;
}
await writeFile('test-results/mutations/results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
