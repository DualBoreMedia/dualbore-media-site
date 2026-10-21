import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}

test('built client files contain no Resend key, server configuration, or email-sending endpoint', async () => {
  const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
  const files = await filesIn(root);
  for (const file of files.filter(value => /\.(html|js|css|json|map|txt)$/i.test(value))) {
    const text = await readFile(file, 'utf8');
    assert.equal(/CLERK_SECRET_KEY|WORKOS_(API_KEY|COOKIE_PASSWORD)|SENTRY_AUTH_TOKEN|PAYMENTS_ENABLED|TRANSACTIONAL_EMAILS_ENABLED|STRIPE_(SECRET_KEY|WEBHOOK_SECRET)|DATABASE_URL|RESEND_(API_KEY|FROM|REPLY_TO|NOTIFY_TO)|api\.resend\.com|re_resend_build_canary_/.test(text), false, path.basename(file));
    assert.doesNotMatch(text,/DEMO-ONLY-NOT-A-REAL-TOKEN|__demo\/control|demo-order-|TEST \/ DEMO/,path.basename(file));
    assert.equal(/\b(?:re_|sk_live_|sk_test_)[A-Za-z0-9_-]{24,}\b/.test(text), false, path.basename(file));
  }
});
