import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import {CartDrawer} from '../../src/commerce/Storefront.jsx';
import '../../src/styles.css';
let root,host;
const json=(body,status=200)=>Response.json(body,{status});
const line={variantId:'e92-tee-m',quantity:1,unitPriceCents:3500,lineTotalCents:3500,name:'E92 Tee',size:'M'};
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();sessionStorage.clear();history.replaceState(null,'','/shop');});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

test('production-shaped store handles price review, definitive failure and unavailable size without losing cart',async()=>{
 const variants=['S','M','L'].map(size=>({id:'e92-tee-'+size.toLowerCase(),productId:'e92-tee',name:'E92 Tee',size,unitAmount:3000,available:size!=='L',inventoryPolicy:'stocked'}));
 let attempts=0;const request=vi.fn(async(url,options)=>url==='/api/commerce/catalog'?json({enabled:true,shippingCents:995,variants}):++attempts===1?json({code:'cart_changed',quoteToken:'fixture-quote',lines:[line]},409):json({code:'checkout_failed',error:'Checkout could not be created. Your cart stays saved.'},409));vi.stubGlobal('fetch',request);
 root.render(<ProductionStore getToken={async()=> 'synthetic-account-token'}/>);const product=page.getByRole('article').first();
 await product.getByRole('button',{name:'M',exact:true}).click();await product.getByRole('button',{name:'Add to cart'}).click();await page.getByRole('button',{name:'Cart (1)'}).click();
 await page.getByRole('button',{name:'Continue to secure checkout'}).click();await expect.element(page.getByRole('heading',{name:'Review current prices'})).toBeVisible();
 const initialKey=request.mock.calls.find(([url])=>url==='/api/commerce/checkout')[1].headers['Idempotency-Key'];
 await page.getByRole('button',{name:'Accept prices and checkout'}).click();await expect.element(page.getByRole('dialog').getByRole('alert').filter({hasText:'Checkout could not be created'})).toBeVisible();
 const retry=request.mock.calls.filter(([url])=>url==='/api/commerce/checkout').at(-1)[1];expect(retry.headers['Idempotency-Key']).toBe(initialKey);expect(retry.headers['X-Cart-Quote']).toBe('fixture-quote');expect(retry.headers.Authorization).toBe('Bearer synthetic-account-token');expect(sessionStorage.getItem('dbm-production-checkout-attempt')).toBeNull();
 await page.getByLabelText('Size for E92 Tee').selectOptions('L');await expect.element(page.getByRole('dialog').getByRole('alert').filter({hasText:'That size is not currently available.'})).toBeVisible();
 expect(JSON.parse(localStorage.getItem('dbm-store-cart-v1')).items).toEqual([{variantId:'e92-tee-m',quantity:1}]);
 await page.getByLabelText('Quantity',{exact:true}).fill('11');await expect.element(page.getByRole('dialog').getByRole('alert').filter({hasText:'Choose a valid size and a quantity'})).toBeVisible();
});

test('test-cart checkout accepts an explicit price review and resets only definitively failed attempts',async()=>{
 let attempts=0;const request=vi.fn(async(url)=>url==='/api/commerce/config'?json({enabled:true,mode:'test',shippingCents:700,mock:true}):++attempts===1?json({code:'cart_changed',quoteToken:'fixture-quote',lines:[line]},409):json({code:'checkout_failed',error:'Synthetic definitive checkout failure'},409));vi.stubGlobal('fetch',request);
 function Fixture(){const[items,setItems]=useState([{variantId:'e92-tee-m',quantity:1}]);return <CartDrawer cart={{items,count:1,scenario:'in-stock',replace:setItems}} onClose={()=>{}}/>;}
 root.render(<Fixture/>);await page.getByRole('button',{name:'Checkout / Local simulation'}).click();await expect.element(page.getByRole('heading',{name:'Review current server prices.'})).toBeVisible();
 await page.getByRole('button',{name:'Accept prices and open test checkout'}).click();await expect.element(page.getByRole('alert').filter({hasText:'Synthetic definitive checkout failure'})).toBeVisible();
 const posts=request.mock.calls.filter(([url])=>url==='/api/commerce/checkout');expect(posts[1][1].headers['X-Cart-Quote']).toBe('fixture-quote');expect(posts[0][1].headers['Idempotency-Key']).toBe(posts[1][1].headers['Idempotency-Key']);expect(sessionStorage.getItem('dbm-checkout-attempt')).toBeNull();
 await expect.element(page.getByRole('dialog').getByText('Subtotal (1 items)')).toBeVisible();
});
