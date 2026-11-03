import {useEffect,useMemo,useState} from 'react';
import {channel,films,projects} from './content.js';

const patterns={
 n54:/\b(n54|335i|bmw)\b/i,
 sv1000:/\b(sv1000s?|suzuki)\b/i,
 rd400:/\b(rd400|yamaha rd)\b/i,
 crf110:/\b(crf110|pit.?bike)\b/i
};
const videoId=/^[A-Za-z0-9_-]{11}$/;
const youtube=id=>'https://www.youtube.com/watch?v='+id;
const filmHref=film=>'/videos/'+film.id+'/';

export function episodesForBuild(project,episodes){
 const featured=new Set([project.video,project.relatedVideo].filter(Boolean));
 const pattern=patterns[project.id];
 const matches=episodes.filter(film=>featured.has(film.id)||pattern?.test(film.title));
 return [...matches].sort((a,b)=>{
  if(featured.has(a.id)&&!featured.has(b.id))return -1;
  if(!featured.has(a.id)&&featured.has(b.id))return 1;
  const left=Date.parse(a.publishedAt||'')||0,right=Date.parse(b.publishedAt||'')||0;
  return left-right;
 });
}

function usePageMetadata(title,description,canonical,notFound=false){
 useEffect(()=>{
  document.title=title;
  const update=(selector,attribute,value)=>{const element=document.head.querySelector(selector);if(element)element.setAttribute(attribute,value);};
  update('meta[name="description"]','content',description);
  update('meta[property="og:title"]','content',title);
  update('meta[property="og:description"]','content',description);
  update('meta[property="og:url"]','content',canonical);
  let canonicalLink=document.head.querySelector('link[rel="canonical"]');
  if(!canonicalLink){canonicalLink=document.createElement('link');canonicalLink.rel='canonical';document.head.append(canonicalLink);}
  canonicalLink.href=canonical;
  if(notFound){const meta=document.createElement('meta');meta.name='robots';meta.content='noindex';document.head.append(meta);return()=>meta.remove();}
 },[title,description,canonical,notFound]);
}

function Intro({title,description,category}){
 return <div className="detail-intro"><span className="eyebrow">DUALBORE MEDIA / {category}</span><h1>{title}</h1><p>{description}</p></div>;
}
function Header(){return <header className="detail-header"><a className="detail-brand" href="/#garage"><img src="/assets/channel-logo.jpg" alt="" width="48" height="48"/><span>DUALBORE<span>MEDIA</span></span></a><nav aria-label="Explore the channel"><a href="/#garage">Garage</a><a href="/#vault">Video Vault</a><a href={channel.url} target="_blank" rel="noopener noreferrer">YouTube</a></nav></header>;}
function Footer(){return <footer className="detail-footer"><p>Real projects. New episodes on YouTube.</p><a href="/#garage">Back to Garage Builds</a></footer>;}

export function PublicDetail(){
 const parts=window.location.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
 const kind=parts[0],id=parts[1];
 const project=kind==='builds'?projects.find(p=>p.id===id):null;
 const [episodes,setEpisodes]=useState(films);
 const [loading,setLoading]=useState(kind==='videos'&&!films.some(f=>f.id===id));
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/video-vault',{signal:controller.signal})
   .then(response=>response.ok?response.json():null)
   .then(data=>{if(!controller.signal.aborted&&Array.isArray(data?.items)&&data.items.length&&data.items.length<=50&&data.items.every(f=>videoId.test(f?.id||'')&&typeof f.title==='string'&&typeof f.image==='string'&&/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(f.image)))setEpisodes(data.items);})
   .catch(()=>{})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[]);
 const video=kind==='videos'&&videoId.test(id||'')?episodes.find(f=>f.id===id):null;
 const buildEpisodes=useMemo(()=>project?episodesForBuild(project,episodes):[],[project,episodes]);
 const canonical='https://dualboremedia.com/'+(kind==='builds'?'builds/':'videos/')+encodeURIComponent(id||'')+'/';
 const missing=kind==='builds'?!project:kind==='videos'?!video&&!loading:true;
 const title=project?project.name+' | DualBore Media Builds':video?video.title+' | DualBore Media':missing?'Page unavailable | DualBore Media':'Loading video | DualBore Media';
 const description=project?project.description:video?'Watch '+video.title+' on DualBore Media.':'Explore authentic DualBore Media build and video episodes.';
 usePageMetadata(title,description,canonical,missing);
 return <div className="detail-shell"><a className="skip-link" href="#detail-main">Skip to content</a><Header/><main id="detail-main" className="detail-main" tabIndex="-1">
  {project?<>
    <Intro title={project.name} description={project.description} category={project.category}/>
    <div className="detail-hero"><img src={project.image} alt={project.name+' channel project'} width="960" height="720"/><div className="detail-status"><h2>Inside the build</h2><p>{project.tag}</p><dl>{project.specs.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><p className="detail-muted">Progress is documented through published episodes. An unannounced modification is not marked complete.</p><a href={channel.url} target="_blank" rel="noopener noreferrer">Follow the next upload on YouTube</a></div></div>
    <section className="detail-episodes" aria-labelledby="build-episodes-title"><h2 id="build-episodes-title">Build episodes</h2><p>Published channel footage tied to this platform, in series order where known.</p><div className="detail-episode-grid">{buildEpisodes.map(film=><a key={film.id} href={filmHref(film)}><img src={film.image} alt="" width="480" height="270" loading="lazy"/><span>{film.duration}</span><strong>{film.title}</strong></a>)}</div>{!buildEpisodes.length&&<p>No public episodes are currently listed for this platform.</p>}</section>
  </>:video?<>
    <Intro title={video.title} description={'Watch this '+video.category.toLowerCase()+' episode from DualBore Media.'} category={video.category}/>
    <div className="detail-video-frame"><iframe src={'https://www.youtube-nocookie.com/embed/'+video.id} title={video.title} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>
    <div className="detail-video-tools"><span>{video.duration}</span><a href={youtube(video.id)} target="_blank" rel="noopener noreferrer">Watch on YouTube</a></div>
    <section className="detail-episodes" aria-labelledby="more-videos-title"><h2 id="more-videos-title">From the garage</h2><div className="detail-episode-grid">{episodes.filter(f=>f.id!==video.id&&f.category===video.category).slice(0,3).map(f=><a key={f.id} href={filmHref(f)}><img src={f.image} alt="" width="480" height="270" loading="lazy"/><strong>{f.title}</strong></a>)}</div>{projects.filter(p=>p.video===video.id||p.relatedVideo===video.id).map(p=><a className="detail-related-project" key={p.id} href={'/builds/'+p.id+'/'}>Explore the {p.name} build log</a>)}</section>
  </>:<section className="detail-not-found"><h1>{loading?'Loading this episode…':'This page is unavailable'}</h1><p>{loading?'Checking the public channel archive.':'The requested public episode or build could not be verified. Browse the channel instead.'}</p><a href="/#vault">Return to Video Vault</a></section>}
 </main><Footer/></div>;
}
export default PublicDetail;
