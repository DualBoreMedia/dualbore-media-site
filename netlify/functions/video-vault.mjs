import {loadYouTubeVault} from '../media/youtube.mjs';
import {readVideoSnapshot} from '../media/video-cache.mjs';
import {createVideoStore} from '../media/video-database.mjs';

const cacheHeaders={
 'Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};

export async function resolvePublicVideoVault({enabled,cacheApi,store}={}){
 if(enabled!=='true')return loadYouTubeVault({});
 const durable=await store?.read();
 const cached=await readVideoSnapshot(cacheApi);
 if(durable&&(!cached||(Date.parse(durable.updatedAt)||0)>=(Date.parse(cached.updatedAt)||0)))return durable;
 if(cached)return cached;
 // Public traffic must never trigger provider work or write snapshots.
 return loadYouTubeVault({});
}

export default async function videoVault(request){
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...cacheHeaders,Allow:'GET, HEAD'}});
 const store=createVideoStore();
 let result;
 try{result=await resolvePublicVideoVault({enabled:process.env.YOUTUBE_SYNC_ENABLED,cacheApi:globalThis.caches,store});}
 finally{if(store)try{await store.close();}catch{}}
 const cache=result.source==='youtube'?'public, max-age=300, stale-while-revalidate=300':'public, max-age=180';
 return new Response(request.method==='HEAD'?null:JSON.stringify(result),{
  status:200,headers:{...cacheHeaders,'Cache-Control':'public, max-age=60','Netlify-CDN-Cache-Control':cache}
 });
}
export const config={path:'/api/video-vault'};
