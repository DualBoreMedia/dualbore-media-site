import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import '../../src/styles.css';
import '../../src/product-polish.css';
let root,host;
beforeEach(()=>{
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubEnv('VITE_AUTH_ACCESS_MODE','staff-only');
 vi.stubGlobal('fetch',vi.fn(async url=>Response.json(String(url).includes('/api/commerce/catalog')?{enabled:false,variants:[],items:[]}:{products:[],hiddenProductIds:[],setupPreviews:[]})));
});
afterEach(()=>{root.unmount();host.remove();vi.unstubAllGlobals();vi.unstubAllEnvs();history.replaceState(null,'','/');});
test('homepage merch shows selectable garment plans per artwork without enabling sales',async()=>{
 history.replaceState(null,'','/#merch');root.render(<App/>);
 const item=page.getByRole('region',{name:'Planned garments for E92 Coupe Line-Art Tee'});
 await expect.element(item.getByRole('button',{name:'T-shirt'})).toHaveAttribute('aria-pressed','true');
 await item.getByRole('button',{name:'Sweatshirt'}).click();
 await expect.element(item.getByRole('button',{name:'Sweatshirt'})).toHaveAttribute('aria-pressed','true');
 await expect.element(item.getByText(/garment photo, fit details and price are not approved/)).toBeVisible();
 await expect.element(page.getByRole('button',{name:'Add to cart'})).not.toBeInTheDocument();
});
test('closed production shop shares garment options with homepage',async()=>{
 history.replaceState(null,'','/shop');root.render(<ProductionStore/>);
 const item=page.getByRole('region',{name:'Planned garments for SV1000S Silhouette Crewneck'});
 await expect.element(item.getByRole('button',{name:'Crewneck'})).toHaveAttribute('aria-pressed','true');
 await item.getByRole('button',{name:'T-shirt'}).click();
 await expect.element(item.getByText(/garment photo, fit details and price are not approved/)).toBeVisible();
 await expect.element(page.getByText('Orders and Drop Alert signups are not open yet.')).toBeVisible();
});
