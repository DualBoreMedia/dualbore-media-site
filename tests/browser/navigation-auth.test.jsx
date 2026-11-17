import {goPublic,openPublicNavigation} from './public-navigation-fixture.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
import {workosSessionFetch,workosSignInUrl,rememberOperationsView} from '../../src/operations/workos-session.js';
import {withPublicCatalog} from './catalog-fixture.js';
import '../../src/styles.css';

let root,host;
beforeEach(()=>{vi.stubGlobal('fetch',withPublicCatalog());host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/');});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});
const json=(body,status=200)=>Response.json(body,{status});
test('late expired responses reuse a rotated session without starting another refresh',async()=>{
 let releaseSlow,refreshes=0;const counts={};const slow=new Promise(resolve=>{releaseSlow=resolve;});
 const fetcher=vi.fn(async url=>{if(url==='/api/auth/refresh'){refreshes++;return json({ok:true});}counts[url]=(counts[url]||0)+1;if(counts[url]===1){if(url==='/slow')await slow;return json({},401);}return json({ok:true});});
 const first=workosSessionFetch('/fast',{},fetcher),second=workosSessionFetch('/slow',{},fetcher);
 expect((await first).status).toBe(200);releaseSlow();expect((await second).status).toBe(200);expect(refreshes).toBe(1);
});
function key(element,key){element.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}

test('public links use real routes, legacy hashes still resolve and skip navigation moves focus',async()=>{
 root.render(<App/>);await goPublic('Garage');expect(location.pathname).toBe('/garage');await goPublic('Videos');expect(location.pathname).toBe('/videos');
 await openPublicNavigation();await expect.element(page.getByRole('link',{name:'Videos',exact:true})).toHaveAttribute('aria-current','page');
 history.replaceState(null,'','/#films');window.dispatchEvent(new HashChangeEvent('hashchange'));await expect.element(page.getByRole('button',{name:'Episodes',exact:true})).toBeVisible();
 const skip=document.querySelector('.skip-link');skip.focus();skip.click();expect(document.activeElement.id).toBe('content');
});

test('mobile menu dismisses on Escape and real navigation; brand returns to the homepage',async()=>{
 root.render(<App/>);await openPublicNavigation();const menu=host.querySelector('.channel-menu');
 if(getComputedStyle(menu).display!=='none'){key(menu,'Escape');await expect.element(page.getByRole('button',{name:'Open navigation'})).toHaveFocus();}
 await goPublic('Videos');expect(host.querySelector('.channel-menu').getAttribute('aria-expanded')).toBe('false');
 await page.getByRole('link',{name:'DualBore Media home',exact:true}).click();await expect.element(page.getByRole('heading',{name:'From our garage. Out for a ride.'})).toBeVisible();expect(location.pathname).toBe('/');
});

test('build details switch to verified films and dialog Escape restores the original trigger',async()=>{
 history.replaceState(null,'','/garage');root.render(<App/>);const build=page.getByRole('button',{name:'Explore Suzuki SV1000S platform details'});await build.click();
 await page.getByRole('button',{name:'Watch the POV ride'}).click();
 await expect.element(page.getByRole('dialog').getByRole('heading',{level:2})).toBeVisible();
 await expect.element(page.getByRole('dialog').getByTitle(/SV1000S/)).toHaveAttribute('src',expect.stringContaining('XqX31p88MuA'));
 const dialog=document.querySelector('dialog');dialog.dispatchEvent(new Event('cancel',{cancelable:true,bubbles:true}));
 await expect.element(build).toHaveFocus();await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
 await build.click();await page.getByRole('dialog').getByRole('button',{name:/clutch/i}).click();
 await expect.element(page.getByRole('dialog').getByTitle(/clutch/i)).toHaveAttribute('src',expect.stringContaining('2Juq4oxPOo4'));
 await page.getByRole('button',{name:'Close details'}).click();
});

test('WorkOS session refresh recovers customer access without bearer tokens and sign-out failure is visible',async()=>{
 let sessionCalls=0;
 const fetcher=vi.fn(async(url,options)=>{
  if(url==='/api/auth/session')return ++sessionCalls===1?json({signedIn:false},401):json({signedIn:true,user:{displayName:'Synthetic'}});
  if(url==='/api/auth/refresh')return json({ok:true});
  if(url==='/api/auth/logout')return json({ok:false},503);
  return json({orders:[],profile:{},supportTickets:[]});
 });
 const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});vi.stubGlobal('fetch',fetcher);history.replaceState(null,'','/account');root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();expect(sessionCalls).toBe(2);
 const request=fetcher.mock.calls.find(([url])=>url.startsWith('/api/operations'));expect(request[1].credentials).toBe('same-origin');expect(request[1].headers.Authorization).toBeUndefined();
 await page.getByRole('button',{name:'Sign out'}).click();await expect.poll(()=>alert.mock.calls.length).toBe(1);
 await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();
});

test('WorkOS staff sign-in failure never offers customer signup or privileged navigation',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json({signedIn:false},401)));history.replaceState(null,'','/staff?auth=failed');root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('alert')).toHaveTextContent('We could not complete sign-in.');
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in?staff=1&returnTo=%2Fstaff');
 await expect.element(page.getByRole('link',{name:'Create account'})).not.toBeInTheDocument();
 await expect.element(page.getByRole('navigation',{name:'Staff navigation'})).not.toBeInTheDocument();
});

test('WorkOS admin route requires a verified admin role before rendering operations',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/auth/session'?json({signedIn:true}):json({role:'admin',orders:[],variants:[],failures:[],audit:[]})));
 history.replaceState(null,'','/admin');root.render(<WorkosOperations admin/>);
 await expect.element(page.getByRole('heading',{name:'Garage operations'})).toBeVisible();
 await expect.element(page.getByRole('navigation',{name:'Operations navigation'})).toBeVisible();
 await expect.element(page.getByText('Live payments disabled')).toBeVisible();
});

test.each([{admin:true,path:'/admin',role:'admin'},{admin:false,path:'/staff',role:'employee'}])('WorkOS $role sign-out keeps the private sign-in route instead of the closed customer page',async({admin,path,role})=>{
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/auth/session'?json({signedIn:true}):url==='/api/auth/logout'?json({ok:true}):json({role,orders:[],variants:[],failures:[],audit:[]})));
 history.replaceState(null,'',path);root.render(<WorkosOperations admin={admin}/>);
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect.element(page.getByRole('link',{name:'Secure sign in',exact:true})).toBeVisible();
 expect(location.pathname).toBe(path);
 await expect.element(page.getByRole('link',{name:'Create account'})).not.toBeInTheDocument();
 await expect.element(page.getByRole('navigation',{name:admin?'Operations navigation':'Staff navigation'})).not.toBeInTheDocument();
});

test('cookie requests share one refresh, retry only once and keep a transient session failure out of sign-in loops',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});let rotations=0;const attempts={};
 const fetcher=vi.fn(async url=>{if(url==='/api/auth/refresh'){rotations++;await gate;return json({ok:true});}attempts[url]=(attempts[url]||0)+1;return json({},attempts[url]===1?401:200);});
 const first=workosSessionFetch('/first',{},fetcher),second=workosSessionFetch('/second',{},fetcher);await expect.poll(()=>rotations).toBe(1);release();expect((await first).status).toBe(200);expect((await second).status).toBe(200);expect(rotations).toBe(1);
 const denied=vi.fn(async()=>json({},401));expect((await workosSessionFetch('/denied',{},denied)).status).toBe(401);expect(denied).toHaveBeenCalledTimes(2);
 const transient=vi.fn(async url=>json({},url==='/api/auth/refresh'?503:401));await expect(workosSessionFetch('/kept',{},transient)).rejects.toMatchObject({code:'auth_refresh_unavailable'});expect(transient).toHaveBeenCalledTimes(2);
 const stillExpired=vi.fn(async url=>json({},url==='/api/auth/refresh'?200:401));expect((await workosSessionFetch('/once',{},stillExpired)).status).toBe(401);expect(stillExpired).toHaveBeenCalledTimes(3);
});

test('WorkOS preserves the Admin view for explicit step-up and never forces it on routine sign-in',async()=>{
 history.replaceState(null,'','/admin?view=inventory');
 expect(workosSignInUrl({staff:true})).toBe('/api/auth/sign-in?staff=1&returnTo=%2Fadmin%3Fview%3Dinventory');
 expect(workosSignInUrl({staff:true,stepUp:true})).toContain('step_up=1');
 rememberOperationsView('Activity');expect(location.search).toBe('?view=activity');
 history.replaceState(null,'','/');expect(workosSignInUrl()).toBe('/api/auth/sign-in');rememberOperationsView('Inventory');expect(location.pathname).toBe('/');
});

test('WorkOS expired callback displays one actionable failure without redirecting automatically',async()=>{
 const fetcher=vi.fn(async()=>json({},401));vi.stubGlobal('fetch',fetcher);history.replaceState(null,'','/staff?auth=state_expired');root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('alert')).toHaveTextContent('This sign-in attempt expired or was already used.');
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).toBeVisible();expect(location.pathname).toBe('/staff');expect(fetcher.mock.calls.filter(([url])=>url==='/api/auth/refresh')).toHaveLength(1);
});

test('an expired callback remains visible when an existing valid Admin session is preserved',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/auth/session'?json({signedIn:true}):json({role:'admin',orders:[],variants:[],failures:[],audit:[]})));
 history.replaceState(null,'','/admin?view=inventory&auth=state_expired');root.render(<WorkosOperations admin/>);
 await expect.element(page.getByRole('heading',{name:'Inventory',exact:true})).toBeVisible();
 await expect.element(page.getByRole('alert',{name:'Sign-in verification notice'})).toHaveTextContent('This sign-in attempt expired or was already used.');
 await page.getByRole('button',{name:'Dismiss sign-in notice'}).click();await expect.element(page.getByRole('alert',{name:'Sign-in verification notice'})).not.toBeInTheDocument();
 expect(new URLSearchParams(location.search).has('auth')).toBe(false);expect(new URLSearchParams(location.search).get('view')).toBe('inventory');expect(location.pathname).toBe('/admin');
});

test('WorkOS refresh outage preserves a recoverable account surface without inviting another login',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>json({},url==='/api/auth/refresh'?503:401)));history.replaceState(null,'','/admin');root.render(<WorkosOperations admin/>);
 await expect.element(page.getByRole('button',{name:'Check account access'})).toBeVisible();await expect.element(page.getByRole('link',{name:'Secure sign in'})).not.toBeInTheDocument();expect(location.pathname).toBe('/admin');
});

test('sign-out recovers one expired access token and reports a later provider failure without dropping the session',async()=>{
 let logouts=0,refreshes=0;const alert=vi.spyOn(window,'alert').mockImplementation(()=>{});
 vi.stubGlobal('fetch',vi.fn(async url=>{if(url==='/api/auth/session')return json({signedIn:true});if(url==='/api/auth/refresh'){refreshes++;return json({ok:true});}if(url==='/api/auth/logout')return json({},++logouts===1?401:503);return json({orders:[],profile:{},supportTickets:[]});}));
 history.replaceState(null,'','/account');root.render(<WorkosOperations/>);await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();
 await page.getByRole('button',{name:'Sign out'}).click();await expect.poll(()=>alert.mock.calls.length).toBe(1);expect(logouts).toBe(2);expect(refreshes).toBe(1);await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();
});

test('channel badge stays visible and five ordinary navigation links have clear names',async()=>{
 root.render(<App/>);const brand=page.getByRole('link',{name:'DualBore Media home'});await expect.element(brand).toBeVisible();
 await expect.element(brand.getByRole('img',{name:'DualBore Media Logo'})).toHaveAttribute('src','/assets/channel-logo.jpg');
 const logo=host.querySelector('.channel-brand img');expect(getComputedStyle(logo).borderRadius).toBe('50%');expect(logo.getBoundingClientRect().width).toBeGreaterThanOrEqual(41);
 await openPublicNavigation();for(const label of ['Garage','Videos','Merch','Setups','Pit Crew'])await expect.element(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:label,exact:true})).toBeVisible();
 await goPublic('Videos');expect(location.pathname).toBe('/videos');await brand.click();expect(location.pathname).toBe('/');
});

test('verified upload becomes hero and journal feature, while curated builds remain',async()=>{
 const video={id:'aB1cD2eF3gH',title:'Synthetic latest ride',image:'https://i.ytimg.com/vi/aB1cD2eF3gH/hqdefault.jpg',category:'V-Twins',label:'CHANNEL UPLOAD',duration:'10:30'};
 vi.stubGlobal('fetch',vi.fn(withPublicCatalog(async()=>json({source:'youtube',items:[video]}))));
 root.render(<App/>);
 await vi.waitFor(()=>expect(host.querySelector('.home-feature h2')?.textContent).toBe('Synthetic latest ride'));
 expect(host.querySelector('.home-feature img')?.getAttribute('src')).toBe(video.image);
 expect(host.querySelectorAll('.home-sessions .film-card').length).toBe(3);
 expect(host.querySelector('.home-sessions .film-card h3')?.textContent).not.toBe('Synthetic latest ride');
});
test('provider failure retains curated hero and makes no live-sync claim',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('synthetic outage')}));
 root.render(<App/>);
 await expect.element(page.getByRole('button',{name:/Play The N54 single-turbo build starts here/})).toBeVisible();
 expect(host.querySelector('.home-feature h2')?.textContent).toBe('The N54 single-turbo build starts here');
 expect(host.querySelector('.home-feature button>span')?.textContent).toContain('Featured episode');
});

test('admin overview places attention first and opens existing orders from bench lists',async()=>{
 const order={orderNumber:'DBM-BENCH',status:'paid',paymentStatus:'paid',fulfillmentStatus:'making',createdAt:'2026-11-01T00:00:00Z',totalCents:3000,subtotalCents:3000,shippingCents:0,taxCents:0,items:[],shipments:[],timeline:[],shippingReview:{status:'due_today',dueDate:'2026-11-02'}};
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/auth/session'?json({signedIn:true}):json({role:'admin',orders:[order],workLists:{making:[order],packing:[],carrierHandoff:[order]},variants:[],failures:[],audit:[],overview:{making:1}})));
 history.replaceState(null,'','/admin');root.render(<WorkosOperations admin/>);
 await expect.element(page.getByRole('heading',{name:'Needs attention'})).toBeVisible();
 const attention=host.querySelector('.ops-attention'),daily=host.querySelector('[aria-label="Daily work queue"]');
 expect(Boolean(attention.compareDocumentPosition(daily)&Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
 const list=host.querySelector('.ops-queue');expect(list.textContent).toContain('DBM-BENCH');
 const opener=list.querySelector('button');opener.click();
 await expect.element(page.getByRole('heading',{name:'DBM-BENCH'})).toBeVisible();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await vi.waitFor(()=>expect(document.activeElement).toBe(opener));
});
