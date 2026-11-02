import test from 'node:test';
import assert from 'node:assert/strict';
import {loadYouTubeVault,formatYouTubeDuration,categoryForUpload} from '../netlify/media/youtube.mjs';
import videoVault,{config as vaultConfig,resolvePublicVideoVault} from '../netlify/functions/video-vault.mjs';
import {readVideoSnapshot,writeVideoSnapshot} from '../netlify/media/video-cache.mjs';
import {runDailyVideoSync,config as scheduleConfig} from '../netlify/functions/daily-video-sync.mjs';

const channelId='UC'+'A'.repeat(22),uploadsId='UU'+'A'.repeat(22),id='aB0_9-hT3YQ';
function fixtureFetcher({status=200,invalid=false}={}){
 const calls=[];
 const fetcher=async url=>{
  const parsed=new URL(url);calls.push(parsed);
  assert.equal(parsed.origin,'https://www.googleapis.com');
  assert.equal(parsed.searchParams.get('key'),'synthetic-key');
  if(status!==200)return {ok:false,status,json:async()=>({})};
  if(parsed.pathname.endsWith('/channels'))return {ok:true,json:async()=>({items:[{id:channelId,contentDetails:{relatedPlaylists:{uploads:uploadsId}}}]})};
  if(parsed.pathname.endsWith('/playlistItems'))return {ok:true,json:async()=>({items:[{contentDetails:{videoId:id}},{contentDetails:{videoId:id}},{contentDetails:{videoId:'!unsafe'}}]})};
  if(parsed.pathname.endsWith('/videos'))return {ok:true,json:async()=>({items:[{id,snippet:{channelId:invalid?'UC'+'Z'.repeat(22):channelId,title:'New N54 Test Episode',publishedAt:'2026-10-31T08:00:00Z'},contentDetails:{duration:'PT1H4M09S'},status:{privacyStatus:'public'}}]})};
  throw Error('unexpected request');
 };
 return {fetcher,calls};
}

test('YouTube durations and project classification are bounded and specific',()=>{
 assert.equal(formatYouTubeDuration('PT19M4S'),'19:04');
 assert.equal(formatYouTubeDuration('PT1H4M9S'),'1:04:09');
 assert.equal(formatYouTubeDuration('PT51S'),'0:51');
 assert.equal(formatYouTubeDuration('untrusted'),'Duration unavailable');
 assert.equal(categoryForUpload({id,title:'New N54 update'}),'Turbo Cars');
 assert.equal(categoryForUpload({id,title:'Updates from our channel'}),'Channel Uploads');
});
test('YouTube public upload feed preserves provider ordering, safe IDs and actual duration',async()=>{
 const {fetcher,calls}=fixtureFetcher();
 const result=await loadYouTubeVault({apiKey:'synthetic-key',fetcher,now:()=>new Date('2026-11-01T00:00:00Z')});
 assert.equal(result.source,'youtube');assert.equal(result.updatedAt,'2026-11-01T00:00:00.000Z');
 assert.deepEqual(result.items.map(x=>x.id),[id]);assert.equal(result.items[0].title,'New N54 Test Episode');assert.equal(result.items[0].duration,'1:04:09');
 assert.equal(result.items[0].category,'Turbo Cars');assert.equal(result.items[0].image,'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg');
 assert.equal(calls.length,3);assert.equal(calls[0].searchParams.get('forHandle'),'DualBoreMedia');
});
test('provider failure, absent key and mismatched channel never erase curated content',async()=>{
 const fallback=await loadYouTubeVault({});
 assert.equal(fallback.source,'curated');assert.equal(fallback.items.length,5);
 for(const args of [fixtureFetcher({status:503}),fixtureFetcher({invalid:true})]){
  const result=await loadYouTubeVault({apiKey:'synthetic-key',fetcher:args.fetcher});
  assert.equal(result.source,'curated');assert.equal(result.items.length,5);
  assert.equal(JSON.stringify(result).includes('synthetic-key'),false);
 }
});

test('public video endpoint never reveals provider credentials and does not accept writes',async()=>{
 const original=process.env.YOUTUBE_API_KEY;delete process.env.YOUTUBE_API_KEY;
 try{
  assert.equal(vaultConfig.path,'/api/video-vault');
  const get=await videoVault(new Request('https://dualboremedia.com/api/video-vault'));
  assert.equal(get.status,200);
  const body=await get.json();
  assert.equal(body.source,'curated');
  assert.equal(body.items.length,5);
  assert.equal(get.headers.get('X-Content-Type-Options'),'nosniff');
  assert.ok(get.headers.get('Netlify-CDN-Cache-Control').includes('max-age=180'));
  const blocked=await videoVault(new Request('https://dualboremedia.com/api/video-vault',{method:'POST'}));
  assert.equal(blocked.status,405);
  const head=await videoVault(new Request('https://dualboremedia.com/api/video-vault',{method:'HEAD'}));
  assert.equal(head.status,200);assert.equal(await head.text(),'');
 }finally{if(original===undefined)delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=original;}
});

function fakeCache(){
 const data=new Map();
 return {open:async()=>({
  match:async key=>data.get(key.url)?.clone(),
  put:async(key,response)=>{data.set(key.url,response.clone());}
 })};
}

test('concurrent public cache misses and cache failures never spend provider quota',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('public provider call');};
 for(const cacheApi of [fakeCache(),{}, {open:async()=>{throw Error('storage unavailable');}}]){
  const results=await Promise.all(Array.from({length:20},()=>resolvePublicVideoVault({enabled:'true',apiKey:'synthetic-key',fetcher,cacheApi})));
  assert.ok(results.every(result=>result.source==='curated'));
 }
 assert.equal(calls,0);
});

test('enabled public GET and HEAD never use the configured provider key or write snapshots',async t=>{
 const oldKey=process.env.YOUTUBE_API_KEY,oldEnabled=process.env.YOUTUBE_SYNC_ENABLED,descriptor=Object.getOwnPropertyDescriptor(globalThis,'caches');
 let calls=0,writes=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('provider must not be called');});
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{open:async()=>({match:async()=>undefined,put:async()=>{writes++;}})}});
 process.env.YOUTUBE_API_KEY='synthetic-key';process.env.YOUTUBE_SYNC_ENABLED='true';
 try{
  for(const method of ['GET','HEAD']){
   const response=await videoVault(new Request('https://dualboremedia.com/api/video-vault',{method}));
   assert.equal(response.status,200);
   if(method==='HEAD')assert.equal(await response.text(),'');else assert.equal((await response.json()).source,'curated');
  }
  assert.equal(calls,0);assert.equal(writes,0);
 }finally{
  if(oldKey===undefined)delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=oldKey;
  if(oldEnabled===undefined)delete process.env.YOUTUBE_SYNC_ENABLED;else process.env.YOUTUBE_SYNC_ENABLED=oldEnabled;
  if(descriptor)Object.defineProperty(globalThis,'caches',descriptor);else delete globalThis.caches;
 }
});
test('a successful scheduled upload snapshot survives later provider outages',async()=>{
 assert.equal(scheduleConfig.schedule,'0 10 * * *');
 const storage=fakeCache(),ok=fixtureFetcher();
 const saved=await runDailyVideoSync({enabled:'true',apiKey:'synthetic-key',fetcher:ok.fetcher,cacheApi:storage});
 assert.equal(saved.updated,true);assert.equal(saved.count,1);
 const previous=await readVideoSnapshot(storage);assert.equal(previous.items[0].title,'New N54 Test Episode');
 const unavailable=await runDailyVideoSync({enabled:'true',apiKey:'synthetic-key',fetcher:fixtureFetcher({status:503}).fetcher,cacheApi:storage});
 assert.equal(unavailable.updated,false);assert.deepEqual(await readVideoSnapshot(storage),previous);
 const noNetwork=async()=>{throw Error('must not fetch when cache exists');};
 const displayed=await resolvePublicVideoVault({enabled:'true',apiKey:'synthetic-key',fetcher:noNetwork,cacheApi:storage});
 assert.deepEqual(displayed,previous);
});
test('scheduled YouTube sync is disabled by default and never caches fallback fixtures',async()=>{
 const storage=fakeCache();
 const result=await runDailyVideoSync({enabled:'false',apiKey:'synthetic-key',fetcher:async()=>{throw Error('unexpected request');},cacheApi:storage});
 assert.equal(result.updated,false);assert.equal(await readVideoSnapshot(storage),null);
 const fallback=await resolvePublicVideoVault({enabled:'false',apiKey:'synthetic-key',fetcher:async()=>{throw Error('unexpected request');},cacheApi:storage});
 assert.equal(fallback.source,'curated');
 assert.equal(await writeVideoSnapshot(fallback,storage),false);
});
