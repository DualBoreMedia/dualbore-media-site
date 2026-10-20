import {spawn} from 'node:child_process';
import {readFile, readdir, mkdir, writeFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import coverageLibrary from 'istanbul-lib-coverage';
import reportLibrary from 'istanbul-lib-report';
import reports from 'istanbul-reports';
import {coveragePolicy} from './coverage-policy.mjs';
import {combineCoverageReports, expectedCoverageSources} from './coverage-merge.mjs';
import {convertNodeCoverage} from './coverage-node.mjs';
const {createCoverageMap} = coverageLibrary;
const {createContext} = reportLibrary;

const cwd = process.cwd();
const tests = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
await mkdir('test-results', {recursive: true});
await writeFile('test-results/coverage-policy.json', JSON.stringify(coveragePolicy, null, 2));

function run(args, env = process.env) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, {stdio: 'inherit', env});
    child.once('error', reject);
    child.once('exit', code => accept(code ?? 1));
  });
}

// Collect native V8 evidence, then use the same AST-aware converter used by
// Vitest's supported V8 provider. c8's line-based converter generated invalid
// negative-column branch locations for this repository's ESM sources.
const expectedSources = expectedCoverageSources(cwd, coveragePolicy.exclude);
const expectedNodeFiles = expectedSources.filter(file => !file.endsWith('.jsx'));
const expectedBrowserFiles = expectedSources.filter(file => file.startsWith('src/'));
const rawDirectory = resolve('test-results/coverage-node-raw');
await rm(rawDirectory, {recursive: true, force: true});
await mkdir(rawDirectory, {recursive: true});
if (await run(['--test', ...tests], {...process.env, NODE_V8_COVERAGE: rawDirectory})) process.exit(1);
const processes = [];
for (const file of (await readdir(rawDirectory)).filter(file => file.endsWith('.json'))) {
  processes.push(JSON.parse(await readFile(resolve(rawDirectory, file), 'utf8')));
}
if (!processes.length) throw new Error('Node produced no raw V8 coverage evidence.');
const measuredTests = new Set(processes.flatMap(process => process.result)
  .filter(script => script.url.startsWith('file:')).map(script => resolve(fileURLToPath(script.url))));
const missingTests = tests.filter(file => !measuredTests.has(resolve(file)));
if (missingTests.length) throw new Error(`Node coverage evidence is missing executed test modules: ${missingTests.join(', ')}`);
const nativeNodeData = await convertNodeCoverage({root: cwd, files: expectedNodeFiles, processes});
await rm('test-results/coverage', {recursive: true, force: true});
const nodeContext = createContext({dir: 'test-results/coverage', coverageMap: createCoverageMap(nativeNodeData)});
for (const kind of ['text', 'html', 'lcovonly', 'json', 'json-summary']) reports.create(kind).execute(nodeContext);
if (await run(['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.browser.config.mjs'])) process.exit(1);

const nodeData = JSON.parse(await readFile('test-results/coverage/coverage-final.json', 'utf8'));
const browserData = JSON.parse(await readFile('test-results/coverage-browser/coverage-final.json', 'utf8'));
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
const implicitBranches = manifest.reduce((sum, entry) => sum + entry.nodeImplicitBranchLocations + entry.browserImplicitBranchLocations, 0);
console.log(`Coverage source inventory: ${manifest.length} files, ${incompatibleShared.length} incompatible shared-source maps.`);
console.log(`Preserved ${implicitBranches} implicit else-path counters verified against original-source if statements.`);
if (incompatibleShared.length) {
  console.error('Coverage mapping integrity failed: shared Node/Chromium maps disagree. Their counters were not combined.');
  process.exitCode = 1;
}
if (negativeMapColumns) {
  console.error(`Coverage mapping integrity failed: ${negativeMapColumns} V8-to-Istanbul source locations have negative columns. Counters remain unmerged across incompatible maps, but this coverage result is not eligible to pass CI.`);
  process.exitCode = 1;
}
if (unmappedBranches) {
  console.error(`Coverage mapping integrity failed: ${unmappedBranches} Chromium branch arms have no source location. The missing arms are retained in coverage, and this result is not eligible to pass CI.`);
  process.exitCode = 1;
}
if (browserOnlyJsCoverage.length) {
  console.log('Shared frontend JavaScript executed in Chromium but retained Node-authoritative counters because source maps differ:', browserOnlyJsCoverage.map(entry => entry.file).join(', '));
}
if (misses.length) {
  console.error('Coverage below required thresholds:', misses.map(key => `${key} ${summary[key].pct}% < ${coveragePolicy[key]}%`).join(', '));
  process.exitCode = 1;
}
