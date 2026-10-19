import {spawn} from 'node:child_process';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import coverageLibrary from 'istanbul-lib-coverage';
import reportLibrary from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import {coveragePolicy} from './coverage-policy.mjs';
import {combineCoverageReports, expectedCoverageSources} from './coverage-merge.mjs';
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
const expectedNodeFiles = expectedCoverageSources(cwd, coveragePolicy.exclude);
const expectedBrowserFiles = expectedNodeFiles.filter(path => path.startsWith('src/'));
const {combined, manifest} = combineCoverageReports({
  nodeData,
  browserData,
  root: cwd,
  expectedNodeFiles,
  expectedBrowserFiles,
});
await writeFile('test-results/coverage-source-authority.json', JSON.stringify(manifest, null, 2));
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
const incompatibleShared = manifest.filter(entry => entry.maps.startsWith('incompatible'));
const browserOnlyJsCoverage = incompatibleShared.filter(entry => entry.file.startsWith('src/') && !entry.file.endsWith('.jsx') && entry.browserExecuted);
const negativeMapColumns = manifest.reduce((sum, entry) => sum + entry.nodeNegativeColumns + entry.browserNegativeColumns, 0);
const unmappedBranches = manifest.reduce((sum, entry) => sum + entry.nodeUnmappedBranchLocations + entry.browserUnmappedBranchLocations, 0);
console.log(`Coverage source inventory: ${manifest.length} files, ${incompatibleShared.length} incompatible overlapping maps kept authoritative per file.`);
if (negativeMapColumns) console.warn(`Source-map diagnostic: ${negativeMapColumns} V8-to-Istanbul source locations have negative columns; line mappings remain valid and these reports are never merged.`);
if (unmappedBranches) console.warn(`Source-map diagnostic: ${unmappedBranches} branch arms have no source location; affected reports remain authoritative per file and are never merged.`);
if (browserOnlyJsCoverage.length) {
  console.log('Shared frontend JavaScript executed in Chromium but retained Node-authoritative counters because source maps differ:', browserOnlyJsCoverage.map(entry => entry.file).join(', '));
}
if (misses.length) {
  console.error('Coverage below required thresholds:', misses.map(key => `${key} ${summary[key].pct}% < ${coveragePolicy[key]}%`).join(', '));
  process.exitCode = 1;
}
