import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function mayBuild({ context, branch, message }) {
  const subject = String(message || '').split(/\r?\n/)[0];
  return context === 'production' && branch === 'main'
    && subject.includes('[deploy netlify]') && !subject.includes('[skip netlify]');
}

export function ignoreExitCode(env = process.env, readCommit = ref => execFileSync('git', ['show', '-s', '--format=%B', ref], { encoding: 'utf8' })) {
  // Never use a marker found in the diff, repository files, or older commits.
  if (!/^[a-f0-9]{40,64}$/i.test(env.COMMIT_REF || '')) return 0;
  try {
    return mayBuild({ context: env.CONTEXT, branch: env.BRANCH, message: readCommit(env.COMMIT_REF) }) ? 1 : 0;
  } catch { return 0; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = ignoreExitCode();
  console.log(code === 0 ? 'Skipping unapproved Netlify build.' : 'Approved production marker found.');
  // Netlify ignore semantics: 0 cancels, 1 continues.
  process.exitCode = code;
}
