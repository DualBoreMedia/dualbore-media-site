import {resolvePublicVideoVault} from './video-vault.mjs';
import {createVideoStore} from '../media/video-database.mjs';
export function videoSitemap(items){
 const ids=[...new Set(items.filter(v=>/^[A-Za-z0-9_-]{11}$/.test(v?.id||'')).map(v=>v.id))];
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+ids.map(id=>'<url><loc>https://dualboremedia.com/videos/'+id+'/</loc></url>').join('')+'</urlset>';
}
export default async function handler(request){
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const store=createVideoStore();try{const data=await resolvePublicVideoVault({enabled:process.env.YOUTUBE_SYNC_ENABLED,cacheApi:globalThis.caches,store});return new Response(request.method==='HEAD'?null:videoSitemap(data.items),{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});}finally{if(store)try{await store.close();}catch{}}
}
export const config={path:'/sitemap-videos.xml'};
