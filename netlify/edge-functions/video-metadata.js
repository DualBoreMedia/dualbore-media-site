import {renderSyncedVideoHtml} from '../media/video-page-metadata.mjs';
// Edge rewrite adds first-response social tags only for independently verified public uploads.
// Existing prerendered curated pages are left untouched.
export default async function videoMetadata(request,context){
 const match=/^\/videos\/([A-Za-z0-9_-]{11})\/$/.exec(new URL(request.url).pathname);
 if(!match||request.method!=='GET')return context.next();
 const response=await context.next();
 if(response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 const original=await response.text();
 const canonical='https://dualboremedia.com/videos/'+match[1]+'/';
 if(original.includes('<link rel="canonical" href="'+canonical+'"'))return new Response(original,{status:200,headers:response.headers});
 try{
  const feedResponse=await fetch(new URL('/api/video-vault',request.url),{headers:{Accept:'application/json'}});
  if(!feedResponse.ok)return new Response(original,{status:200,headers:response.headers});
  const feed=await feedResponse.json();
  const video=feed?.source==='youtube'&&Array.isArray(feed.items)?feed.items.find(item=>item.id===match[1]):null;
  const html=video?renderSyncedVideoHtml(original,video):null;
  if(!html)return new Response(original,{status:200,headers:response.headers});
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  headers.set('cache-control','public, max-age=60');
  return new Response(html,{status:200,headers});
 }catch{return new Response(original,{status:200,headers:response.headers});}
}
export const config={path:'/videos/*'};
