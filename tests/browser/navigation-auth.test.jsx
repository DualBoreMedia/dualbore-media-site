import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
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
 await expect.element(page.getByRole('dialog').getByRole('heading')).toBeVisible();
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
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('offline')));history.replaceState(null,'','/staff?auth=failed');root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('alert')).toHaveTextContent('We could not complete sign-in.');
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in?staff=1');
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
