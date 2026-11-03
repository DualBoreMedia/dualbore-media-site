import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWebsite} from '../scripts/check-website.mjs';

function websiteFixture() {
  const files = Object.fromEntries([
    'dist/client/index.html', 'dist/server/index.js', 'dist/.openai/hosting.json',
    'dist/client/_headers', 'dist/client/_redirects', 'dist/client/robots.txt',
    'dist/client/sitemap.xml', 'dist/client/assets/favicon.svg',
    ...[5076, 5077, 5078].flatMap(n => [480, 768].map(w => `dist/client/assets/IMG_${n}-${w}.jpg`)),
  ].map(name => [name, 'present']));
  files['dist/client/index.html'] = '<title>DualBore Media</title><link rel="canonical" href="https://dualboremedia.com/">';
  files['dist/client/_headers'] = "Content-Security-Policy: script-src 'self'; frame-ancestors 'none'\nX-Content-Type-Options: nosniff\nStrict-Transport-Security:";
  files['dist/client/_redirects'] = '/* /index.html 200';
  files['dist/client/robots.txt'] = 'Sitemap: https://dualboremedia.com/sitemap.xml';
  files['dist/client/sitemap.xml'] = '<loc>https://dualboremedia.com/</loc>';
  return files;
}

test('public website gate accepts packaged website facts with both switches explicitly off', () => {
  assert.deepEqual(checkWebsite({files: websiteFixture(), env: {PAYMENTS_ENABLED: 'false', TRANSACTIONAL_EMAILS_ENABLED: 'false'}}), {ready: true, blockers: [], level: 'public-website'});
});

test('public website gate rejects payment or email activation independently of sales approval', () => {
  const files = websiteFixture();
  assert.equal(checkWebsite({files, env: {PAYMENTS_ENABLED: 'false', TRANSACTIONAL_EMAILS_ENABLED: 'false'}}).ready, true);
  for (const flag of ['PAYMENTS_ENABLED', 'TRANSACTIONAL_EMAILS_ENABLED']) {
    const result = checkWebsite({files, env: {PAYMENTS_ENABLED: 'false', TRANSACTIONAL_EMAILS_ENABLED: 'false', [flag]: 'true'}});
    assert.equal(result.ready, false);
    assert.ok(result.blockers.some(blocker => blocker.includes(flag)));
  }
  assert.ok(checkWebsite({files: {...files, 'dist/client/_headers': ''}, env: {PAYMENTS_ENABLED: 'false', TRANSACTIONAL_EMAILS_ENABLED: 'false'}}).blockers.some(blocker => blocker.includes('security headers')));
});

test('public website gate blocks private source maps in the deployable client tree', () => {
  const files = websiteFixture();
  files['dist/client/assets/app.js.map'] = 'source map';
  const result = checkWebsite({files, env: {PAYMENTS_ENABLED: 'false', TRANSACTIONAL_EMAILS_ENABLED: 'false'}});
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some(blocker => blocker.includes('Private source map')));
});
