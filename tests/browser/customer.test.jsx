import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {page} from '@vitest/browser/context';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
import OperationsApp from '../../src/operations/OperationsApp.jsx';
import Unsubscribe from '../../src/operations/Unsubscribe.jsx';
import {Waitlist} from '../../src/Waitlist.jsx';
import {OrderStatus} from '../../src/commerce/OrderStatus.jsx';

let root, host;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();sessionStorage.clear();});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const mount=element=>root.render(element);
const variants=['S','M','L','XL','2XL'].map(size=>({id:'e92-tee-'+size.toLowerCase(),productId:'e92-tee',name:'E92 Coupe Line-Art Tee',size,unitAmount:3000,inventoryPolicy:'made_to_order',available:size!=='XL'}));

test('closed commerce fails safely without a cart or purchase button',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('network')));mount(<ProductionStore/>);
  await expect.element(page.getByRole('heading',{name:'Drop 01 is coming soon.'})).toBeVisible();
  await expect.element(page.getByRole('button',{name:/Cart/})).not.toBeInTheDocument();
});
test('sizes, quantities and removal update the real persistent cart, and Escape restores focus',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({enabled:true,shippingCents:995,variants})));mount(<ProductionStore/>);
  const first=page.getByRole('article').first();
  await first.getByRole('button',{name:'XL',exact:true}).click();
  await expect.element(first.getByRole('button',{name:'Orders paused'})).toBeDisabled();
  await first.getByRole('button',{name:'M',exact:true}).click();
  await first.getByLabel('Quantity').selectOptions('2');
  await first.getByRole('button',{name:'Add to cart'}).click();
  await page.getByRole('button',{name:'Cart (2)'}).click();
  const dialog=page.getByRole('dialog');
  await expect.element(dialog.getByText('Subtotal: $60.00')).toBeVisible();
  await dialog.getByLabel('Quantity',{exact:true}).fill('3');
  await expect.element(dialog.getByText('Subtotal: $90.00')).toBeVisible();
  await dialog.getByLabel('Size for E92 Coupe Line-Art Tee').selectOptions('L');
  expect(JSON.parse(localStorage.getItem('dbm-store-cart-v1')).items).toEqual([{variantId:'e92-tee-l',quantity:3}]);
  await dialog.getByRole('button',{name:'Remove item'}).click();
  await expect.element(dialog.getByText('Your cart is empty.')).toBeVisible();
  await expect.element(dialog.getByRole('button',{name:'Continue to secure checkout'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Close cart'}).click();
  await expect.element(page.getByRole('button',{name:'Cart (0)'})).toHaveFocus();
});
test('WorkOS refresh refusal shows ordinary hosted sign-in and never staff navigation',async()=>{
  const request=vi.fn().mockResolvedValue(response({signedIn:false},401));vi.stubGlobal('fetch',request);mount(<WorkosOperations/>);
  await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in');
  expect(request.mock.calls.some(([url,options])=>url==='/api/auth/refresh'&&options.method==='POST')).toBe(true);
  await expect.element(page.getByRole('link',{name:'Create account'})).toBeVisible();
  await expect.element(page.getByRole('navigation',{name:'Operations navigation'})).not.toBeInTheDocument();
});
test('account empty orders, profile and help use customer-only views',async()=>{
  const fetcher=vi.fn().mockResolvedValue(response({orders:[],profile:{},supportTickets:[]}));
  mount(<OperationsApp auth={{isLoaded:true,isSignedIn:true,getToken:async()=>null,fetcher}}/>);
  await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await expect.element(page.getByRole('heading',{name:/Profile|preferences/i}).first()).toBeVisible();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await expect.element(page.getByRole('heading',{name:/support|help/i}).first()).toBeVisible();
});
test('marketing preference requires an explicit click and reports a failed request truthfully',async()=>{
  const request=vi.fn().mockResolvedValue(response({saved:false},503));vi.stubGlobal('fetch',request);mount(<Unsubscribe/>);
  expect(request).not.toHaveBeenCalled();await page.getByRole('button',{name:'Unsubscribe from marketing'}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('We could not confirm this preference');
  request.mockResolvedValue(response({saved:true}));await page.getByRole('button',{name:'Unsubscribe from marketing'}).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Order and shipment updates are separate');
});
test('waitlist consent is unchecked and local preview cannot fabricate success',async()=>{
  const success=vi.fn();mount(<Waitlist item={{id:'e92-tee'}} onSuccess={success}/>);
  await expect.element(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByLabel('Your name').fill('Synthetic');await page.getByLabel('Email address').fill('synthetic@example.invalid');
  await page.getByLabel('Preferred size').selectOptions('M');await page.getByRole('checkbox').click();
  await page.getByRole('button',{name:'Join Drop Alert'}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('local preview');expect(success).not.toHaveBeenCalled();
});
test('order return without an access session preserves cart and refuses payment confirmation',async()=>{
  const replace=vi.fn();mount(<OrderStatus mode="production" cart={{items:[{variantId:'e92-tee-m',quantity:1}],replace}} onBack={()=>{}}/>);
  await expect.element(page.getByRole('alert')).toHaveTextContent('No valid checkout session');expect(replace).not.toHaveBeenCalled();
  await expect.element(page.getByRole('heading',{name:'Payment confirmed.'})).not.toBeInTheDocument();
});
