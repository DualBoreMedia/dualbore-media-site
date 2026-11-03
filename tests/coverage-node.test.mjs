import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import coverageLibrary from 'istanbul-lib-coverage';
import {convertNodeCoverage, implicitIfLocations} from '../scripts/coverage-node.mjs';
import {combineCoverageReports} from '../scripts/coverage-merge.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = 'coverage-fixtures/coverage-known.mjs';

function collect(directory, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repository, encoding: 'utf8', env: {...process.env, NODE_V8_COVERAGE: directory},
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return readdirSync(directory).filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(path.join(directory, name), 'utf8')));
}

test('AST conversion preserves known original-source counts and the uncovered implicit false path', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dbm-ast-coverage-'));
  try {
    const processes = collect(directory, [fixture]);
    const report = await convertNodeCoverage({root: repository, files: [fixture], processes});
    const map = coverageLibrary.createCoverageMap(report);
    const summary = map.getCoverageSummary().data;
    assert.deepEqual(Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(key => [key, [summary[key].covered, summary[key].total]])), {
      lines: [2, 3], statements: [3, 4], functions: [1, 1], branches: [1, 2],
    });
    const data = Object.values(report)[0];
    assert.deepEqual(data.b, {0: [1, 0]});
    assert.deepEqual(data.s, {0: 1, 1: 1, 2: 0, 3: 1});
    assert.equal(data.branchMap[0].locations[1].start.line, undefined);
    assert.equal(data.branchMap[0].locations[1].end.line, undefined);
    assert.deepEqual([...implicitIfLocations(readFileSync(path.join(repository, fixture), 'utf8'))], ['2:2']);
    for (const entry of Object.values(data.statementMap)) for (const point of [entry.start, entry.end]) {
      assert.ok(point.column === null || point.column >= 0);
    }
    // Use the ordinary Istanbul JSON report representation, including its
    // end-of-line sentinels, just as the combined report does in CI.
    const combined = combineCoverageReports({root: repository, nodeData: JSON.parse(JSON.stringify(report)), browserData: {}, expectedNodeFiles: [fixture], expectedBrowserFiles: []});
    assert.equal(combined.manifest[0].nodeNegativeColumns, 0);
    assert.equal(combined.manifest[0].nodeUnmappedBranchLocations, 0);
    assert.equal(combined.manifest[0].nodeImplicitBranchLocations, 1);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('native process coverage merges actual executions and includes untouched sources with zero hits', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dbm-ast-merge-'));
  const untouched = path.join(directory, 'untouched.mjs');
  try {
    const first = collect(directory, [fixture]);
    const secondDirectory = path.join(directory, 'second');
    const processes = collect(secondDirectory, ['--input-type=module', '-e', `import {classify} from ${JSON.stringify(pathToFileURL(path.join(repository, fixture)).href)}; classify(false);`]);
    const report = await convertNodeCoverage({root: repository, files: [fixture], processes: [...first, ...processes]});
    const data = Object.values(report)[0];
    assert.deepEqual(data.f, {0: 3});
    assert.deepEqual(data.b, {0: [2, 1]});
    writeFileSync(untouched, 'export const choose = input => input ? 1 : 0;\n');
    const zero = await convertNodeCoverage({root: directory, files: ['untouched.mjs'], processes: []});
    const summary = coverageLibrary.createCoverageMap(zero).getCoverageSummary().data;
    for (const metric of ['lines', 'statements', 'functions', 'branches']) {
      assert.ok(summary[metric].total > 0, `${metric} must remain in the denominator`);
      assert.equal(summary[metric].covered, 0);
    }
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('conversion refuses impossible raw offsets and implicit else detection respects explicit alternatives', async () => {
  const absolute = path.join(repository, fixture);
  await assert.rejects(convertNodeCoverage({root: repository, files: [fixture], processes: [{result: [{scriptId: '1', url: pathToFileURL(absolute).href, functions: [{functionName: '', isBlockCoverage: true, ranges: [{startOffset: 0, endOffset: 100000, count: 1}]}]}]}]}), /offsets do not match/);
  assert.equal(implicitIfLocations('if (value) yes(); else no();').size, 0);
  assert.equal(implicitIfLocations('if (value) yes();').size, 1);
  const raw={scriptId:'1',url:pathToFileURL(absolute).href,functions:[{functionName:'',isBlockCoverage:true,ranges:[{startOffset:0,endOffset:10,count:1}]}]};
  await assert.rejects(convertNodeCoverage({root:repository,files:[fixture],processes:[{result:[raw]}]}),/complete original ESM source/);
  await assert.rejects(convertNodeCoverage({root:repository,files:[fixture],processes:[{result:[raw,{...raw,scriptId:'2',url:raw.url+'?another-instance'}]}]}),/Multiple V8 URLs/);
});
