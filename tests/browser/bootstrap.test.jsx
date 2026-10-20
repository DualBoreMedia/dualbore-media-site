import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {ErrorBoundary} from '../../src/observability/ErrorBoundary.jsx';

let host,dispose,module,first=true;
const response=(body,status=200)=>Response.json(body,{status});
beforeEach(()=>{host=document.createElement('div');host.id='root';document.body.append(host);localStorage.clear();sessionStorage.clear();});
afterEach(()=>{dispose?.();dispose=undefined;host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();history.replaceState(null,'','/');});
async function boot(path){
 history.replaceState(null,'',path);
 vi.stubGlobal('fetch',vi.fn(url=>Promise.resolve(url==='/api/commerce/catalog'?response({enabled:false,variants:[]}):response({signedIn:false},401))));
 module=await import('../../src/main.jsx');
 dispose=first?await module.applicationReady:await module.start(host);first=false;
}
test('real application bootstrap renders the public garage and disposes its listeners',async()=>{
 await boot('/');await expect.element(page.getByRole('heading',{name:/Four platforms/})).toBeVisible();
 await page.getByRole('tab',{name:/Video Vault/}).click();await expect.element(page.getByRole('button',{name:'Turbo Cars'})).toBeVisible();
});
test('real lazy store entry keeps both sales and signup paused',async()=>{
 await boot('/shop');await expect.element(page.getByRole('heading',{name:'Drop 01 is coming soon.'})).toBeVisible();
 await expect.element(page.getByText(/Orders and Drop Alert signups are not open yet/)).toBeVisible();
 await expect.element(page.getByRole('button',{name:/checkout|buy now|Cart/i})).not.toBeInTheDocument();
});
test('real lazy account and staff entries remain signed out and deny privileged content',async()=>{
 await boot('/account');await expect.element(page.getByRole('heading',{name:'Welcome to your garage'})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Create account'})).toBeVisible();dispose();dispose=undefined;
 history.replaceState(null,'','/admin');dispose=await module.start(host);
 await expect.element(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible();
 await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in?staff=1');
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
