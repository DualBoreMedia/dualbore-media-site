import test from 'node:test';
import assert from 'node:assert/strict';
import {runDailyVideoSync} from '../netlify/functions/daily-video-sync.mjs';
import {resolvePublicVideoVault} from '../netlify/functions/video-vault.mjs';
import {createVideoStore} from '../netlify/media/video-database.mjs';

const id='aB1cD2eF3gH';
const item={id,title:'Garage test upload',image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',category:'Turbo Cars',label:'CHANNEL UPLOAD',duration:'01:00'};
const snapshot={source:'youtube',updatedAt:'2026-11-01T00:00:00.000Z',items:[item]};
function youtubeFetcher(url){
 const resource=new URL(url).pathname.split('/').at(-1);
 const items=resource==='channels'?[{id:'UC'+'a'.repeat(22),contentDetails:{relatedPlaylists:{uploads:'UU'+'b'.repeat(22)}}}]:resource==='playlistItems'?[{contentDetails:{videoId:id}}]:[{id,snippet:{channelId:'UC'+'a'.repeat(22),title:item.title,publishedAt:'2026-11-01T00:00:00Z'},status:{privacyStatus:'public'},contentDetails:{duration:'PT1M'}}];
 return Promise.resolve(Response.json({items}));
}
test('disabled scheduled refresh records exactly one safe outcome without provider calls',async()=>{
 const rows=[],store={record:async row=>rows.push(row)};
 const result=await runDailyVideoSync({enabled:'false',apiKey:'unused',store,fetcher:()=>{throw Error('no network allowed');},now:()=>new Date('2026-11-01T08:00:00Z')});
 assert.deepEqual(result,{updated:false,count:0,reason:'disabled'});
 assert.deepEqual(rows,[{time:'2026-11-01T08:00:00.000Z',updated:false,count:0,reason:'disabled'}]);
});
test('verified refresh saves a durable snapshot and one outcome even without Cache API',async()=>{
 const rows=[],snapshots=[],store={save:async value=>{snapshots.push(value);return true;},record:async row=>rows.push(row)};
 const result=await runDailyVideoSync({enabled:'true',apiKey:'synthetic',fetcher:youtubeFetcher,store,cacheApi:null});
 assert.equal(result.updated,true);assert.equal(result.reason,'updated');assert.equal(result.count,1);
 assert.equal(rows.length,1);assert.equal(rows[0].count,1);assert.equal(snapshots[0].items[0].id,id);
});
test('provider failure records an outcome and still serves the verified last-good database feed',async()=>{
 const rows=[],store={read:async()=>snapshot,record:async row=>rows.push(row)};
 const status=await runDailyVideoSync({enabled:'true',apiKey:'synthetic',fetcher:()=>{throw Error('provider failure');},store});
 assert.equal(status.updated,false);assert.equal(status.reason,'provider_unavailable');assert.equal(rows.length,1);
 const result=await resolvePublicVideoVault({enabled:'true',apiKey:'synthetic',fetcher:()=>{throw Error('must not fetch');},store});
 assert.deepEqual(result,snapshot);
});
test('no database and disabled public refresh preserve the five curated videos',async()=>{
 assert.equal(createVideoStore({databaseUrl:''}),null);
 const feed=await resolvePublicVideoVault({enabled:'false',store:{read:async()=>snapshot}});
 assert.equal(feed.source,'curated');assert.equal(feed.items.length,5);
});
test('PostgreSQL adapter parameterizes writes and rejects unverified image URLs',async()=>{
 const queries=[];let closed=false;
 class Pool{async query(sql,args){queries.push([sql,args]);return sql.startsWith('SELECT')?{rows:[{payload:snapshot}]}:{rows:[]};}async end(){closed=true;}}
 const store=createVideoStore({databaseUrl:'postgresql://fixture:fixture@127.0.0.1/test',Pool});
 assert.deepEqual(await store.read(),snapshot);
 assert.equal(await store.save({...snapshot,items:[{...item,image:'https://example.invalid/image.jpg'}]}),false);
 assert.equal(await store.save(snapshot),true);
 await store.record({time:'2026-11-01T08:00:00Z',updated:true,reason:'updated',count:1});
 assert.equal(queries.length,3);assert.equal(queries[1][1][0],'latest');assert.equal(queries[2][1][3],1);
 await store.close();assert.equal(closed,true);
});

test('newer verified cache beats an older durable snapshot without a public provider request',async()=>{
 const cached={...snapshot,updatedAt:'2026-11-12T10:00:00Z'};
 const cacheApi={open:async()=>({match:async()=>Response.json(cached)})};
 assert.deepEqual(await resolvePublicVideoVault({enabled:'true',store:{read:async()=>snapshot},cacheApi}),cached);
 assert.deepEqual(await resolvePublicVideoVault({enabled:'true',store:{read:async()=>cached},cacheApi:{open:async()=>({match:async()=>Response.json(snapshot)})}}),cached);
});

test('superseded refresh never reports a write or overwrites a newer cache snapshot',async()=>{
 let writes=0;const rows=[];const store={save:async()=> 'superseded',record:async r=>rows.push(r)};
 const result=await runDailyVideoSync({enabled:'true',apiKey:'synthetic',fetcher:youtubeFetcher,store,cacheApi:{open:async()=>({put:async()=>writes++})}});
 assert.equal(result.reason,'superseded');assert.equal(result.updated,false);assert.equal(result.count,0);assert.equal(writes,0);assert.equal(rows[0].reason,'superseded');
 const adapter=createVideoStore({databaseUrl:'postgresql://fixture:fixture@127.0.0.1/test',Pool:class{async query(){return{rowCount:0};}async end(){}}});assert.equal(await adapter.save(snapshot),'superseded');await adapter.close();
});
