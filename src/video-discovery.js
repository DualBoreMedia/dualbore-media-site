import {projects} from './content.js';
export const videoBuilds=[['all','All builds'],['n54','N54'],['sv1000','SV1000S'],['rd400','RD400'],['crf110','CRF110'],['other','Everything else']];
export function durationSeconds(video){
 const parts=String(video.duration||'').split(':');
 if(parts.length<2||parts.length>3||parts.some(p=>!/^\d+$/.test(p)))return null;
 return parts.reduce((total,p)=>total*60+Number(p),0);
}
// Duration is an editorial grouping, not a claim about YouTube's vertical format.
export function videoFormat(video){const seconds=durationSeconds(video);return seconds!==null?seconds<180?'shorts':'episodes':/#shorts\b/i.test(video.title||'')?'shorts':'episodes';}
export function videoBuild(video){
 const known=video.id&&projects.find(p=>p.video===video.id||p.relatedVideo===video.id);if(known)return known.id;
 const title=String(video.title||'').toLowerCase().replace(/[-_]/g,' ');
 if(/mx\s*bikes/.test(title))return 'other';
 if(/\bn54\b/.test(title))return 'n54';
 if(/\bsv\s*1000s?\b/.test(title))return 'sv1000';
 if(/\brd\s*400\b/.test(title))return 'rd400';
 if(/\bcrf\s*110\b/.test(title))return 'crf110';
 return 'other';
}
export function discoverVideos(videos,{format='episodes',build='all',sort='newest',query=''}={}){
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 return videos.map((video,index)=>({video,index})).filter(({video})=>{
  const group=videoFormat(video),bike=videoBuild(video),name=videoBuilds.find(([id])=>id===bike)?.[1]||'';
  const searchable=`${video.title} ${video.label||''} ${name} ${group} ${group==='shorts'?'short clip':'episode long video'}`.toLowerCase().replace(/[-_]/g,'');
  return (format==='all'||group===format)&&(build==='all'||bike===build)&&words.every(word=>searchable.replace(/\s/g,'').includes(word.replace(/[-_\s]/g,'')));
 }).sort((a,b)=>{
  const time=v=>Date.parse(v.publishedAt||'')||0;
  if(sort==='longest')return (durationSeconds(b.video)??-1)-(durationSeconds(a.video)??-1)||a.index-b.index;
  const difference=time(b.video)-time(a.video);return (sort==='oldest'?-difference:difference)||a.index-b.index;
 }).map(({video})=>video);
}
export const newestEpisode=videos=>discoverVideos(videos,{format:'episodes'})[0]||null;
