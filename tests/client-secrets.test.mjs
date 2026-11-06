import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}

// WorkOS uses opaque sk_ credentials as well as the provider-specific formats.
const containsSecretToken = text => /\b(?:re_|sk_)[A-Za-z0-9_-]{24,}(?![A-Za-z0-9_-])/.test(text);

test('client token scanner rejects opaque WorkOS credentials and existing provider secret formats', () => {
  for (const prefix of ['sk_', 'sk_live_', 'sk_test_', 're_']) {
    const syntheticToken = prefix + 'SYNTHETIC'.repeat(4);
    assert.equal(containsSecretToken(JSON.stringify({config: syntheticToken})), true);
    for (const ending of ['-', '_']) {
      assert.equal(containsSecretToken(JSON.stringify({config: prefix + 'A'.repeat(23) + ending})), true);
    }
  }
  assert.equal(containsSecretToken('public product SKU and ordinary application content'), false);
});

test('built client files contain no Resend key, server configuration, or email-sending endpoint', async () => {
  const root = fileURLToPath(new URL('../dist/client/', import.meta.url));
  const files = await filesIn(root);
  for (const file of files.filter(value => /\.(html|js|css|json|map|txt)$/i.test(value))) {
    const text = await readFile(file, 'utf8');
    assert.equal(/CLERK_SECRET_KEY|WORKOS_(API_KEY|COOKIE_PASSWORD)|SYNTHETIC_COOKIE_PASSWORD_SERVER_ONLY_BUILD_CANARY|SENTRY_AUTH_TOKEN|PAYMENTS_ENABLED|TRANSACTIONAL_EMAILS_ENABLED|STRIPE_(SECRET_KEY|WEBHOOK_SECRET)|DATABASE_URL|RESEND_(API_KEY|FROM|REPLY_TO|NOTIFY_TO)|api\.resend\.com|re_resend_build_canary_/.test(text), false, path.basename(file));
    assert.doesNotMatch(text,/DEMO-ONLY-NOT-A-REAL-TOKEN|__demo\/control|demo-order-|TEST \/ DEMO/,path.basename(file));
    assert.equal(containsSecretToken(text), false, path.basename(file));
  }
});
