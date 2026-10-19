import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {combineCoverageReports, expectedCoverageSources} from '../scripts/coverage-merge.mjs';

let root;
test.beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'dbm-coverage-merge-'));
  mkdirSync(path.join(root, 'src'), {recursive: true});
  writeFileSync(path.join(root, 'src', 'example.js'), 'export const value = 1;\n');
});
test.afterEach(() => rmSync(root, {recursive: true, force: true}));

const basicCoverage = (file, {endColumn = 22, statementCount = 1, branchCount = 0, functionCount = 0} = {}) => ({
  path: path.join(root, file),
  statementMap: Object.fromEntries(Array.from({length: statementCount}, (_, index) => [String(index), {start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}])),
  fnMap: Object.fromEntries(Array.from({length: functionCount}, (_, index) => [String(index), {name: `fn${index}`, line: 1, loc: {start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}, decl: {start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}}])),
  branchMap: Object.fromEntries(Array.from({length: branchCount}, (_, index) => [String(index), {type: 'if', line: 1, loc: {start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}, locations: [{start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}, {start: {line: 1, column: 0}, end: {line: 1, column: endColumn}}]}])),
  s: Object.fromEntries(Array.from({length: statementCount}, (_, index) => [String(index), 1])),
  f: Object.fromEntries(Array.from({length: functionCount}, (_, index) => [String(index), 1])),
  b: Object.fromEntries(Array.from({length: branchCount}, (_, index) => [String(index), [1, 0]])),
});

const combine = (nodeData, browserData, options = {}) => combineCoverageReports({
  nodeData,
  browserData,
  root,
  expectedNodeFiles: ['src/example.js'],
  expectedBrowserFiles: ['src/example.js'],
  ...options,
});

test('combines counts only when statement, branch, and function maps are identical', () => {
  const file = 'src/example.js';
  const node = basicCoverage(file, {branchCount: 1, functionCount: 1});
  const browser = structuredClone(node);
  browser.s[0] = 3;
  browser.b[0] = [4, 5];
  browser.f[0] = 2;
  const result = combine({[file]: node}, {[file]: browser});
  const merged = result.combined[path.join(root, file)];
  assert.deepEqual(merged.s, {0: 4});
  assert.deepEqual(merged.b, {0: [5, 5]});
  assert.deepEqual(merged.f, {0: 3});
  assert.equal(result.manifest[0].maps, 'identical');
});

test('keeps one authoritative runner when source maps differ and records the mismatch', () => {
  const file = 'src/example.js';
  const node = basicCoverage(file, {branchCount: 1, functionCount: 1});
  node.s[0] = 3;
  const browser = basicCoverage(file, {endColumn: 21, branchCount: 1, functionCount: 1});
  browser.s[0] = 100;
  const result = combine({[file]: node}, {[file]: browser});
  assert.deepEqual(result.combined[path.join(root, file)].s, {0: 3});
  assert.equal(result.manifest[0].authority, 'Node');
  assert.equal(result.manifest[0].maps, 'incompatible; counters not combined');
  assert.equal(result.manifest[0].browserExecuted, true);
});

test('rejects duplicate canonical paths even when report keys use different spellings', () => {
  const file = 'src/example.js';
  const node = basicCoverage(file);
  assert.throws(() => combine({[file]: node, [path.join(root, file)]: node}, {[file]: node}), /duplicate canonical source paths/);
});

test('rejects source-map paths that escape the repository or point at another file', () => {
  const file = 'src/example.js';
  const outside = basicCoverage(file);
  outside.path = path.join(root, '..', 'private.js');
  assert.throws(() => combine({[file]: outside}, {[file]: basicCoverage(file)}), /different source|escapes the repository/);
  const wrongLine = basicCoverage(file);
  wrongLine.statementMap[0].start.line = 3;
  wrongLine.statementMap[0].end.line = 3;
  assert.throws(() => combine({[file]: wrongLine}, {[file]: basicCoverage(file)}), /outside its source file/);
});

test('records negative c8 columns as map warnings without treating reports as compatible', () => {
  const file = 'src/example.js';
  const node = basicCoverage(file);
  node.statementMap[0].start.column = -1;
  const browser = basicCoverage(file);
  const result = combine({[file]: node}, {[file]: browser});
  assert.equal(result.manifest[0].nodeNegativeColumns, 1);
  assert.equal(result.manifest[0].browserNegativeColumns, 0);
  assert.equal(result.manifest[0].maps, 'incompatible; counters not combined');
});

test('records branch arms with no source-map location instead of silently aligning them', () => {
  const file = 'src/example.js';
  const node = basicCoverage(file, {branchCount: 1});
  const browser = basicCoverage(file, {branchCount: 1});
  browser.branchMap[0].locations[1] = {};
  const result = combine({[file]: node}, {[file]: browser});
  assert.equal(result.manifest[0].browserUnmappedBranchLocations, 1);
  assert.equal(result.manifest[0].maps, 'incompatible; counters not combined');
});

test('rejects missing source files and files omitted from either runner inventory', () => {
  const file = 'src/example.js';
  const missing = basicCoverage('src/missing.js');
  assert.throws(() => combine({['src/missing.js']: missing}, {['src/missing.js']: missing}, {
    expectedNodeFiles: ['src/missing.js'], expectedBrowserFiles: ['src/missing.js'],
  }), /source is missing/);
  assert.throws(() => combine({[file]: basicCoverage(file)}, {[file]: basicCoverage(file)}, {
    expectedNodeFiles: [file, 'src/omitted.js'],
  }), /Node source inventory mismatch.*src\/omitted.js/);
  assert.throws(() => combine({[file]: basicCoverage(file)}, {[file]: basicCoverage(file)}, {
    expectedBrowserFiles: [],
  }), /Chromium source inventory mismatch/);
});

test('source inventory excludes only the configured runner helpers', () => {
  mkdirSync(path.join(root, 'netlify', 'functions'), {recursive: true});
  mkdirSync(path.join(root, 'scripts'), {recursive: true});
  writeFileSync(path.join(root, 'netlify', 'functions', 'endpoint.mjs'), 'export default 1;\n');
  writeFileSync(path.join(root, 'scripts', 'run-coverage.mjs'), 'export default 1;\n');
  writeFileSync(path.join(root, 'scripts', 'meaningful.mjs'), 'export default 2;\n');
  assert.deepEqual(expectedCoverageSources(root, ['scripts/run-coverage.mjs']), ['netlify/functions/endpoint.mjs', 'scripts/meaningful.mjs', 'src/example.js']);
});

test('Node coverage fixture records known counts and detects the V8 else-arm source-map offset defect',()=>{
  const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const directory=mkdtempSync(path.join(os.tmpdir(),'dbm-known-coverage-'));
  try{
    const run=spawnSync(process.execPath,[
      path.join(repository,'node_modules','c8','bin','c8.js'),
      '--all','--include=coverage-fixtures/coverage-known.mjs','--reporter=json','--reporter=json-summary',
      `--reports-dir=${path.join(directory,'report')}`,process.execPath,'coverage-fixtures/coverage-known.mjs',
    ],{cwd:repository,encoding:'utf8',env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='NODE_V8_COVERAGE'))});
    assert.equal(run.status,0,run.stderr||run.stdout);
    const summary=JSON.parse(readFileSync(path.join(directory,'report','coverage-summary.json'),'utf8')).total;
    assert.deepEqual(Object.fromEntries(['lines','statements','functions','branches'].map(key=>[key,[summary[key].covered,summary[key].total]])),{
      lines:[4,5],statements:[4,5],functions:[1,1],branches:[2,3],
    });
    const report=JSON.parse(readFileSync(path.join(directory,'report','coverage-final.json'),'utf8'));
    const coverage=Object.values(report).find(entry=>entry.path.replaceAll('\\','/').endsWith('coverage-fixtures/coverage-known.mjs'));
    assert.ok(coverage,'known source must be present in the runner report');
    const negative=[];
    for(const map of [coverage.statementMap,coverage.branchMap,coverage.fnMap])for(const entry of Object.values(map)){
      const locations=[...(entry.locations||[]),entry.start?entry:null,entry.loc,entry.decl].filter(Boolean);
      for(const location of locations)for(const point of [location.start,location.end])if(point?.column<0)negative.push(point);
    }
    assert.deepEqual(negative,[{line:3,column:-1},{line:3,column:-1}], 'c8/V8 maps the unexecuted return arm to an invalid negative column');
    assert.deepEqual(coverage.b,{0:[1],1:[1],2:[0]},'a true-only input must leave the false return uncovered');
  }finally{rmSync(directory,{recursive:true,force:true});}
});
