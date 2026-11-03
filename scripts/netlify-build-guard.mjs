import { ignoreExitCode } from './netlify-ignore.mjs';

// Netlify ignores its ignore command for build hooks. Recheck before compilation.
// Local builds remain available and do not authorize or perform deployment.
if (process.env.NETLIFY === 'true' && ignoreExitCode() !== 1) {
  console.error('Blocked Netlify compilation: the production commit is not approved.');
  process.exitCode = 1;
}
