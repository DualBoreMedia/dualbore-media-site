import {loadYouTubeVault} from '../media/youtube.mjs';
import {readVideoSnapshot,writeVideoSnapshot} from '../media/video-cache.mjs';
import {createVideoStore} from '../media/video-database.mjs';

const cacheHeaders={
 'Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};

export async function resolvePublicVideoVault({enabled,apiKey,fetcher,cacheApi,store}={}){
 if(enabled!=='true')return loadYouTubeVault({});
 const durable=await store?.read();
 if(durable)return durable;
 const cached=await readVideoSnapshot(cacheApi);
 if(cached)return cached;
 const fresh=await loadYouTubeVault({apiKey,fetcher});
 if(fresh.source==='youtube'){
  if(store)try{await store.save(fresh);}catch{} // Read-only public requests must not fail on a database outage.
  await writeVideoSnapshot(fresh,cacheApi);
 }
 return fresh;
}

export default async function videoVault(request){
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...cacheHeaders,Allow:'GET, HEAD'}});
 const store=createVideoStore();
 let result;
 try{result=await resolvePublicVideoVault({enabled:process.env.YOUTUBE_SYNC_ENABLED,apiKey:process.env.YOUTUBE_API_KEY,cacheApi:globalThis.caches,store});}
 finally{if(store)try{await store.close();}catch{}}
 const cache=result.source==='youtube'?'public, max-age=86400, stale-while-revalidate=604800':'public, max-age=180';
 return new Response(request.method==='HEAD'?null:JSON.stringify(result),{
  status:200,headers:{...cacheHeaders,'Cache-Control':'public, max-age=60','Netlify-CDN-Cache-Control':cache}
 });
}
export const config={path:'/api/video-vault'};
