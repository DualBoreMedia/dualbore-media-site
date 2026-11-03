import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import '../../src/styles.css';

let root,host,App;
beforeEach(async()=>{
 vi.stubEnv('MODE','commerce');localStorage.clear();sessionStorage.clear();history.replaceState(null,'','/#merch');
 ({App}=await import('../../src/App.jsx'));host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({enabled:false,mode:'test',shippingCents:700})));
});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();history.replaceState(null,'','/');});

test('local full app connects design details, chosen size, cart and continue shopping',async()=>{
 root.render(<App/>);await page.getByRole('button',{name:'View E92 Coupe Line-Art Tee design details'}).click();
 const modal=page.getByRole('dialog');await expect.element(modal.getByRole('navigation',{name:'Made-to-order policies'})).toBeVisible();
 await modal.getByText('Size guide · S-2XL preview',{exact:true}).click();await expect.element(modal.getByRole('table')).toBeVisible();
 await modal.getByRole('button',{name:'E92 Coupe Line-Art Tee, size M'}).click();await modal.getByRole('button',{name:'Add to test cart'}).click();
 await expect.element(modal.getByText('E92 Coupe Line-Art Tee, M: added to test cart.',{exact:true})).toBeVisible();
 await modal.getByRole('button',{name:'View cart'}).click();
 await expect.element(page.getByRole('dialog').getByRole('heading',{name:/Your garage gear/})).toBeVisible();
 await expect.element(page.getByRole('dialog').getByText('Subtotal (1 items)')).toBeVisible();
 await page.getByRole('button',{name:'Continue shopping'}).click();await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
 await page.getByRole('button',{name:'Open test cart, 1 items'}).click();await expect.element(page.getByRole('dialog')).toBeVisible();
 const drawer=document.querySelector('.cart-drawer');drawer.dispatchEvent(new Event('cancel',{cancelable:true,bubbles:true}));
 await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

test('local footer pre-fills consent form without submitting and product alerts remain explicit',async()=>{
 root.render(<App/>);await page.getByLabelText('Get the first-drop details.').fill('synthetic@example.invalid');
 await page.getByRole('button',{name:'Continue to Drop 01 signup'}).click();
 await expect.element(page.getByRole('dialog').getByLabelText('Email address')).toHaveValue('synthetic@example.invalid');
 await expect.element(page.getByRole('dialog').getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'Close details'}).click();await page.getByRole('button',{name:'Join Drop 01 alerts',exact:true}).click();
 await expect.element(page.getByRole('dialog').getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'Close details'}).click();
});

test('local policy and order fixtures preserve cart and route back into merchandise',async()=>{
 localStorage.setItem('dbm-commerce-test-cart-v1',JSON.stringify({version:1,items:[{variantId:'e92-tee-m',quantity:2}]}));
 history.replaceState(null,'','/shipping');root.render(<App/>);
 await expect.element(page.getByText('Pre-launch draft. This page is incomplete and is not an approved customer policy.')).toBeVisible();
 await page.getByRole('button',{name:'Back to Drop 01',exact:true}).click();await expect.element(page.getByRole('button',{name:'Open test cart, 2 items'})).toBeVisible();
 for(const [state,title] of [['success','Backed by the garage.'],['pending','Checking the details.'],['cancel','Keep the gear in mind.']]){
  history.pushState(null,'','/order/'+state);window.dispatchEvent(new PopStateEvent('popstate'));
  await expect.element(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  expect(JSON.parse(localStorage.getItem('dbm-commerce-test-cart-v1')).items).toEqual([{variantId:'e92-tee-m',quantity:2}]);
  await page.getByRole('button',{name:'Back to Drop 01',exact:true}).click();
 }
});

test('blocked local storage displays an honest cart warning while remaining usable',async()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('storage blocked');});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('storage blocked');});
 root.render(<App/>);await page.getByRole('button',{name:'Open test cart, 0 items'}).click();
 await expect.element(page.getByRole('dialog').getByText('Your browser cannot save this cart. Keep this page open while testing.')).toBeVisible();
 await page.getByRole('button',{name:'Explore Drop 01',exact:true}).click();await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});
