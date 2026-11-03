import test from 'node:test';
import assert from 'node:assert/strict';
import {monitoringOrigin} from '../scripts/prepare-security-headers.mjs';
test('monitoring CSP permits only the configured official HTTPS ingest origin without credentials or project path',()=>{
 assert.equal(monitoringOrigin('https://public-key@o123.ingest.us.sentry.io/456'),'https://o123.ingest.us.sentry.io');
 for(const input of ['http://o123.ingest.sentry.io/456','https://public:secret@o123.ingest.sentry.io/456','https://evil.example/456','https://o123.ingest.sentry.io/456?token=private','https://o123.ingest.sentry.io/456#fragment','https://o123.ingest.sentry.io:444/456'])assert.throws(()=>monitoringOrigin(input));
});
