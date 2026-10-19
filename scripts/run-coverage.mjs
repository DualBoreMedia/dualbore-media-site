import {spawn} from 'node:child_process';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve, relative, sep} from 'node:path';
import coverageLibrary from 'istanbul-lib-coverage';
import reportLibrary from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import {coveragePolicy} from './coverage-policy.mjs';
const {createCoverageMap} = coverageLibrary;
const {createContext} = reportLibrary;

const cwd = process.cwd();
const tests = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
await mkdir('test-results', {recursive: true});
await writeFile('test-results/coverage-policy.json', JSON.stringify(coveragePolicy, null, 2));

function run(args) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, {stdio: 'inherit', env: process.env});
    child.once('error', reject);
    child.once('exit', code => accept(code ?? 1));
  });
}

// c8 measures native Node modules. Its --all entries for JSX are zero-fill
// placeholders; transformed React components are measured in real Chromium.
const nodeArgs = ['node_modules/c8/bin/c8.js'];
for (const [key, value] of Object.entries(coveragePolicy)) {
  if (key === 'check-coverage') continue;
  for (const part of Array.isArray(value) ? value : [value]) nodeArgs.push('--' + key + '=' + part);
}
nodeArgs.push(process.execPath, '--test', ...tests);
if (await run(nodeArgs)) process.exit(1);
if (await run(['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.browser.config.mjs'])) process.exit(1);

const nodeData = JSON.parse(await readFile('test-results/coverage/coverage-final.json', 'utf8'));
const browserData = JSON.parse(await readFile('test-results/coverage-browser/coverage-final.json', 'utf8'));
const keyFor = path => relative(cwd, resolve(path)).split(sep).join('/');
const nodeFiles = new Map(Object.entries(nodeData).map(([path, data]) => [keyFor(path), data]));
const browserFiles = new Map(Object.entries(browserData).map(([path, data]) => [keyFor(path), data]));
const combined = {};
for (const [path, nodeCoverage] of nodeFiles) {
  const selected = path.endsWith('.jsx') ? browserFiles.get(path) : nodeCoverage;
  if (!selected || (path.endsWith('.jsx') && !path.startsWith('src/'))) throw new Error(`Missing matching Chromium coverage for ${path}`);
  // Each source is included exactly once. JS shared by browser and Node stays
  // with c8 because transformed Vitest statement maps are not interchangeable.
  combined[selected.path] = selected;
}
for (const [path] of browserFiles) {
  if (path.endsWith('.jsx') && !nodeFiles.has(path)) throw new Error(`Chromium measured an unaccounted JSX source: ${path}`);
}
const coverage = createCoverageMap(combined);
const context = createContext({dir: 'test-results/coverage-combined', coverageMap: coverage});
for (const kind of ['text', 'html', 'lcovonly', 'json', 'json-summary']) reports.create(kind).execute(context);
const summary = coverage.getCoverageSummary().data;
const metricKeys = ['lines', 'statements', 'functions', 'branches'];
for (const key of metricKeys) {
  if (!Number.isFinite(coveragePolicy[key]) || coveragePolicy[key] < 0 || coveragePolicy[key] > 100) throw new Error(`Invalid coverage threshold: ${key}`);
}
const misses = metricKeys.filter(key => summary[key].pct < coveragePolicy[key]);
console.log('Combined Node + Chromium coverage:', Object.fromEntries(metricKeys.map(key => [key, summary[key].pct])));
if (misses.length) {
  console.error('Coverage below required thresholds:', misses.map(key => `${key} ${summary[key].pct}% < ${coveragePolicy[key]}%`).join(', '));
  process.exitCode = 1;
}
