import {loadYouTubeVault} from '../media/youtube.mjs';

const cacheHeaders={
 'Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Access-Control-Allow-Origin':'https://dualboremedia.com'
};

export default async function videoVault(request){
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...cacheHeaders,Allow:'GET, HEAD'}});
 const result=await loadYouTubeVault({apiKey:process.env.YOUTUBE_API_KEY});
 const cache=result.source==='youtube'?'public, durable, max-age=86400, stale-while-revalidate=604800':'public, max-age=180';
 return new Response(request.method==='HEAD'?null:JSON.stringify(result),{
  status:200,headers:{...cacheHeaders,'Cache-Control':'public, max-age=60','Netlify-CDN-Cache-Control':cache}
 });
}
export const config={path:'/api/video-vault'};
