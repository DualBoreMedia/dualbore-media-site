import {FaArrowRight,FaPlay,FaYoutube,FaWrench,FaShirt,FaUsers} from 'react-icons/fa6';
import {channel,films,merch,previewSizes,projects} from './content.js';

export function GarageStories({onView,onDetails,onPlay}){
 return <>
  <section className="garage-intro" aria-labelledby="garage-intro-title"><div><span className="eyebrow">Two brothers / One channel</span><h2 id="garage-intro-title">The work. The ride.<br/><span>Everything in between.</span></h2></div><div><p>We are DualBore Media. Two brothers working on our own machines, chasing the next ride and bringing you into the garage along the way.</p><button className="text-link" onClick={()=>onView('crew',true)}>Meet the pit crew <FaArrowRight aria-hidden="true"/></button></div></section>
  <section className="garage-journal" aria-labelledby="journal-title"><div className="section-bar"><h2 id="journal-title">Find your next session</h2><span className="rule"/><button className="text-link" onClick={()=>onView('vault',true)}>All episodes <FaArrowRight aria-hidden="true"/></button></div><div className="journal-grid">{films.slice(0,3).map(film=><button className="journal-card" key={film.id} onClick={event=>onPlay(film,event.currentTarget)} aria-label={`Watch featured episode: ${film.title}`}><div><img src={film.image} alt={`${film.title} channel episode artwork`} width="480" height="360" loading="lazy"/><span><FaPlay aria-hidden="true"/></span></div><small>{film.category}</small><h3>{film.title}</h3><span className="text-link">Watch episode <FaArrowRight aria-hidden="true"/></span></button>)}</div></section>
  <section className="garage-drop" aria-labelledby="garage-drop-title"><div className="garage-drop-art"><img src="/assets/IMG_5076-768.jpg" alt="E92 coupe tee original Drop 01 design mockup" width="768" height="1664" loading="lazy"/></div><div><span className="eyebrow">The next chapter / Drop 01</span><h2 id="garage-drop-title">Wear the<br/><span>garage.</span></h2><p>The cars and bikes behind the channel, translated into three original apparel designs. Applied by us. Packed by us.</p><span className="release-label">Coming soon / Orders are not open</span><div className="editorial-actions"><button className="button" onClick={()=>onView('merch',true)}>Explore Drop 01 <FaArrowRight aria-hidden="true"/></button><button className="text-link" onClick={event=>onDetails(merch[0],event.currentTarget)}>See the E92 design</button></div></div></section>
 </>;
}

export function RelatedEpisodes({film,onPlay,onProject}){
 const project=projects.find(p=>p.video===film.id||p.relatedVideo===film.id);
 const related=films.filter(f=>f.id!==film.id&&f.category===film.category);
 return <section className="episode-next" aria-label="Explore this series">{project&&<button className="episode-project" onClick={()=>onProject(project)}><FaWrench aria-hidden="true"/><span><small>Inside the garage</small><strong>Explore the {project.name}</strong></span><FaArrowRight aria-hidden="true"/></button>}{related.length>0&&<div className="related-episodes"><h3>More from this platform</h3>{related.map(item=><button key={item.id} onClick={()=>onPlay(item)}><img src={item.image} alt="" width="120" height="90" loading="lazy"/><span>{item.title}</span><FaPlay aria-hidden="true"/></button>)}</div>}</section>;
}

export function ProductReleaseDetails({item}){
 return <section className="product-release-details" aria-label="Drop 01 release details"><div className="preview-price"><strong>${item.previewPrice}</strong><span>USD / Planned release price</span></div><p>Made to order, with the design applied and each package prepared by DualBore Media. This is an artwork preview; orders are not open yet.</p><h3>Planned sizes</h3><div className="planned-sizes" aria-label="Planned sizes, not available to order">{previewSizes.map(size=><span key={size}>{size}</span>)}</div><p className="fine-print">Fit guidance, garment details and shipping information will be available before ordering opens. No size or stock is reserved by viewing this preview.</p></section>;
}

export function CrewPrinciples(){
 return <section className="crew-principles" aria-label="What you will find on the channel">{[[FaWrench,'Inside the garage','Parts, repairs and the work behind our project cars and motorcycles.'],[FaPlay,'Out for a ride','Two-stroke hills, V-twin POV sessions and backyard pit-bike laps.'],[FaShirt,'From machine to design','Original apparel artwork inspired by the cars and bikes we spend time with.']].map(([Icon,title,copy])=><article key={title}><Icon aria-hidden="true"/><h3>{title}</h3><p>{copy}</p></article>)}<a className="crew-follow" href={channel.community} target="_blank" rel="noopener noreferrer" aria-label="Follow DualBore Media community updates on YouTube (opens in a new tab)"><FaUsers aria-hidden="true"/> Stay in the loop between uploads <FaYoutube aria-hidden="true"/></a></section>;
}


export function PublicFooter({onView,policies}){
 return <footer className="footer public-footer">
  <div className="footer-columns">
   <div className="footer-story"><img src="/assets/channel-logo.jpg" alt="DualBore Media Logo" width="56" height="56" loading="lazy"/><h2>Built. Ridden.<br/><span>Repeat.</span></h2><p>Two brothers. Four platforms. The work behind the ride.</p></div>
   <nav aria-label="Explore the garage"><h3>Inside the garage</h3><button onClick={()=>onView('garage',true)}>Garage Builds</button><button onClick={()=>onView('vault',true)}>Video Vault</button><button onClick={()=>onView('merch',true)}>Drop 01 Preview</button><button onClick={()=>onView('crew',true)}>Pit Crew</button><a href="/account">My Garage</a></nav>
   <nav aria-label="Customer information"><h3>Visitor information</h3>{Object.entries(policies).map(([path,policy])=><a key={path} href={'/'+path}>{policy.title}</a>)}</nav>
   <nav aria-label="Follow DualBore Media"><h3>Keep up with the crew</h3><p>Watch the builds and follow what comes next. Drop 01 is coming soon.</p><a href={channel.url} target="_blank" rel="noopener noreferrer" aria-label="Open the DualBore Media YouTube channel (opens in a new tab)"><FaYoutube aria-hidden="true"/> Watch the channel <FaArrowRight aria-hidden="true"/></a><a href={channel.community} target="_blank" rel="noopener noreferrer" aria-label="Read DualBore Media community updates (opens in a new tab)">Community updates <FaArrowRight aria-hidden="true"/></a></nav>
  </div>
  <div className="footer-bottomline"><small>© {new Date().getFullYear()} DualBore Media</small><span>Real projects. More to come.</span></div>
 </footer>;
}
