// Netlify's Cache API persists a public, sanitized last-successful upload snapshot.
// All match/put calls originate inside a Netlify Function handler.
const storeName='dualbore-video-vault';
const key=new Request('https://dualboremedia.com/.internal/video-vault/latest');
const videoId=/^[A-Za-z0-9_-]{11}$/;

function valid(data){
 return data?.source==='youtube'&&Array.isArray(data.items)&&data.items.length>0&&data.items.length<=50&&data.items.every(film=>film&&videoId.test(film.id)&&typeof film.title==='string'&&film.title.length<=180&&typeof film.image==='string'&&film.image==='https://i.ytimg.com/vi/'+film.id+'/hqdefault.jpg');
}
export async function readVideoSnapshot(cacheApi=globalThis.caches){
 if(!cacheApi?.open)return null;
 try{
  const store=await cacheApi.open(storeName);
  const response=await store.match(key);
  if(!response?.ok)return null;
  const data=await response.json();
  return valid(data)?data:null;
 }catch{return null;}
}
export async function writeVideoSnapshot(data,cacheApi=globalThis.caches){
 if(!valid(data)||!cacheApi?.open)return false;
 try{
  const store=await cacheApi.open(storeName);
  await store.put(key,new Response(JSON.stringify(data),{status:200,headers:{
   'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=7776000'
  }}));
  return true;
 }catch{return false;}
}
