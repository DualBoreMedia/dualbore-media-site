import {spawn} from 'node:child_process';
import {readdir, mkdir, writeFile} from 'node:fs/promises';
import {coveragePolicy} from './coverage-policy.mjs';

const tests = (await readdir(new URL('../tests/', import.meta.url)))
  .filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/' + name);
await mkdir('test-results', {recursive: true});
await writeFile('test-results/coverage-policy.json', JSON.stringify(coveragePolicy, null, 2));
// Invoke the installed exact dependency directly: no npx network resolution and
// no shell/glob differences between Windows and GitHub's Linux runner.
const args = ['node_modules/c8/bin/c8.js'];
for (const [key, value] of Object.entries(coveragePolicy)) {
  for (const part of Array.isArray(value) ? value : [value]) args.push('--' + key + '=' + part);
}
args.push(process.execPath, '--test', ...tests);
const child = spawn(process.execPath, args, {stdio: 'inherit', env: process.env});
child.once('error', error => {console.error('Coverage runner failed:', error.code || 'RUNNER_ERROR'); process.exitCode = 1;});
child.once('exit', code => {process.exitCode = code ?? 1;});
