import {goPublic,openPublicNavigation} from './public-navigation-fixture.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {ErrorBoundary} from '../../src/observability/ErrorBoundary.jsx';
import {projects} from '../../src/content.js';
import {configureBrowserMonitoring} from '../../src/observability/client.js';

let host,dispose,module,first=true;
const response=(body,status=200)=>Response.json(body,{status});
beforeEach(()=>{host=document.createElement('div');host.id='root';document.body.append(host);localStorage.clear();sessionStorage.clear();});
afterEach(()=>{dispose?.();dispose=undefined;host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();history.replaceState(null,'','/');});
async function boot(path,{offline=false}={}){
 history.replaceState(null,'',path);
 vi.stubGlobal('fetch',vi.fn(url=>offline?Promise.reject(new TypeError('Synthetic provider offline')):Promise.resolve(url==='/api/commerce/catalog'?response({enabled:false,variants:[]}):response({signedIn:false},401))));
 module=await import('../../src/main.jsx');
 dispose=first?await module.applicationReady:await module.start(host);first=false;
}
test('real application bootstrap renders the public garage and disposes its listeners',async()=>{
 await boot('/');await expect.element(page.getByRole('heading',{name:/From our garage/})).toBeVisible();
 await goPublic('Videos');await expect.element(page.getByRole('button',{name:'Episodes',exact:true})).toBeVisible();
});
test('real lazy store entry keeps both sales and signup paused',async()=>{
 await boot('/shop');await expect.element(page.getByRole('heading',{name:'Drop 01 is coming soon.'})).toBeVisible();
 await expect.element(page.getByText(/Orders and Drop Alert signups are not open yet/)).toBeVisible();
 await expect.element(page.getByRole('button',{name:/checkout|buy now|Cart/i})).not.toBeInTheDocument();
});

test('staff-only release hides customer account entry while keeping private staff sign-in',async()=>{
 vi.stubEnv('VITE_AUTH_ACCESS_MODE','staff-only');
 await boot('/');await expect.element(page.getByRole('heading',{name:/From our garage/})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'My Garage',exact:true})).not.toBeInTheDocument();dispose();dispose=undefined;
 history.replaceState(null,'','/account');dispose=await module.start(host);
 await expect.element(page.getByRole('heading',{name:'Customer accounts are not open yet.'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Create account'})).not.toBeInTheDocument();
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).not.toBeInTheDocument();dispose();dispose=undefined;
 history.replaceState(null,'','/admin');dispose=await module.start(host);
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in?staff=1&returnTo=%2Fadmin');
});
test('real lazy account and staff entries remain signed out and deny privileged content',async()=>{
 vi.stubEnv('VITE_AUTH_ACCESS_MODE','customer-and-staff');
 await boot('/account');await expect.element(page.getByRole('heading',{name:'Welcome to your garage'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Create account'})).toBeVisible();dispose();dispose=undefined;
 history.replaceState(null,'','/admin');dispose=await module.start(host);
 await expect.element(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
  await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in?staff=1&returnTo=%2Fadmin');
 await expect.element(page.getByRole('heading',{name:'Fulfillment workspace'})).not.toBeInTheDocument();
});
test('real lazy email-preference and order-return entries require explicit verifiable actions',async()=>{
 await boot('/unsubscribe');await expect.element(page.getByRole('heading',{name:'Email preferences.'})).toBeVisible();
 await expect.element(page.getByText(/Opening this page alone changes nothing/)).toBeVisible();dispose();dispose=undefined;
 history.replaceState(null,'','/order/success?session_id=not-verified');dispose=await module.start(host);
 await expect.element(page.getByRole('alert')).toHaveTextContent(/No valid checkout session/);
 await expect.element(page.getByRole('heading',{name:'Payment confirmed.'})).not.toBeInTheDocument();
});
test('render exception produces a useful boundary with a reference and preserves a saved cart',async()=>{
 localStorage.setItem('dbm-store-cart-v1','saved-cart-fixture');
 const errors=vi.spyOn(console,'error').mockImplementation(()=>{});
 const root=createRoot(host);dispose=()=>root.unmount();
 function Broken(){throw new Error('DBM_SYNTHETIC_BOUNDARY_EXCEPTION');}
 root.render(<ErrorBoundary><Broken/></ErrorBoundary>);
 await expect.element(page.getByRole('heading',{name:'The garage hit a snag'})).toBeVisible();
 await expect.element(page.getByRole('alert')).toHaveTextContent(/Reference:/);
 await expect.element(page.getByRole('button',{name:'Reload the garage'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Return to DualBore Media'})).toHaveAttribute('href','/');
 expect(localStorage.getItem('dbm-store-cart-v1')).toBe('saved-cart-fixture');expect(errors).toHaveBeenCalled();
});

test.each([
 ['missing crypto',undefined],
 ['missing randomUUID',{}],
 ['throwing randomUUID',{randomUUID(){throw new TypeError('UUID unavailable');}}],
 ['throwing randomUUID getter',{get randomUUID(){throw new TypeError('UUID property unavailable');}}],
 ['empty randomUUID reference',{randomUUID(){return '';}}],
])('render recovery still reports the original error with %s',async(_name,cryptoValue)=>{
 const captured=[],uncaught=[];
 configureBrowserMonitoring({init(){},withScope(fn){fn({setTags(){}});},captureException(error){captured.push(error);}},{enabled:true,dsn:'test-only'});
 vi.stubGlobal('crypto',cryptoValue);
 vi.spyOn(console,'error').mockImplementation(()=>{});
 localStorage.setItem('dbm-store-cart-v1','preserved-cart-fixture');
 const original=new Error('DBM_SYNTHETIC_ORIGINAL_RENDER_EXCEPTION');
 function Broken(){throw original;}
 const root=createRoot(host,{onUncaughtError(error){uncaught.push(error);}});dispose=()=>root.unmount();
 root.render(<ErrorBoundary><Broken/></ErrorBoundary>);
 await expect.element(page.getByRole('heading',{name:'The garage hit a snag'})).toBeVisible();
 await expect.element(page.getByRole('button',{name:'Reload the garage'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Return to DualBore Media'})).toHaveAttribute('href','/');
 expect(uncaught).toEqual([]);
 expect(captured).toEqual([original]);
 expect(localStorage.getItem('dbm-store-cart-v1')).toBe('preserved-cart-fixture');
 expect(page.getByRole('alert').element().textContent).not.toContain('Reference:');
});

// A static search snippet may refer to an older production release. Reproduce
// current route behavior from a *cold* app start with failed background APIs
// before claiming any particular code path is the source of a render crash.
test.each(projects.flatMap(project=>[
 ['/builds/'+project.id+'/',project.name],
 ['/builds/'+project.id,project.name]
]))('cold deep link %s renders its build without an ErrorBoundary, even offline',async(route,title)=>{
 vi.stubGlobal('localStorage',{getItem(){throw new Error('Storage denied');},setItem(){throw new Error('Storage denied');},removeItem(){throw new Error('Storage denied');}});
 await boot(route,{offline:true});
 await expect.element(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'The garage hit a snag'})).not.toBeInTheDocument();
 // The heading can paint before the passive metadata effect runs on a cold lazy mount.
 await expect.poll(()=>document.querySelector('link[rel="canonical"]')?.href).toBe('https://dualboremedia.com/builds/'+route.split('/')[2]+'/');
});

test.each([
 ['/shop/','Drop 01 is coming soon.'],
 ['/shop','Drop 01 is coming soon.'],
 ['/setups/','Your bike. Your setup.'],
 ['/setups','Your bike. Your setup.']
])('cold public section %s renders when video/catalog providers are offline',async(route,heading)=>{
 await boot(route,{offline:true});
 await expect.element(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'The garage hit a snag'})).not.toBeInTheDocument();
});

test('error fallback discourages indexing, contains no inactive-cart claims and cleans up head metadata',async()=>{
 const originalRobots=document.head.querySelector('meta[name="robots"]');
 const previous=originalRobots?.getAttribute('content');
 vi.spyOn(console,'error').mockImplementation(()=>{});
 const root=createRoot(host);dispose=()=>root.unmount();
 function Broken(){throw new Error('SYNTHETIC_NO_INDEX_ERROR');}
 root.render(<ErrorBoundary><Broken/></ErrorBoundary>);
 await expect.element(page.getByRole('heading',{name:'The garage hit a snag'})).toBeVisible();
 await expect.poll(()=>document.head.querySelector('meta[name="robots"]')?.content).toBe('noindex, nofollow');
 expect(host.textContent).not.toContain('Your saved cart stays on this device');
 dispose();dispose=undefined;
 const actual=document.head.querySelector('meta[name="robots"]');
 if(originalRobots)expect(actual?.getAttribute('content')).toBe(previous);
 else expect(actual).toBeNull();
});
