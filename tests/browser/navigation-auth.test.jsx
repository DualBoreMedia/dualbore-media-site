import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
import {workosSessionFetch,workosSignInUrl,rememberOperationsView} from '../../src/operations/workos-session.js';
import '../../src/styles.css';

let root,host;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/');});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});
const json=(body,status=200)=>Response.json(body,{status});
function key(element,key){element.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));}

test('public tabs wrap with keyboard, legacy hashes work and the skip link moves focus',async()=>{
 root.render(<App/>);const garage=page.getByRole('tab',{name:/Garage Builds/});
 await garage.click();key(document.activeElement,'ArrowLeft');
 await expect.element(page.getByRole('tab',{name:/Pit Crew/})).toHaveFocus();
 key(document.activeElement,'Home');await expect.element(garage).toHaveFocus();
 key(document.activeElement,'ArrowRight');await expect.element(page.getByRole('tab',{name:/Video Vault/})).toHaveFocus();
 key(document.activeElement,'End');await expect.element(page.getByRole('tab',{name:/Pit Crew/})).toHaveFocus();
 key(document.activeElement,'Enter');await expect.element(page.getByRole('tab',{name:/Pit Crew/})).toHaveFocus();
 history.replaceState(null,'','/#films');window.dispatchEvent(new HashChangeEvent('hashchange'));
 await expect.element(page.getByRole('tab',{name:/Video Vault/})).toHaveAttribute('aria-selected','true');
 const skip=document.querySelector('.skip-link');skip.focus();skip.click();expect(document.activeElement.id).toBe('content');
});

test('mobile drawer dismisses on Escape, navigation and brand action',async()=>{
 root.render(<App/>);const open=page.getByRole('button',{name:'Open navigation',exact:true});
 await open.click();key(document.activeElement,'Escape');await expect.element(open).toHaveFocus();
 await open.click();await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:/Video Vault/}).click();
 await expect.element(open).toHaveAttribute('aria-expanded','false');await expect.element(page.getByRole('tab',{name:/Video Vault/})).toHaveFocus();
 await page.getByRole('button',{name:'DualBore Media home'}).click();await expect.element(page.getByRole('tab',{name:/Garage Builds/})).toHaveFocus();
 await page.getByRole('button',{name:'Explore the video vault'}).click();
 await page.getByRole('button',{name:'All',exact:true}).click();await expect.element(page.getByRole('button',{name:'Dismiss notification'})).toBeVisible();
 await page.getByRole('button',{name:'Dismiss notification'}).click();await expect.element(page.getByRole('button',{name:'Dismiss notification'})).not.toBeInTheDocument();
});

test('build details switch to verified films and dialog Escape restores the original trigger',async()=>{
 root.render(<App/>);const build=page.getByRole('button',{name:'Explore Suzuki SV1000S platform details'});await build.click();
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

test('channel avatar is the visible, accessible motorsport badge and all tab numbers have spoken spacing',async()=>{
 root.render(<App/>);
 const brand=page.getByRole('button',{name:'DualBore Media home'});
 await expect.element(brand).toBeVisible();
 const logo=brand.getByRole('img',{name:'DualBore Media Logo'});
 await expect.element(logo).toHaveAttribute('src','/assets/channel-logo.jpg');
 await expect.element(logo).toHaveAttribute('width','42');
 await expect.element(logo).toHaveAttribute('height','42');
 const logoElement=host.querySelector('.nav-brand__logo');
 expect(logoElement).not.toBeNull();
 const visual={radius:getComputedStyle(logoElement).borderRadius,border:getComputedStyle(logoElement).borderWidth,width:logoElement.getBoundingClientRect().width};
 expect(visual.radius).toBe('50%');expect(visual.border).toBe('2px');expect(visual.width).toBeGreaterThanOrEqual(41);
 for(const [number,label] of [['01','Garage Builds'],['02','Video Vault'],['03','Garage Merch (Drop 01)'],['04','About / Pit Crew']]){
  await expect.element(page.getByRole('tab',{name:`${number} ${label}`,exact:true})).toBeVisible();
  const drawerButton=Array.from(host.querySelectorAll('#mobile-navigation button[aria-label]')).find(button=>button.getAttribute('aria-label')===`${number} ${label}`);
  expect(drawerButton).toBeTruthy();
 }
 await page.getByRole('tab',{name:'02 Video Vault'}).click();
 await expect.element(page.getByRole('tab',{name:'02 Video Vault'})).toHaveAttribute('aria-selected','true');
 const selectedTab=host.querySelector('#tab-vault');
 const selected={color:getComputedStyle(selectedTab).borderBottomColor,glow:getComputedStyle(selectedTab,'::after').height};
 expect(selected.color).toBe('rgb(255, 42, 59)');
 expect(selected.glow).toBe('2px');
 await brand.click();
 await expect.element(page.getByRole('tab',{name:'01 Garage Builds'})).toHaveAttribute('aria-selected','true');
});

test('verified upload becomes hero and journal feature, while curated builds remain',async()=>{
 const video={id:'aB1cD2eF3gH',title:'Synthetic latest ride',image:'https://i.ytimg.com/vi/aB1cD2eF3gH/hqdefault.jpg',category:'V-Twins',label:'CHANNEL UPLOAD',duration:'0:30'};
 vi.stubGlobal('fetch',vi.fn(async()=>json({source:'youtube',items:[video]})));
 root.render(<App/>);
 await vi.waitFor(()=>expect(host.querySelector('.hero-feature-caption strong')?.textContent).toBe('Synthetic latest ride'));
 expect(host.querySelector('.hero-feature img')?.getAttribute('src')).toBe(video.image);
 expect(host.querySelectorAll('.journal-card').length).toBe(5);
 expect(host.querySelector('.journal-card h3')?.textContent).toBe('Synthetic latest ride');
});
test('provider failure retains curated hero and makes no live-sync claim',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('synthetic outage')}));
 root.render(<App/>);
 await expect.element(page.getByRole('button',{name:/Play Into the hills on the 1977 RD400/})).toBeVisible();
 expect(host.querySelector('.hero-feature-caption strong')?.textContent).toBe('Into the hills.');
 expect(host.querySelector('.hero-feature-caption small')?.textContent).toContain('Featured session');
});
