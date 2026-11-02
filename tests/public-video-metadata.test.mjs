import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSyncedVideoHtml} from '../netlify/media/video-page-metadata.mjs';
const original='<html><head><title>Default</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /><meta property="og:url" content="old" /><meta property="og:image" content="old" /><meta name="twitter:title" content="old" /><meta name="twitter:description" content="old" /><meta name="twitter:image" content="old" /><link rel="canonical" href="https://dualboremedia.com/" /></head><body>App</body></html>';
test('verified new upload appears in the first HTML head with canonical and safe share card',()=>{
 const id='xYzAbCdEf12',film={id,title:'New <Turbo> & "Ride"',image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'};
 const html=renderSyncedVideoHtml(original,film);
 assert.match(html,/<title>New &lt;Turbo&gt; &amp; &quot;Ride&quot; \| DualBore Media<\/title>/);
 assert.match(html,/rel="canonical" href="https:\/\/dualboremedia.com\/videos\/xYzAbCdEf12\/"/);
 assert.match(html,/og:image" content="https:\/\/i.ytimg.com\/vi\/xYzAbCdEf12\/hqdefault.jpg"/);
 assert.ok(html.includes('<body>App</body>'));assert.ok(!html.includes('<Turbo>'));
});
test('invalid, absent and forged media never creates an invented head title',()=>{
 for(const film of [null,{id:'invalid',title:'fake',image:''},{id:'xYzAbCdEf12',title:'fake',image:'https://attacker.invalid/x.jpg'}])
  assert.equal(renderSyncedVideoHtml(original,film),null);
});
