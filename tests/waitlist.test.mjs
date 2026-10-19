import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeWaitlist, submitWaitlist } from '../src/waitlist.js';

const valid = { name: 'QA & Test', email: 'qa+drop@example.invalid', style: 'e92-tee', size: 'M', consent: 'yes' };
test('waitlist rejects invalid input, unsupported choices, missing consent, and honeypots before sending', async () => {
  for (const change of [{name:' '},{email:'bad'},{style:'other'},{size:'XXXL'},{consent:''},{'bot-field':'spam'}]) {
    let sent = false;
    await assert.rejects(submitWaitlist({...valid,...change}, { hostname:'example.com', request:async()=>{sent=true;} }));
    assert.equal(sent,false);
  }
});
test('encodes form fields safely and sends exactly the static detection fields', async () => {
  const encoded = encodeWaitlist(valid);
  assert.equal(encoded.get('name'),'QA & Test');
  assert.equal(encoded.get('email'),'qa+drop@example.invalid');
  const skeleton = fs.readFileSync(new URL('./fixtures/drop-waitlist.html',import.meta.url),'utf8');
  for (const field of encoded.keys()) assert.ok(skeleton.includes(`name="${field}"`), field);
  assert.equal(fs.existsSync(new URL('../public/__forms.html',import.meta.url)),false,'paused form detector must not be published');
  await submitWaitlist(valid,{hostname:'example.com',request:async(path,options)=>{
    assert.equal(path,'/__forms.html'); assert.equal(options.method,'POST');
    assert.equal(options.headers['Content-Type'],'application/x-www-form-urlencoded');
    assert.equal(new URLSearchParams(options.body).get('form-name'),'drop-waitlist');
    return {ok:true};
  }});
});
test('failed, offline, and local submissions never report success',async()=>{
  await assert.rejects(submitWaitlist(valid,{hostname:'example.com',request:async()=>({ok:false})}),/not saved/);
  await assert.rejects(submitWaitlist(valid,{hostname:'example.com',request:async()=>{throw new TypeError('offline');}}));
  let sent=false;
  await assert.rejects(submitWaitlist(valid,{hostname:'127.0.0.1',request:async()=>{sent=true;return {ok:true};}}),/local preview/);
  assert.equal(sent,false);
});
