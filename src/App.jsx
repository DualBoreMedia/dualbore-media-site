import { TestCheckout } from './commerce/TestCheckout.jsx';
import { OrderStatus } from './commerce/OrderStatus.jsx';
import { useEffect, useRef, useState } from 'react';
import { FaYoutube, FaPlay, FaArrowRight, FaArrowUpRightFromSquare, FaBars, FaXmark, FaWrench, FaFilm, FaShirt, FaUsers, FaBell, FaBagShopping } from 'react-icons/fa6';
import { Waitlist } from './Waitlist.jsx';
import { testCommerceEnabled, useTestCart } from './commerce/Commerce.jsx';
import { CartDrawer, ProductOptions, RetailMerch } from './commerce/Storefront.jsx';
import { StoreFooter, StorePage, readPage } from './commerce/Pages.jsx';
import { channel, views, filters, projects, films, merch, previewSizes, madeToOrder } from './content';

const viewIcons = { garage: FaWrench, vault: FaFilm, merch: FaShirt, crew: FaUsers };
const merchSources = item => `${item.image.replace('.jpg', '-480.jpg')} 480w, ${item.image.replace('.jpg', '-768.jpg')} 768w`;
const videoUrl = id => `https://www.youtube.com/watch?v=${id}`;
const readView = () => {
  const hash = window.location.hash.slice(1);
  const aliases = { films: 'vault', shop: 'merch', about: 'crew', top: 'garage' };
  return views.find(view => view.id === (aliases[hash] || hash))?.id || 'garage';
};

function External({ href, label, children, ...props }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} {...props}>{children}</a>;
}

function MerchAction({ item, onAlert, onTest, className = 'button' }) {
  if (testCommerceEnabled && onTest) return <button className={className} onClick={onTest} aria-label={`Choose test size for ${item.name}`}>Choose test size <FaShirt aria-hidden="true" /></button>;
  return <button className={className} onClick={() => onAlert(item)} aria-label={`Join Drop Alert for ${item.name}`}>Join Drop Alert <FaBell aria-hidden="true" /></button>;
}

function ExhaustEmblem() {
  return <svg className="exhaust-emblem" viewBox="0 0 64 56" fill="none" aria-hidden="true"><path d="M8 42 24 12h16L24 42Z" stroke="currentColor" strokeWidth="3" /><path d="m29 42 16-30h11L40 42Z" stroke="currentColor" strokeWidth="3" /><ellipse cx="16" cy="42" rx="10" ry="6" fill="#0B0D10" stroke="currentColor" strokeWidth="3" /><ellipse cx="37" cy="42" rx="10" ry="6" fill="#0B0D10" stroke="currentColor" strokeWidth="3" /></svg>;
}

function SectionTitle({ eyebrow, title, accent, children }) {
  return <div className="view-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}<span>{accent}</span></h1></div>{children && <div className="view-intro">{children}</div>}</div>;
}

export function App() {
  const cart = useTestCart();
  const [cartOpen,setCartOpen]=useState(false);
  const [page,setPage]=useState(()=>{const p=readPage();return testCommerceEnabled||p&&!p.startsWith('order/')?p:null;});
  const [view, setView] = useState(readView);
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const dialog = useRef(null);
  const tabRefs = useRef({});
  const menuButton = useRef(null);
  const panelTop = useRef(null);
  const toastTimer = useRef(null);
  const modalTrigger = useRef(null);
  const closeButton = useRef(null);
  const shownFilms = films.filter(film => filter === 'All' || film.category === filter);

  const notify = message => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const chooseView = (next, focusTab = false) => {
    setPage(null);
    if(window.location.pathname!=='/') window.history.pushState(null,'',`/#${next}`);
    setView(next);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (window.location.hash !== `#${next}`) window.location.hash = next;
    if (focusTab) tabRefs.current[next]?.focus();
  };
  const openModal = value => {
    if (!modal) modalTrigger.current = document.activeElement;
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
    const onPop=()=>{const p=readPage();setPage(testCommerceEnabled||p&&!p.startsWith('order/')?p:null);};
    window.addEventListener('popstate',onPop);
    return()=>{document.body.classList.remove('local-storefront');window.removeEventListener('popstate',onPop);};
  },[]);
  const handleTabKey = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % views.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + views.length) % views.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = views.length - 1;
    if (next !== undefined) { event.preventDefault(); chooseView(views[next].id, true); }
  };

  useEffect(() => {
    const onHash = () => { setView(readView()); setMenu(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); clearTimeout(toastTimer.current); };
  }, []);
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
    <header className={`header${testCommerceEnabled ? ' commerce-header' : ''}`} onClick={event => { if (event.target.closest('a')) setMenu(false); }}>
      <button className="brand" onClick={() => chooseView('garage', true)} aria-label="DualBore Media home"><img className="brand-logo" src="/assets/channel-logo.jpg" alt="DualBore Media Logo" width="48" height="48" loading="eager" fetchPriority="high" /><span><strong>DUALBORE<span>MEDIA</span></strong><small>BUILT. RIDDEN. REPEAT.</small></span></button>
      <div className="header-meta"><ExhaustEmblem /><a className="text-link" href="/account">My Garage</a></div>
      {testCommerceEnabled && <button className="cart-toggle" aria-label={`Open test cart, ${cart.count} items`} onClick={openCart}><FaBagShopping aria-hidden="true"/> <span>{cart.count}</span></button>}
      <External href={channel.url} label="Visit DualBore Media on YouTube to subscribe" className="button subscribe"><FaYoutube aria-hidden="true" /> Subscribe</External>
      <button ref={menuButton} className="menu-toggle" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="mobile-navigation" onClick={() => setMenu(!menu)}>{menu ? <FaXmark /> : <FaBars />}</button>
      <button className={`drawer-backdrop${menu ? ' is-open' : ''}`} aria-label="Close navigation overlay" tabIndex={menu ? 0 : -1} aria-hidden={!menu} onClick={() => { setMenu(false); menuButton.current?.focus(); }} /><nav id="mobile-navigation" className={`mobile-drawer${menu ? ' is-open' : ''}`} aria-label="Mobile navigation" inert={!menu}>{views.map(item => <button key={item.id} aria-current={view === item.id ? 'page' : undefined} onClick={() => chooseView(item.id, true)}><span>{item.number}</span>{item.label}<FaArrowRight aria-hidden="true" /></button>)}<a className="drawer-channel" href="/account">My Garage <FaArrowRight aria-hidden="true"/></a><External className="drawer-channel" href={channel.url} label="Subscribe to DualBore Media on YouTube"><FaYoutube aria-hidden="true" /> YouTube channel <FaArrowUpRightFromSquare aria-hidden="true" /></External></nav>
    </header>

    <div className="workspace-nav" hidden={!!page}><div className="tabs" role="tablist" aria-label="Explore DualBore Media">{views.map((item, index) => {
      const Icon = viewIcons[item.id];
      return <button key={item.id} ref={element => { tabRefs.current[item.id] = element; }} id={`tab-${item.id}`} role="tab" aria-selected={view === item.id} aria-controls={`panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} onKeyDown={event => handleTabKey(event, index)} onClick={() => chooseView(item.id)}><Icon aria-hidden="true" /><span>{item.label}</span><span className="mobile-tab-label">{item.short}</span><small aria-hidden="true">{item.number}</small></button>;
    })}</div></div>

    <main id="content" ref={panelTop} tabIndex="-1">
      {page&&(page==='order/test-checkout'?<TestCheckout/>:page.startsWith('order/')&&new URLSearchParams(window.location.search).has('session_id')?<OrderStatus cart={cart} onBack={()=>chooseView('merch',true)}/>:<StorePage page={page} onBrowse={()=>chooseView('merch',true)}/>)}
      <section id="panel-garage" role="tabpanel" aria-labelledby="tab-garage" tabIndex="0" hidden={view !== 'garage' || !!page} className="view">
        <div className="garage-hero"><div><span className="eyebrow"><span className="status-dot" /> Inside the DualBore garage</span><h1>Four platforms.<br /><span>One obsession.</span></h1><p>Turbo spools. Two-stroke smoke. V-twin sound.<br />Follow the builds, the fixes, and the next lap.</p><button className="button" onClick={() => chooseView('vault', true)}><FaPlay aria-hidden="true" /> Explore the video vault</button></div><button onClick={() => openModal({type: 'video', item: films.find(film => film.id === 'c7gF1jjT9YQ')})} aria-label="Play the Yamaha RD400 hills ride" className="hero-feature"><img src="/assets/rd400.jpg" alt="Yamaha RD400 channel ride thumbnail" width="480" height="360" loading="eager" fetchPriority="high" /><span className="hero-feature-caption"><small>Featured session / Two-strokes</small><strong>Into the hills.</strong><span><FaPlay aria-hidden="true" /> Watch the RD400 ride</span></span></button></div>
        <div className="section-bar"><h2>The build roster</h2><span className="rule" /><span>04 platforms / Real channel projects</span></div>
        <div className="project-grid">{projects.map((project, index) => <button className="project-card" key={project.id} onClick={() => openModal({type: 'build', item: project})} aria-label={`Explore ${project.name} platform details`}><div className="project-image"><img src={project.image} alt={`${project.name} channel thumbnail`} width="480" height="360" loading="lazy" /><span className="card-index">0{index + 1}</span><span className="image-action"><FaArrowUpRightFromSquare aria-hidden="true" /></span></div><div className="card-copy"><span className="eyebrow">{project.category}</span><h3>{project.name}</h3><p>{project.tag}</p><span className="card-bottom">Explore platform <FaArrowRight aria-hidden="true" /></span></div></button>)}</div>
        <div className="garage-footnote"><FaWrench aria-hidden="true" /><p>Every platform has a story. Open a card for project details and the videos behind it.</p></div>
      </section>

      <section id="panel-vault" role="tabpanel" aria-labelledby="tab-vault" tabIndex="0" hidden={view !== 'vault' || !!page} className="view">
        <SectionTitle eyebrow="The channel archive" title="Garage time." accent="Screen time."><p>Build episodes, hands-on repairs, and rides from behind the bars. Pick your lane.</p><External href={`${channel.url}/videos`} label="Browse all DualBore Media videos on YouTube" className="text-link">All channel videos <FaArrowUpRightFromSquare aria-hidden="true" /></External></SectionTitle>
        <div className="film-toolbar"><div className="filters" role="group" aria-label="Filter Video Vault">{filters.map(value => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); notify(`${value === 'All' ? films.length : films.filter(f => f.category === value).length} ${value === 'All' ? 'channel' : value} films shown`); }}>{value}</button>)}</div><span className="result-count">{String(shownFilms.length).padStart(2, '0')} films</span></div>
        <div className="film-grid">{shownFilms.map(film => <button onClick={() => openModal({type: 'video', item: film})} aria-label={`Play ${film.title}`} className="film-card" key={film.id}><div className="film-image"><img src={film.image} width="480" height="360" alt={`${film.title} :  channel thumbnail`} loading="lazy" /><span className="play"><FaPlay aria-hidden="true" /></span><span className="video-duration">{film.duration}</span>{film.imageNote && <small className="image-note">{film.imageNote}</small>}</div><div className="card-copy"><span className="eyebrow">{film.category} · {film.duration}</span><h3>{film.title}</h3><span className="card-bottom">Play episode <FaPlay aria-hidden="true" /></span></div></button>)}</div>
      </section>

      <section id="panel-merch" role="tabpanel" aria-labelledby="tab-merch" tabIndex="0" hidden={view !== 'merch' || !!page} className="view">
        {testCommerceEnabled ? <RetailMerch cart={cart} onAdded={notify} onReview={openCart} onDetails={item=>openModal({type:'merch',item})} onAlert={()=>openModal({type:'alert'})}/> : <>
        <SectionTitle eyebrow="Drop 01 / Apparel preview" title="Garage bred." accent="Ride inspired."><p>The machines that bring us together. The first DualBore designs, made for life beyond the screen.</p><button className="button" onClick={() => openModal({type: 'alert'})}><FaBell aria-hidden="true" /> Get Drop Alert</button></SectionTitle>
        <div className="drop-banner"><span className="pulse-dot" /><strong>Drop 01 Preview</strong><span>Coming soon · Orders aren’t open yet.</span></div>
        <div className="merch-grid">{merch.map((item, index) => <article className="merch-card" key={item.id}><button className="merch-image" onClick={() => openModal({type:'merch', item})} aria-label={`Quick View ${item.name}`}><img src={item.image.replace('.jpg', '-768.jpg')} srcSet={merchSources(item)} sizes="(max-width: 700px) 90vw, 420px" alt={`${item.name} supplied mockup`} width="1290" height="2796" loading="lazy" /><span className="drop-badge">DBM / 0{index + 1}</span><span className="quick-view-label">Quick View <FaArrowUpRightFromSquare aria-hidden="true" /></span></button><div className="card-copy"><span className="eyebrow">{item.type}</span><h3>{item.name}</h3><p>{item.detail}</p><a className="text-link" href="/returns">Returns and size exchanges</a><div className="merch-card-footer"><span className="coming">Made to order | Coming soon</span><MerchAction item={item} className="text-link" onTest={()=>openModal({type:'merch',item})} onAlert={item => openModal({type: 'alert', item})} /></div></div></article>)}</div>
        <p className="shop-note">Real design mockups. Final fabrics, measurements, and release details will be confirmed before the drop.</p>
        </>}
      </section>

      <section id="panel-crew" role="tabpanel" aria-labelledby="tab-crew" tabIndex="0" hidden={view !== 'crew' || !!page} className="view">
        <SectionTitle eyebrow="Meet the pit crew" title="Built together." accent="Ridden together."><p>Two brothers. A shared love of machines. A channel for the work, the rides, and everything in between.</p></SectionTitle>
        <div className="crew-grid"><div className="crew-story"><img src="/assets/channel-logo.jpg" alt="DualBore Media Logo" width="100" height="100" /><span className="eyebrow">This is DualBore Media</span><h2>Two brothers.<br />One shared garage.</h2><p>Hands-on from the first bolt to the next ride. We work on our own projects, figure out the fixes, and bring you along for the process.</p><p>We apply the apparel designs ourselves and pack and ship every order from the USA.</p><p>Two-stroke builds. Pit-bike races. GoPro rides. Modified cars. We’re here for the machines and everything it takes to keep them moving.</p><p>From RD400 rides and SV1000 fixes to the N54 single-turbo project, follow the wins, failures, cold starts, and garage work along the way.</p></div><div className="crew-links"><div className="community-card"><FaYoutube className="community-icon" aria-hidden="true" /><h2>Pull up a seat.</h2><p>Watch the next session and subscribe on YouTube. Turn on channel notifications to catch new videos and Drop 01 news.</p><External href={channel.url} label="Visit DualBore Media on YouTube to subscribe" className="button">Join the YouTube crew <FaArrowUpRightFromSquare aria-hidden="true" /></External></div><External href={channel.community} label="Visit the DualBore Media YouTube community" className="community-row"><FaUsers aria-hidden="true" /><span><strong>Between the uploads</strong><small>Join the YouTube community</small></span><FaArrowUpRightFromSquare aria-hidden="true" /></External><button className="community-row" onClick={() => chooseView('merch', true)}><FaShirt aria-hidden="true" /><span><strong>Wear the garage</strong><small>Explore the Drop 01 preview</small></span><FaArrowRight aria-hidden="true" /></button></div></div>
      </section>
    </main>

    {testCommerceEnabled ? <StoreFooter onAlert={email=>openModal({type:'alert',email})}/> : (<footer className="footer"><span className="footer-brand">DualBore Media</span><span>Built. Ridden. Repeat.</span><External href={channel.url} label="Open the DualBore Media YouTube channel"><FaYoutube aria-hidden="true" /> YouTube</External><a className="text-link" href="/account">My Garage</a><span className="future-social">More garage handles coming soon</span><small>© {new Date().getFullYear()} DualBore Media</small></footer>)}
    <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite" aria-atomic="true" aria-hidden={!!modal}>{toast && <><span className="status-dot" />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><FaXmark aria-hidden="true" /></button></>}</div>

    <dialog ref={dialog} aria-labelledby="modal-heading" onCancel={event => { event.preventDefault(); closeModal(); }} onClose={() => setModal(null)} onClick={event => { if (event.target === dialog.current) { const rect = dialog.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } }}>
      {modal && <><button ref={closeButton} className="close-dialog" aria-label="Close details" onClick={closeModal}><FaXmark /></button>
        {modal.type === 'build' && <div className="build-dialog"><img className="build-dialog-image" src={modal.item.image} alt={`${modal.item.name} channel thumbnail`} /><div className="dialog-copy"><span className="eyebrow">Platform file / {modal.item.category}</span><h2 id="modal-heading">{modal.item.name}</h2><p>{modal.item.description}</p><dl className="spec-list">{modal.item.specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><button className="button" onClick={() => openModal({type: 'video', item: films.find(film => film.id === modal.item.video)})}><FaPlay aria-hidden="true" />{modal.item.action}</button>{modal.item.relatedVideo && <button className="text-link related-video" onClick={() => openModal({type: 'video', item: films.find(film => film.id === modal.item.relatedVideo)})}>Watch the POV ride <FaPlay aria-hidden="true" /></button>}</div></div>}
        {modal.type === 'merch' && <div className="quick-dialog"><div className="quick-image"><img src={modal.item.image.replace('.jpg', '-768.jpg')} srcSet={merchSources(modal.item)} sizes="(max-width: 700px) 94vw, 440px" alt={`${modal.item.name} supplied design mockup`} width="1290" height="2796" /><span className="drop-badge">Drop 01 / Preview</span></div><div className="dialog-copy"><span className="eyebrow">Coming soon / {modal.item.type}</span><h2 id="modal-heading">{modal.item.name}</h2><p>{modal.item.notes}</p><p><strong>{madeToOrder.label}</strong></p><p>{madeToOrder.processing}</p><p>{madeToOrder.returns}</p><p>{madeToOrder.exchanges}</p><nav className="order-actions" aria-label="Made-to-order policies"><a className="text-link" href="/shipping">Shipping and processing</a><a className="text-link" href="/returns">Returns and size exchanges</a></nav><dl className="spec-list"><div><dt>Fabric & weight</dt><dd>To be confirmed</dd></div><div><dt>Design direction</dt><dd>{modal.item.detail}</dd></div></dl><details className="size-guide"><summary>Size guide · S-2XL preview</summary><p>Sizes S through 2XL. Garment measurements will be confirmed before orders open.</p><table><caption>Measurements pending :  not a fit recommendation</caption><thead><tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Length</th></tr></thead><tbody>{previewSizes.map(size => <tr key={size}><th scope="row">{size}</th><td>Pending</td><td>Pending</td></tr>)}</tbody></table></details>{testCommerceEnabled ? <ProductOptions key={modal.item.id} item={modal.item} cart={cart} onAdded={notify} onReview={openCart} /> : <MerchAction item={modal.item} onAlert={item => openModal({type: 'alert', item})} />}<small className="fine-print">Design preview. No orders or payments are being accepted.</small></div></div>}
        {modal.type === 'video' && <div className="video-dialog"><div className="video-dialog-heading"><span className="eyebrow">{modal.item.category} · {modal.item.duration}</span><h2 id="modal-heading">{modal.item.title}</h2></div><div className="video-player"><iframe key={modal.item.id} src={`https://www.youtube-nocookie.com/embed/${modal.item.id}?autoplay=1&rel=0`} title={modal.item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div><div className="video-dialog-footer"><p>Playback is provided by YouTube. If the player is unavailable, open the episode directly.</p><External href={videoUrl(modal.item.id)} label={`Watch ${modal.item.title} on YouTube`} className="button"><FaYoutube aria-hidden="true" /> Watch on YouTube App</External></div></div>}
        {modal.type === 'alert' && <div className="alert-dialog dialog-copy"><span className="eyebrow"><span className="pulse-dot" /> Drop 01 / Coming soon</span><h2 id="modal-heading">Catch the<br /><span>first drop.</span></h2><p>Be first to hear when the garage gear is ready. Pick your design and preferred size.</p><Waitlist key={modal.item?.id || 'all'} item={modal.item} initialEmail={modal.email || ''} onSuccess={notify} /></div>}
        {toast && (modal.type === 'alert' || modal.type === 'merch' && testCommerceEnabled) && <div className="modal-toast" role="status">{toast}</div>}
      </>}
    </dialog>
    {cartOpen&&testCommerceEnabled&&<CartDrawer cart={cart} onClose={()=>setCartOpen(false)}/>}
  </>;
}
