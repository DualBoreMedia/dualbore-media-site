import test from 'node:test';
import assert from 'node:assert/strict';
import {coveragePolicy} from '../scripts/coverage-policy.mjs';

test('coverage fails closed at launch thresholds and counts unimported application files', () => {
  assert.equal(coveragePolicy.all, true);
  assert.deepEqual([coveragePolicy.lines, coveragePolicy.statements, coveragePolicy.functions, coveragePolicy.branches], [90, 90, 90, 85]);
  assert.equal(coveragePolicy['check-coverage'], true);
  for (const area of ['netlify/', 'src/', 'worker/', 'scripts/']) assert.ok(coveragePolicy.include.some(pattern => pattern.startsWith(area)));
  assert.ok(coveragePolicy.extension.includes('.jsx'));
  assert.ok(coveragePolicy.reporter.includes('html'));
  assert.ok(coveragePolicy.reporter.includes('lcov'));
  assert.ok(coveragePolicy.reporter.includes('json-summary'));
  assert.ok(coveragePolicy.exclude.every(pattern => pattern.startsWith('scripts/')));
});
