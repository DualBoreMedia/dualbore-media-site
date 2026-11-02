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

import videoMetadata from '../netlify/edge-functions/video-metadata.js';
import {createVideoStore} from '../netlify/media/video-database.mjs';
import {runDailyVideoSync} from '../netlify/functions/daily-video-sync.mjs';

const edgeId='xYzAbCdEf12';
const edgeUrl='https://dualboremedia.com/videos/'+edgeId+'/';
const verified={id:edgeId,title:'An actual verified garage upload',image:'https://i.ytimg.com/vi/'+edgeId+'/hqdefault.jpg'};
const edgeRequest=(path=edgeUrl,method='GET')=>new Request(path,{method});
const shell=()=>new Response(original,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Content-Length':String(original.length),ETag:'fixture'}});
test('edge metadata returns a verified title, thumbnail and canonical in first-response HTML',async()=>{
 const oldFetch=globalThis.fetch;
 const incoming=[];
 globalThis.fetch=async(url,options)=>{incoming.push({url:String(url),headers:options.headers});return Response.json({source:'youtube',items:[verified]});};
 try{
  const response=await videoMetadata(edgeRequest(),{next:async()=>shell()});
  const html=await response.text();
  assert.match(html,/<title>An actual verified garage upload \| DualBore Media<\/title>/);
  assert.ok(html.includes('content="'+verified.image+'"'));
  assert.ok(html.includes('rel="canonical" href="'+edgeUrl+'"'));
  assert.equal(response.headers.get('content-length'),null);
  assert.equal(response.headers.get('etag'),null);
  assert.equal(response.headers.get('cache-control'),'public, max-age=60');
  assert.equal(incoming.length,1);
  assert.equal(incoming[0].url,'https://dualboremedia.com/api/video-vault');
 }finally{globalThis.fetch=oldFetch;}
});
test('edge metadata respects prerendered curated heads and never contacts provider for them',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('Unexpected provider call');};
 try{
  const staticPage=original.replace('https://dualboremedia.com/"','https://dualboremedia.com/videos/'+edgeId+'/"');
  const response=await videoMetadata(edgeRequest(),{next:async()=>new Response(staticPage,{headers:{'Content-Type':'text/html'}})});
  assert.equal(await response.text(),staticPage);
 }finally{globalThis.fetch=oldFetch;}
});
test('edge metadata preserves untouched app shell when video is not verified or provider fails',async()=>{
 const oldFetch=globalThis.fetch;
 try{
  for(const provider of [async()=>Response.json({source:'youtube',items:[]}),async()=>Response.json({source:'curated',items:[verified]}),async()=>{throw Error('unavailable')},async()=>new Response(null,{status:503})]){
   globalThis.fetch=provider;
   const html=await (await videoMetadata(edgeRequest(),{next:async()=>shell()})).text();
   assert.equal(html,original);
  }
 }finally{globalThis.fetch=oldFetch;}
});
test('edge does not intercept other paths, non-GET methods, errors or JSON responses',async()=>{
 const oldFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('Unexpected provider call');};
 try{
  const cases=[
   [edgeRequest('https://dualboremedia.com/garage/'),new Response('garage')],
   [edgeRequest(edgeUrl,'HEAD'),new Response(null,{status:200})],
   [edgeRequest(),new Response('unavailable',{status:503,headers:{'Content-Type':'text/html'}})],
   [edgeRequest(),Response.json({app:true})]
  ];
  for(const [request,nextResponse] of cases){
   const actual=await videoMetadata(request,{next:async()=>nextResponse});
   assert.strictEqual(actual,nextResponse);
  }
 }finally{globalThis.fetch=oldFetch;}
});
test('metadata renderer rejects missing title, unsafe images and incomplete HTML without invented tags',()=>{
 for(const film of [{...verified,title:''},{...verified,title:'x'.repeat(181)},{...verified,image:'http://unverified.invalid/image.jpg'}]){
  assert.equal(renderSyncedVideoHtml(original,film),null);
 }
 assert.equal(renderSyncedVideoHtml(original.replace('<meta property="og:image" content="old" />',''),verified),null);
 assert.equal(renderSyncedVideoHtml(original.replace('<link rel="canonical" href="https://dualboremedia.com/" />',''),verified),null);
});
test('video database status reports sanitized latest and saved-feed facts with no private data',async()=>{
 const requests=[];
 class Pool{
  async query(sql,args){
   requests.push([sql,args]);
   if(sql.includes('public_video_sync_runs'))return {rows:[{attempted_at:'2026-11-01T00:00:00Z',updated:false,reason:'cache_unavailable',item_count:0}]};
   if(sql.includes('public_video_snapshots'))return {rows:[{updated_at:'2026-10-31T00:00:00Z',item_count:4}]};
   throw Error('unexpected SQL');
  }
  async end(){}
 }
 const store=createVideoStore({databaseUrl:'postgresql://fixture:fixture@localhost/test',Pool});
 assert.deepEqual(await store.status(),{lastAttemptAt:'2026-11-01T00:00:00Z',updated:false,reason:'cache_unavailable',itemCount:0,lastGoodAt:'2026-10-31T00:00:00Z',savedItemCount:4});
 assert.equal(requests.length,2);
});
test('unavailable video database status fails closed without exposing database errors',async()=>{
 class Pool{async query(){throw Error('synthetic private database failure');}async end(){}}
 const store=createVideoStore({databaseUrl:'postgresql://fixture:fixture@localhost/test',Pool});
 assert.equal(await store.read(),null);
 assert.equal(await store.status(),null);
});
test('scheduled sync records database write failures without treating cache as durable',async()=>{
 const rows=[];
 const result=await runDailyVideoSync({
  enabled:'true',apiKey:'fixture',
  fetcher:async()=>{throw Error('provider unavailable');},
  store:{record:async row=>rows.push(row)},
  cacheApi:null
 });
 assert.equal(result.updated,false);assert.equal(result.reason,'provider_unavailable');
 assert.equal(rows.length,1);assert.equal(rows[0].count,0);
 const status=await runDailyVideoSync({enabled:'false',apiKey:'fixture',store:{record:async()=>{throw Error('offline');}},cacheApi:null});
 assert.equal(status.recorded,false);
 assert.equal(status.updated,false);
});
