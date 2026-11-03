import {films} from '../../src/content.js';

const videoId=/^[A-Za-z0-9_-]{11}$/;
const byId=new Map(films.map(film=>[film.id,film]));
const validResponse=items=>Array.isArray(items)&&items.length>0&&items.length<=50&&items.every(item=>item&&videoId.test(item.id)&&typeof item.title==='string'&&item.title.length>0&&item.title.length<=180);
const fallback=()=>({source:'curated',updatedAt:null,items:films});

export function formatYouTubeDuration(value){
 const match=/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value||'');
 if(!match)return 'Duration unavailable';
 const total=Number(match[1]||0)*86400+Number(match[2]||0)*3600+Number(match[3]||0)*60+Number(match[4]||0);
 if(!Number.isSafeInteger(total))return 'Duration unavailable';
 const seconds=String(total%60).padStart(2,'0'),minutes=String(Math.floor(total/60)%60);
 return total>=3600?String(Math.floor(total/3600))+':'+minutes.padStart(2,'0')+':'+seconds:minutes+':'+seconds;
}

export function categoryForUpload(video){
 const old=byId.get(video.id);if(old)return old.category;
 const title=video.title.toLowerCase();
 if(/\b(n54|335i|bmw|turbo)\b/.test(title))return 'Turbo Cars';
 if(/\b(sv1000s?|suzuki|v.?twin)\b/.test(title))return 'V-Twins';
 if(/\b(rd400|two.?stroke|2.?stroke)\b/.test(title))return 'Two-Strokes';
 if(/\b(crf110|pit.?bike)\b/.test(title))return 'Pit Bikes';
 return 'Channel Uploads';
}

async function youtubeJson(resource,params,{apiKey,fetcher}){
 const url=new URL('https://www.googleapis.com/youtube/v3/'+resource);
 for(const [key,value] of Object.entries({...params,key:apiKey}))url.searchParams.set(key,value);
 const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('youtube-unavailable');
 const body=await response.json();
 if(!body||!Array.isArray(body.items))throw Error('youtube-invalid-response');
 return body;
}

export async function loadYouTubeVault({apiKey,fetcher=fetch,now=()=>new Date()}={}){
 if(typeof apiKey!=='string'||!apiKey.trim())return fallback();
 try{
  const args={apiKey,fetcher};
  const channel=await youtubeJson('channels',{part:'contentDetails',forHandle:'DualBoreMedia'},args);
  const channelId=channel.items[0]?.id;
  const playlist=channel.items[0]?.contentDetails?.relatedPlaylists?.uploads;
  if(typeof channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)||typeof playlist!=='string'||!/^UU[A-Za-z0-9_-]{22}$/.test(playlist))throw Error('youtube-channel-unavailable');
  const uploads=await youtubeJson('playlistItems',{part:'contentDetails',playlistId:playlist,maxResults:'50'},args);
  const ids=[...new Set(uploads.items.map(item=>item?.contentDetails?.videoId).filter(id=>typeof id==='string'&&videoId.test(id)))].slice(0,50);
  if(!ids.length)throw Error('youtube-empty');
  const details=await youtubeJson('videos',{part:'snippet,contentDetails,status',id:ids.join(','),maxResults:'50'},args);
  const records=new Map(details.items.filter(item=>item&&videoId.test(item.id)&&item.snippet?.channelId===channelId&&item.status?.privacyStatus==='public'&&item.snippet?.liveBroadcastContent!=='upcoming').map(item=>[item.id,item]));
  const items=ids.flatMap(id=>{
   const data=records.get(id),title=data?.snippet?.title?.trim();
   if(!data||!title||title==='Deleted video'||title==='Private video')return [];
   const old=byId.get(id),video={id,title:title.slice(0,180)};
   return [{...video,duration:formatYouTubeDuration(data.contentDetails?.duration),category:categoryForUpload(video),label:old?.label||'CHANNEL UPLOAD',image:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',publishedAt:data.snippet.publishedAt||null}];
  });
  if(!validResponse(items))throw Error('youtube-invalid-videos');
  return {source:'youtube',updatedAt:now().toISOString(),items};
 }catch{
  // Public visitors retain the last packaged editorial list when the provider is unavailable.
  // Do not expose quota failures, provider responses or the API key to clients.
  return fallback();
 }
}
