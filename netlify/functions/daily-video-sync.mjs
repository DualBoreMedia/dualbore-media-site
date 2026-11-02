import {loadYouTubeVault} from '../media/youtube.mjs';
import {writeVideoSnapshot} from '../media/video-cache.mjs';

export async function runDailyVideoSync({enabled,apiKey,fetcher,cacheApi}={}){
 if(enabled!=='true'||!apiKey)return {updated:false,reason:'disabled'};
 const result=await loadYouTubeVault({apiKey,fetcher});
 if(result.source!=='youtube')return {updated:false,reason:'provider_unavailable'};
 const saved=await writeVideoSnapshot(result,cacheApi);
 return {updated:saved,count:saved?result.items.length:0,reason:saved?'updated':'cache_unavailable'};
}
export default async function dailyVideoSync(){
 const status=await runDailyVideoSync({
  enabled:process.env.YOUTUBE_SYNC_ENABLED,
  apiKey:process.env.YOUTUBE_API_KEY,
  cacheApi:globalThis.caches
 });
 // Scheduled functions do not publish content or accept incoming client requests.
 if(status.reason==='provider_unavailable'||status.reason==='cache_unavailable')console.warn('Public video refresh unavailable: '+status.reason);
 return new Response(null,{status:204});
}
export const config={schedule:'0 10 * * *'}; // 10:00 UTC daily; not a promised local-business hour.
