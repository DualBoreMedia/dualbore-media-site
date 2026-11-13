import {PublicNavigation} from './PublicNavigation.jsx';
import {ChannelHome} from './ChannelHome.jsx';
import {VideoVault} from './VideoVault.jsx';
import {newestEpisode,discoverVideos} from './video-discovery.js';
import {CatalogStatus,usePublicCatalog} from './usePublicCatalog.jsx';
import {PrimaryNavigation} from './PrimaryNavigation.jsx';
import { TestCheckout } from './commerce/TestCheckout.jsx';
import { OrderStatus } from './commerce/OrderStatus.jsx';
import { useEffect, useRef, useState } from 'react';
import { FaYoutube, FaPlay, FaArrowRight, FaArrowUpRightFromSquare, FaBars, FaXmark, FaWrench, FaFilm, FaShirt, FaUsers, FaBell, FaBagShopping } from 'react-icons/fa6';
import { Waitlist } from './Waitlist.jsx';
import {GarageStories,RelatedEpisodes,ProductReleaseDetails,CrewPrinciples,PublicFooter} from './Editorial.jsx';
import { testCommerceEnabled, useTestCart } from './commerce/Commerce.jsx';
import { CartDrawer, ProductOptions, RetailMerch } from './commerce/Storefront.jsx';
import {ShopEmpty,ShopFilters,useShopDiscovery} from './commerce/ShopFilters.jsx';
import {GarmentOptions} from './commerce/GarmentOptions.jsx';
import { StoreFooter, StorePage, readPage, policyPages } from './commerce/Pages.jsx';
import { channel, views, filters, projects, films, merch, previewSizes, madeToOrder } from './content';

const merchSources = item => item.managed ? undefined : `${item.image.replace('.jpg', '-480.jpg')} 480w, ${item.image.replace('.jpg', '-768.jpg')} 768w`;
const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;
const readView = () => {
  const route={'/garage':'garage','/videos':'vault','/pit-crew':'crew','/shop':'merch'}[window.location.pathname.replace(/\/$/,'')];if(route)return route;
  const hash = window.location.hash.slice(1);
  const aliases = { films: 'vault', shop: 'merch', about: 'crew', top: 'garage' };
  return views.find(view => !view.href&&view.id === (aliases[hash] || hash))?.id || 'garage';
};

function External({ href, label, children, ...props }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} {...props}>{children}</a>;
}

function MerchAction({ item, onAction, onTest, label = 'Release details', className = 'button' }) {
  if (testCommerceEnabled && onTest) return <button className={className} onClick={onTest} aria-label={`Choose test size for ${item.name}`}>Choose test size <FaShirt aria-hidden="true" /></button>;
  return <button className={className} onClick={event => onAction(item, event.currentTarget)} aria-label={`${label} for ${item.name}`}>{label} <FaArrowRight aria-hidden="true" /></button>;
}

function SectionTitle({ eyebrow, title, accent, children }) {
  return <div className="view-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}<span>{accent}</span></h1></div>{children && <div className="view-intro">{children}</div>}</div>;
}

export function App() {
  const buildEnvironment=import.meta.env;
  const staffOnly=buildEnvironment.VITE_AUTH_ACCESS_MODE==='staff-only';
  const cart = useTestCart();
  const publicCatalog=usePublicCatalog();
  const catalog=publicCatalog.products;
  const merchShop = useShopDiscovery(catalog);
  const [cartOpen,setCartOpen]=useState(false);
  const [page,setPage]=useState(()=>{const p=readPage();return testCommerceEnabled||p&&!p.startsWith('order/')?p:null;});
  const [view, setView] = useState(readView);
  const [menu, setMenu] = useState(false);
  const [vaultFilms, setVaultFilms] = useState(films);
   const [latestUpload,setLatestUpload] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const dialog = useRef(null);
  const menuButton = useRef(null);
  const panelTop = useRef(null);
  const toastTimer = useRef(null);
  const modalTrigger = useRef(null);
  const closeButton = useRef(null);
  const [isHome,setIsHome]=useState(()=>window.location.pathname==='/'&&!window.location.hash);
  const featuredFilm = latestUpload || films.find(film => film.id === 'c7gF1jjT9YQ');
   const journalEpisodes = latestUpload ? [latestUpload,...projects.map(project=>films.find(film=>film.id===project.video)).filter(Boolean).filter(film=>film.id!==latestUpload.id)] : films;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  const notify = message => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const chooseView = (next, focusTab = false) => {
    const routes={garage:'/garage',vault:'/videos',merch:'/shop',setups:'/setups',crew:'/pit-crew'};
    window.history.pushState(null,'',routes[next]||'/');setPage(null);setView(next==='home'?'garage':next);setIsHome(next==='home');setMenu(false);window.scrollTo({top:0,behavior:'instant'});if(focusTab)requestAnimationFrame(()=>panelTop.current?.focus());
  };
  const openModal = (value, trigger = document.activeElement) => {
    if (!modal) modalTrigger.current = trigger;
    setMenu(false);
    setModal(value);
  };
  const closeModal = () => {
    dialog.current?.close();
    setModal(null);
    modalTrigger.current?.focus();
  };
  const openCart=()=>{if(modal)closeModal();setMenu(false);setCartOpen(true);};
  useEffect(()=>{
    document.body.classList.toggle('local-storefront',testCommerceEnabled);
    const onPop=()=>{const p=readPage();setPage(testCommerceEnabled||p&&!p.startsWith('order/')?p:null);setView(readView());setIsHome(window.location.pathname==='/'&&!window.location.hash);};
    window.addEventListener('popstate',onPop);
    return()=>{document.body.classList.remove('local-storefront');window.removeEventListener('popstate',onPop);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/video-vault',{signal:controller.signal})
      .then(response=>response.ok?response.json():null)
      .then(data=>{if(!controller.signal.aborted&&Array.isArray(data?.items)&&data.items.length>0&&data.items.length<=50&&data.items.every(film=>/^[A-Za-z0-9_-]{11}$/.test(film?.id)&&typeof film.title==='string'&&typeof film.image==='string'&&/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(film.image))){setVaultFilms([...data.items,...films.filter(film=>!data.items.some(item=>item.id===film.id))]);setLatestUpload(data.source==='youtube'?newestEpisode(data.items):null);}})
      .catch(()=>{});
    return()=>controller.abort();
  },[]);
  useEffect(() => {
    const onHash = () => { setView(readView());setIsHome(window.location.pathname==='/'&&!window.location.hash); setMenu(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(toastTimer.current); };
  }, []);
  useEffect(()=>{
    if(page)return;
    const titles={garage:'DualBore Media | Garage Builds, Films & Merch',vault:'Video Vault | DualBore Media',merch:'Drop 01 Preview | DualBore Media',crew:'Pit Crew | DualBore Media'};
    document.title=isHome?titles.garage:view==='garage'?'Garage Builds | DualBore Media':titles[view];
    const canonical=document.querySelector('link[rel="canonical"]');if(canonical)canonical.href='https://dualboremedia.com'+window.location.pathname;
  },[view,page,isHome]);
  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.current.open) dialog.current.showModal();
    closeButton.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modal]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = event => {
      if (event.key === 'Escape') { setMenu(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [menu]);

  return <>
    {testCommerceEnabled&&<meta name="robots" content="noindex,nofollow"/>}
    <a className="skip-link" href="#content" onClick={event => { event.preventDefault(); panelTop.current?.focus(); }}>Skip to content</a>
    <PublicNavigation active={isHome?undefined:view} onChoose={chooseView}>{testCommerceEnabled&&<button className="cart-toggle" aria-label={`Open test cart, ${cart.count} items`} onClick={openCart}><FaBagShopping aria-hidden="true"/> <span>{cart.count}</span></button>}</PublicNavigation>

    <main id="content" ref={panelTop} tabIndex="-1">
      {page&&(page==='order/test-checkout'?<TestCheckout/>:page.startsWith('order/')&&new URLSearchParams(window.location.search).has('session_id')?<OrderStatus cart={cart} onBack={()=>chooseView('merch',true)}/>:<StorePage page={page} draft={testCommerceEnabled} waitlistEnabled={false} onBrowse={()=>chooseView('merch',true)}/>)}
      {isHome&&<ChannelHome videos={vaultFilms} onPlay={(item,trigger)=>openModal({type:'video',item},trigger)}/>}
      <section id="panel-garage" role="region" aria-label="Garage builds" tabIndex="0" hidden={isHome || view !== 'garage' || !!page} className="view">
        <div className="garage-hero"><div><span className="eyebrow"><span className="status-dot" /> Inside the DualBore garage</span><h1>Five sections.<br /><span>One obsession.</span></h1><p>Two brothers. Project cars. Motorcycles. Garage days.<br />Follow the builds, the fixes, and the next lap.</p><button className="button" onClick={() => chooseView('vault', true)}><FaPlay aria-hidden="true" /> Explore the video vault</button><button className="text-link hero-secondary" onClick={() => chooseView('merch', true)}>Discover Drop 01 <FaArrowRight aria-hidden="true"/></button><a className="text-link hero-secondary" href="/setups">MX Bikes Setup Shop <FaArrowRight aria-hidden="true"/></a></div><button onClick={event => openModal({type: 'video', item: featuredFilm}, event.currentTarget)} aria-label={`Play ${featuredFilm.title}`} className="hero-feature"><img src={latestUpload?featuredFilm.image:'/assets/rd400.jpg'} alt={latestUpload?`${featuredFilm.title} verified upload thumbnail`:'Yamaha RD400 channel ride thumbnail'} width="480" height="360" loading="eager" fetchPriority="high" decoding="async" /><span className="hero-feature-caption"><small>{latestUpload?'Newest channel upload':'Featured session / Two-strokes'}</small><strong>{latestUpload?featuredFilm.title:'Into the hills.'}</strong><span><FaPlay aria-hidden="true" /> {latestUpload?'Watch latest upload':'Watch the RD400 ride'}</span></span></button></div>
        <div className="section-bar"><h2>The build roster</h2><span className="rule" /><span>04 platforms / Real channel projects</span></div>
        <div className="project-grid">{projects.map((project, index) => <button className="project-card" key={project.id} onClick={event => openModal({type: 'build', item: project}, event.currentTarget)} aria-label={`Explore ${project.name} platform details`}><div className="project-image"><img src={project.image} alt={`${project.name} channel thumbnail`} width="480" height="360" loading="lazy" decoding="async" /><span className="card-index">0{index + 1}</span><span className="image-action"><FaArrowUpRightFromSquare aria-hidden="true" /></span></div><div className="card-copy"><span className="eyebrow">{project.category}</span><h3>{project.name}</h3><p>{project.tag}</p><span className="card-bottom">Explore platform <FaArrowRight aria-hidden="true" /></span></div></button>)}</div>
        <nav className="build-permalinks" aria-label="Individual build logs">{projects.map(project=><a key={project.id} href={`/builds/${project.id}/`}>{project.name} build log</a>)}</nav>
        <div className="garage-footnote"><FaWrench aria-hidden="true" /><p>Every platform has a story. Open a card for project details and the videos behind it.</p></div>
        <GarageStories episodes={discoverVideos(journalEpisodes,{format:'episodes'})} onView={chooseView} onDetails={(item,trigger)=>openModal({type:'merch',item},trigger)} onPlay={(item,trigger)=>openModal({type:'video',item},trigger)}/>
      </section>

      <section id="panel-vault" role="region" aria-label="Video Vault" tabIndex="0" hidden={view !== 'vault' || !!page} className="view">
        <VideoVault videos={vaultFilms} onPlay={(item,trigger)=>openModal({type:'video',item},trigger)}/>
      </section>

      <section id="panel-merch" role="region" aria-label="Garage merch" tabIndex="0" hidden={view !== 'merch' || !!page} className="view">
        {testCommerceEnabled ? <RetailMerch cart={cart} onAdded={notify} onReview={openCart} onDetails={item=>openModal({type:'merch',item})} onAlert={()=>openModal({type:'alert'})}/> : <>
        <SectionTitle eyebrow="Drop 01 / Apparel preview" title="Garage bred." accent="Ride inspired."><p>Original garage artwork, planned for T-shirts, crewnecks and sweatshirts. Final garment details are still being reviewed.</p><button className="button" onClick={event => openModal({type: 'alert'}, event.currentTarget)}><FaYoutube aria-hidden="true" /> Release updates</button></SectionTitle>
        <div className="drop-banner"><span className="pulse-dot" /><strong>Drop 01 Preview</strong><span>Coming soon · Orders aren’t open yet.</span></div>
        <CatalogStatus catalog={publicCatalog}/>
        <ShopFilters shop={merchShop}/>
        {!publicCatalog.loading&&!publicCatalog.error&&!merchShop.results.length&&<ShopEmpty shop={merchShop}/>}
        <div className="merch-grid">{merchShop.results.map(item => {const index=catalog.findIndex(product=>product.id===item.id);return <article className="merch-card" key={item.id}><button className="merch-image" onClick={event => openModal({type:'merch', item}, event.currentTarget)} aria-label={`Quick View ${item.name}`}><span className="merch-art-window"><img src={item.managed?item.image:item.image.replace('.jpg', '-768.jpg')} srcSet={merchSources(item)} sizes="(max-width: 700px) 90vw, 420px" alt={`${item.name} supplied mockup`} width="1290" height="2796" loading="lazy" decoding="async" /></span><span className="drop-badge">DBM / 0{index + 1}</span><span className="quick-view-label">Quick View <FaArrowUpRightFromSquare aria-hidden="true" /></span></button><div className="card-copy"><span className="eyebrow">{item.type}</span><h3>{item.name}</h3><p className="product-subtitle">{item.detail}</p><div className="merch-preview-price"><strong>${item.previewPrice}</strong><span>{item.managed?'USD / Planned release price':'USD / Original mockup planned price'}</span></div>{!item.managed&&<GarmentOptions item={item} compact/>}{(item.testVariantsEnabled||item.managed)&&<p className="merch-size-plan">Planned sizes <span>{(item.sizes||previewSizes).join(" / ")}</span></p>}<div className="merch-card-footer"><span className="coming">Coming soon</span><MerchAction item={item} className="text-link" onTest={()=>openModal({type:'merch',item})} onAction={(item, trigger) => openModal({type: 'merch', item}, trigger)} /></div></div></article>;})}</div>
        <p className="shop-note">Fit and garment details will be available before orders open.</p>
        </>}
      </section>

      <section id="panel-crew" role="region" aria-label="Pit crew" tabIndex="0" hidden={view !== 'crew' || !!page} className="view">
        <SectionTitle eyebrow="Meet the pit crew" title="Built together." accent="Ridden together."><p>Two brothers. A shared love of machines. A channel for the work, the rides, and everything in between.</p></SectionTitle>
        <div className="crew-grid"><div className="crew-story"><img src="/assets/channel-logo.jpg" alt="DualBore Media Logo" width="100" height="100" /><span className="eyebrow">This is DualBore Media</span><h2>Two brothers.<br />One shared garage.</h2><p>Hands-on from the first bolt to the next ride. We work on our own projects, figure out the fixes, and bring you along for the process.</p><p>For Drop 01, we will apply the designs and prepare each package ourselves in the USA.</p><p>Two-stroke builds. Pit-bike races. GoPro rides. Modified cars. We’re here for the machines and everything it takes to keep them moving.</p><p>From RD400 rides and SV1000 fixes to the N54 single-turbo project, follow the wins, failures, cold starts, and garage work along the way.</p></div><div className="crew-links"><div className="community-card"><FaYoutube className="community-icon" aria-hidden="true" /><h2>Pull up a seat.</h2><p>Watch the next session and subscribe on YouTube. Turn on channel notifications to catch new videos and Drop 01 news.</p><External href={channel.url} label="Visit DualBore Media on YouTube to subscribe" className="button">Join the YouTube crew <FaArrowUpRightFromSquare aria-hidden="true" /></External></div><External href={channel.community} label="Visit the DualBore Media YouTube community" className="community-row"><FaUsers aria-hidden="true" /><span><strong>Between the uploads</strong><small>Join the YouTube community</small></span><FaArrowUpRightFromSquare aria-hidden="true" /></External><button className="community-row" onClick={() => chooseView('merch', true)}><FaShirt aria-hidden="true" /><span><strong>Wear the garage</strong><small>Explore the Drop 01 preview</small></span><FaArrowRight aria-hidden="true" /></button></div></div>
        <CrewPrinciples/>
      </section>
    </main>

    {testCommerceEnabled ? <StoreFooter onAlert={email=>openModal({type:'alert',email})}/> : (<PublicFooter staffOnly={staffOnly} onView={chooseView} policies={policyPages}/>)}
    <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite" aria-atomic="true" aria-hidden={!!modal}>{toast && <><span className="status-dot" />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><FaXmark aria-hidden="true" /></button></>}</div>

    <dialog ref={dialog} aria-labelledby="modal-heading" onCancel={event => { event.preventDefault(); closeModal(); }} onClose={() => setModal(null)} onClick={event => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } }}>
      {modal && <><button ref={closeButton} className="close-dialog" aria-label="Close details" onClick={closeModal}><FaXmark /></button>
        {modal.type === 'build' && <div className="build-dialog"><img className="build-dialog-image" src={modal.item.image} alt={`${modal.item.name} channel thumbnail`} /><div className="dialog-copy"><span className="eyebrow">Platform file / {modal.item.category}</span><h2 id="modal-heading">{modal.item.name}</h2><p>{modal.item.description}</p><dl className="spec-list">{modal.item.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><span className="release-label">{films.filter(film=>film.id===modal.item.video||film.id===modal.item.relatedVideo).length} curated {modal.item.relatedVideo?'episodes':'episode'} / Watch the project</span><button className="button" onClick={() => openModal({type: 'video', item: films.find(film => film.id === modal.item.video)})}><FaPlay aria-hidden="true" />{modal.item.action}</button><a className="text-link" href={'/builds/'+modal.item.id+'/'}>Explore the build</a>{modal.item.relatedVideo && <button className="text-link related-video" onClick={() => openModal({type: 'video', item: films.find(film => film.id === modal.item.relatedVideo)})}>Watch the POV ride <FaPlay aria-hidden="true" /></button>}</div></div>}
        {modal.type === 'merch' && <div className="quick-dialog"><div className="quick-image"><div className="merch-art-window"><img src={modal.item.managed?modal.item.image:modal.item.image.replace('.jpg', '-768.jpg')} srcSet={merchSources(modal.item)} sizes="(max-width: 700px) 94vw, 440px" alt={`${modal.item.name} supplied design mockup`} width="1290" height="2796" decoding="async" /></div><span className="drop-badge">Drop 01 / Preview</span></div><div className="dialog-copy"><span className="eyebrow">Coming soon / {modal.item.type}</span><h2 id="modal-heading">{modal.item.name}</h2><p>{modal.item.notes}</p>{testCommerceEnabled ? <><p><strong>{madeToOrder.label}</strong></p><p>{madeToOrder.processing}</p><p>{madeToOrder.returns}</p><p>{madeToOrder.exchanges}</p><nav className="order-actions" aria-label="Made-to-order policies"><a className="text-link" href="/shipping">Shipping and processing</a><a className="text-link" href="/returns">Returns and size exchanges</a></nav></> : null}{testCommerceEnabled&&<><dl className="spec-list"><div><dt>Fabric & weight</dt><dd>To be confirmed</dd></div><div><dt>Design direction</dt><dd>{modal.item.detail}</dd></div></dl><details className="size-guide"><summary>Size guide · S-2XL preview</summary><p>Sizes S through 2XL. Garment measurements will be confirmed before orders open.</p><table><caption>Measurements pending :  not a fit recommendation</caption><thead><tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Length</th></tr></thead><tbody>{previewSizes.map(size => <tr key={size}><th scope="row">{size}</th><td>Pending</td><td>Pending</td></tr>)}</tbody></table></details></>}{!testCommerceEnabled&&<ProductReleaseDetails item={modal.item}/>}{testCommerceEnabled ? <ProductOptions key={modal.item.id} item={modal.item} cart={cart} onAdded={notify} onReview={openCart} /> : <MerchAction item={modal.item} label="Release updates" onAction={item => openModal({type: 'alert', item})} />}<small className="fine-print">Design preview. No orders or payments are being accepted.</small></div></div>}
        {modal.type === 'video' && <div className="video-dialog"><div className="video-dialog-heading"><span className="eyebrow">{modal.item.category} · {modal.item.duration}</span><h2 id="modal-heading">{modal.item.title}</h2></div><div className="video-player"><iframe key={modal.item.id} src={`https://www.youtube-nocookie.com/embed/${modal.item.id}?autoplay=${reduceMotion ? '0' : '1'}&rel=0`} title={modal.item.title} referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div><div className="video-dialog-footer"><p>Playback is provided by YouTube. If the player is unavailable, open the episode directly.</p><External href={videoUrl(modal.item.id)} label={`Watch ${modal.item.title} on YouTube`} className="button"><FaYoutube aria-hidden="true" /> Watch on YouTube</External><a className="text-link" href={'/videos/'+modal.item.id+'/'}>View the episode page</a></div><RelatedEpisodes film={modal.item} episodes={vaultFilms} onPlay={item=>openModal({type:'video',item})} onProject={item=>openModal({type:'build',item})}/></div>}
        {modal.type === 'alert' && <div className="alert-dialog dialog-copy"><span className="eyebrow"><span className="pulse-dot" /> Drop 01 / Coming soon</span><h2 id="modal-heading">Catch the<br /><span>first drop.</span></h2>{testCommerceEnabled?<><p>Be first to hear when the garage gear is ready. Pick your design and preferred size.</p><Waitlist key={modal.item?.id || 'all'} item={modal.item} initialEmail={modal.email || ''} onSuccess={notify} /></>:<><p>Drop 01 is on the way. Orders and email signups are not open yet. Follow our YouTube channel for release announcements.</p><nav className="release-update-actions" aria-label="Release announcement links"><External className="button" href={channel.url} label="Follow DualBore Media release announcements on YouTube"><FaYoutube aria-hidden="true"/> Follow on YouTube</External><a className="text-link" href="/privacy" onClick={closeModal}>Read the privacy information</a></nav></>}</div>}
        {toast && (modal.type === 'alert' || modal.type === 'merch' && testCommerceEnabled) && <div className="modal-toast" role="status">{toast}</div>}
      </>}
    </dialog>
    {cartOpen&&testCommerceEnabled&&<CartDrawer cart={cart} onClose={()=>setCartOpen(false)}/>}
  </>;
}
