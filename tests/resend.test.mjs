import assert from 'node:assert/strict';
import test from 'node:test';
import { processSubmission, validateSubmission, confirmationMessage } from '../netlify/lib/drop-waitlist-email.mjs';
import handler from '../netlify/functions/drop-waitlist-email.mjs';

const event = { data: { 'form-name': 'drop-waitlist', name: 'Alex', email: 'alex@example.com', style: 'e92-tee', size: 'XL', consent: 'yes', 'bot-field': '' } };
const settings = { RESEND_API_KEY: 're_test_only_dummy', RESEND_FROM: 'DualBore Media <alerts@example.com>', RESEND_REPLY_TO: 'crew@example.com' };
const setup = overrides => {
  const sent = [], logs = [], delays = [];
  return { sent, logs, delays, options: { env: key => settings[key], request: async (url, options) => { sent.push({ url, ...options }); return Response.json({ id: 'email_test' }); }, log: (...args) => logs.push(args), pause: async delay => { delays.push(delay); }, ...overrides } };
};

test('accepted Drop 01 signup sends HTML and text confirmation through the official server API', async () => {
  const context = setup();
  assert.deepEqual(await processSubmission(event, context.options), { status: 'sent' });
  assert.equal(context.sent.length, 1);
  const request = context.sent[0];
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.headers.Authorization, 'Bearer re_test_only_dummy');
  const body = JSON.parse(request.body);
  assert.deepEqual(body.to, ['alex@example.com']);
  assert.equal(body.reply_to, 'crew@example.com');
  assert.equal(body.subject, "You're on the DualBore Media Drop 01 list");
  assert.match(body.text, /E92 Coupe Line-Art Tee/);
  assert.match(body.text, /Size: XL/);
  assert.match(body.text, /not an order, reservation, or guarantee of inventory/);
  assert.match(body.html, /<html lang="en">/);
  assert.equal(JSON.stringify(context.logs).includes('alex@example.com'), false);
  assert.equal(JSON.stringify(context.logs).includes(settings.RESEND_API_KEY), false);
});

test('only the intended verified form event is handled; there is no public fetch handler', async () => {
  assert.deepEqual(Object.keys(handler), ['formSubmitted']);
  for (const unrelated of [{ data: { ...event.data, 'form-name': 'contact' } }, { data: {} }, {}, { payload: event.data }]) {
    const context = setup();
    assert.deepEqual(await processSubmission(unrelated, context.options), { status: 'ignored' });
    assert.equal(context.sent.length, 0);
  }
});

test('production waitlist stays paused independently of transactional order email',async()=>{
  const context=setup({env:key=>({COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'true',DROP_WAITLIST_ENABLED:'false',...settings})[key]});
  assert.deepEqual(await processSubmission(event,context.options),{status:'disabled'});
  assert.equal(context.sent.length,0);
});

test('production waitlist confirmation has its own marketing-email switch',async()=>{
  const context=setup({env:key=>({COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false',DROP_WAITLIST_ENABLED:'true',MARKETING_EMAILS_ENABLED:'false',...settings})[key]});
  assert.deepEqual(await processSubmission(event,context.options),{status:'recorded'});
  assert.equal(context.sent.length,0);
});

test('production marketing confirmation can be enabled without enabling transactional order email',async()=>{
  const context=setup({env:key=>({COMMERCE_ENVIRONMENT:'production',PAYMENTS_ENABLED:'false',TRANSACTIONAL_EMAILS_ENABLED:'false',DROP_WAITLIST_ENABLED:'true',MARKETING_EMAILS_ENABLED:'true',...settings})[key]});
  assert.deepEqual(await processSubmission(event,context.options),{status:'sent'});
  assert.equal(context.sent.length,1);
});

for (const [label, change] of [
  ['missing consent', { consent: '' }], ['invalid email', { email: 'bad-email' }],
  ['multiple recipient injection', { email: 'a@example.com,b@example.com' }],
  ['unsupported style', { style: 'unknown' }], ['unsupported size', { size: '5XL' }],
  ['honeypot', { 'bot-field': 'bot' }], ['malformed event field', { size: ['XL'] }],
]) {
  test(`server validation rejects ${label} before any email is sent`, async () => {
    const context = setup();
    assert.deepEqual(await processSubmission({ data: { ...event.data, ...change } }, context.options), { status: 'invalid' });
    assert.equal(context.sent.length, 0);
    assert.deepEqual(context.logs, [['invalid_submission']]);
  });
}

for (const variable of ['RESEND_API_KEY', 'RESEND_FROM']) {
  test(`missing ${variable} safely skips email without changing the saved signup`, async () => {
    const context = setup({ env: key => key === variable ? undefined : settings[key] });
    assert.deepEqual(await processSubmission(event, context.options), { status: 'unconfigured' });
    assert.equal(context.sent.length, 0);
    assert.deepEqual(context.logs, [['configuration_missing', { variables: [variable] }]]);
  });
}

test('HTML handles submitted text safely, with a readable plain-text fallback', () => {
  const malicious = { data: { ...event.data, name: '<img src=x onerror="alert(1)">' } };
  const message = confirmationMessage(validateSubmission(malicious));
  assert.equal(message.html.includes('<img'), false);
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(message.text, /Hi <img/);
});

test('transient provider failures retry with backoff and the same idempotency key', async () => {
  let attempts = 0;
  const requests = [];
  const context = setup({ request: async (url, options) => { requests.push(options); return ++attempts < 3 ? new Response('', { status: attempts === 1 ? 429 : 503 }) : Response.json({ id: 'email_test' }); } });
  assert.deepEqual(await processSubmission(event, context.options), { status: 'sent' });
  assert.deepEqual(context.delays, [1000, 2000]);
  assert.equal(new Set(requests.map(item => item.headers['Idempotency-Key'])).size, 1);
  assert.equal(new Set(requests.map(item => item.body)).size, 1);
});

test('permanent API failures are not retried and do not expose provider diagnostics', async () => {
  let attempts = 0;
  const context = setup({ request: async () => { attempts++; return Response.json({ message: 'private provider diagnostics' }, { status: 403 }); } });
  await assert.rejects(processSubmission(event, context.options), { message: 'Drop confirmation email could not be sent' });
  assert.equal(attempts, 1);
  assert.equal(context.delays.length, 0);
  assert.equal(JSON.stringify(context.logs).includes('private provider'), false);
});

test('timeouts and network failures retry only three times', async () => {
  let attempts = 0;
  const context = setup({ request: async () => { attempts++; throw new TypeError('private network detail'); } });
  await assert.rejects(processSubmission(event, context.options));
  assert.equal(attempts, 3);
  assert.deepEqual(context.delays, [1000, 2000]);
  assert.equal(JSON.stringify(context.logs).includes('private network'), false);
});

test('replayed identical events use the same opaque key; changed preferences use a different key', async () => {
  const context = setup();
  await processSubmission(event, context.options);
  await processSubmission(event, context.options);
  await processSubmission({ data: { ...event.data, size: 'S' } }, context.options);
  const keys = context.sent.map(request => request.headers['Idempotency-Key']);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert.equal(keys[0].includes(event.data.email), false);
});

test('optional internal notices have separate recipients and idempotency keys', async () => {
  const context = setup({ env: key => key === 'RESEND_NOTIFY_TO' ? 'owner@example.com' : settings[key] });
  await processSubmission(event, context.options);
  assert.equal(context.sent.length, 2);
  assert.deepEqual(JSON.parse(context.sent[1].body).to, ['owner@example.com']);
  assert.notEqual(context.sent[0].headers['Idempotency-Key'], context.sent[1].headers['Idempotency-Key']);
});

test('platform wrapper reads only server variables and does not respond to the browser', async () => {
  globalThis.Netlify = { env: { get: () => undefined } };
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.equal(await handler.formSubmitted(event), undefined); }
  finally { console.warn = originalWarn; delete globalThis.Netlify; }
});
