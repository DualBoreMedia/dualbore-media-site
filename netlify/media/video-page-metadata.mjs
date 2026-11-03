// Pure, server-safe social metadata renderer. Unverified uploads never rewrite HTML.
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const videoId=/^[A-Za-z0-9_-]{11}$/;
export function renderSyncedVideoHtml(html,film){
 if(typeof html!=='string'||!film||!videoId.test(film.id)||typeof film.title!=='string'||!film.title.trim()||film.title.length>180||film.image!=='https://i.ytimg.com/vi/'+film.id+'/hqdefault.jpg')return null;
 const url='https://dualboremedia.com/videos/'+film.id+'/',title=escapeHtml(film.title+' | DualBore Media'),description=escapeHtml('Watch '+film.title+' on DualBore Media.'),image=escapeHtml(film.image);
 let result=html.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>');
 const values=[['meta name="description"',description],['meta property="og:title"',title],['meta property="og:description"',description],['meta property="og:url"',url],['meta property="og:image"',image],['meta name="twitter:title"',title],['meta name="twitter:description"',description],['meta name="twitter:image"',image]];
 for(const [tag,value] of values){
  const prefix='<'+tag+' content="',start=result.indexOf(prefix);
  if(start<0)return null;
  const from=start+prefix.length,end=result.indexOf('"',from);
  if(end<0)return null;
  result=result.slice(0,from)+value+result.slice(end);
 }
 const canonical=/<link rel="canonical" href="[^"]*"\s*\/>/;
 if(!canonical.test(result))return null;
 result=result.replace(canonical,'<link rel="canonical" href="'+url+'" />');
 return result;
}
