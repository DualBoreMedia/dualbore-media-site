import {loadYouTubeVault} from '../media/youtube.mjs';
import {writeVideoSnapshot} from '../media/video-cache.mjs';
import {createVideoStore} from '../media/video-database.mjs';

export async function runDailyVideoSync({enabled,apiKey,fetcher,cacheApi,store,now=()=>new Date()}={}){
 const time=now().toISOString();
 let status={updated:false,count:0,reason:'disabled'};
 try{
  if(enabled==='true'&&apiKey){
   const result=await loadYouTubeVault({apiKey,fetcher});
   if(result.source!=='youtube')status={updated:false,count:0,reason:'provider_unavailable'};
   else{
    let durable=false;
    if(store)try{durable=await store.save(result);}catch{status={updated:false,count:0,reason:'database_unavailable'};}
    const cached=await writeVideoSnapshot(result,cacheApi);
    if(durable||cached)status={updated:true,count:result.items.length,reason:durable?'updated':'cache_only'};
    else if(status.reason!=='database_unavailable')status={updated:false,count:0,reason:'cache_unavailable'};
   }
  }
 }catch{status={updated:false,count:0,reason:'provider_unavailable'};}
 if(store)try{await store.record({time,...status});}catch{status={...status,recorded:false};}
 return status;
}
export default async function dailyVideoSync(){
 const store=createVideoStore();
 try{
  const status=await runDailyVideoSync({
   enabled:process.env.YOUTUBE_SYNC_ENABLED,apiKey:process.env.YOUTUBE_API_KEY,
   cacheApi:globalThis.caches,store
  });
  // Never log provider payloads, keys, customer data or signatures.
  if(!status.updated&&status.reason!=='disabled')console.warn('Public video refresh unavailable: '+status.reason);
  if(status.recorded===false)console.warn('Public video refresh outcome could not be persisted.');
  return new Response(null,{status:204});
 }finally{if(store)try{await store.close();}catch{}}
}
export const config={schedule:'0 10 * * *'};
