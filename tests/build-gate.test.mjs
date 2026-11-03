import assert from 'node:assert/strict';
import test from 'node:test';
import { mayBuild, ignoreExitCode } from '../scripts/netlify-ignore.mjs';

test('only an approved marker in the production main commit subject permits a Git build', () => {
  const approved = { context: 'production', branch: 'main', message: '[deploy netlify] Release waitlist email' };
  assert.equal(mayBuild(approved), true);
  for (const change of [
    { message: '[skip netlify] Work in progress' }, { message: 'Normal commit' },
    { message: 'Normal commit\n\n[deploy netlify]' }, { message: '[skip netlify] [deploy netlify]' },
    { context: 'deploy-preview' }, { context: 'branch-deploy' }, { branch: 'feature/email' },
  ]) assert.equal(mayBuild({ ...approved, ...change }), false);
});

test('Netlify exit semantics are fail-closed when Git metadata is missing or invalid', () => {
  const env = { CONTEXT: 'production', BRANCH: 'main', COMMIT_REF: 'a'.repeat(40) };
  assert.equal(ignoreExitCode(env, () => '[deploy netlify] Release'), 1);
  assert.equal(ignoreExitCode(env, () => '[skip netlify] Develop'), 0);
  assert.equal(ignoreExitCode(env, () => { throw new Error('Git unavailable'); }), 0);
  assert.equal(ignoreExitCode({ ...env, COMMIT_REF: '--bad-option' }, () => { throw new Error('Must not be called'); }), 0);
  assert.equal(ignoreExitCode({}, () => { throw new Error('Must not be called'); }), 0);
});
