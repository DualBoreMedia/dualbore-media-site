import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {page} from 'vitest/browser';
import {TestCheckout} from '../../src/commerce/TestCheckout.jsx';
import {CartDrawer} from '../../src/commerce/Storefront.jsx';
import '../../src/styles.css';

let root,host;
const session='cs_test_rendered12345678',token='t'.repeat(32);
const response=(body,status=200)=>Response.json(body,{status});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();sessionStorage.clear();history.replaceState(null,'',`/order/test-checkout?session_id=${session}`);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

test('local simulator requires this browser token and an explicitly enabled mock configuration',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({enabled:true,mode:'production',mock:false})));
 root.render(<TestCheckout/>);
 await expect.element(page.getByRole('alert').filter({hasText:'This browser does not have access'})).toBeVisible();
 await expect.element(page.getByRole('alert').filter({hasText:'Local simulation is not enabled'})).toBeVisible();
 await expect.element(page.getByRole('button',{name:'Simulate paid event'})).toBeDisabled();
});
test('local simulator exercises every event route and cancellation without treating navigation as payment proof',async()=>{
 sessionStorage.setItem(`dbm-order-access:${session}`,token);const navigate=vi.fn(),back=vi.fn();
 const fetcher=vi.fn(url=>Promise.resolve(response(url==='/api/commerce/config'?{enabled:true,mode:'test',mock:true}:{simulated:true})));vi.stubGlobal('fetch',fetcher);
 root.render(<TestCheckout navigate={navigate} onBack={back}/>);
 await expect.element(page.getByRole('button',{name:'Simulate paid event'})).toBeEnabled();
 for(const[action,label,destination]of [['paid','Simulate paid event','success'],['pending','Simulate pending payment','pending'],['failed','Simulate failed payment','cancel'],['expired','Simulate expired checkout','cancel']]){
  await page.getByRole('button',{name:label}).click();await vi.waitFor(()=>expect(navigate).toHaveBeenLastCalledWith(`/order/${destination}?session_id=${session}`));
  const [,request]=fetcher.mock.calls.filter(([url])=>url==='/api/commerce/simulate').at(-1);expect(JSON.parse(request.body)).toEqual({sessionId:session,action});expect(request.headers['X-Order-Token']).toBe(token);
 }
 await page.getByRole('button',{name:'Cancel simulation'}).click();expect(navigate).toHaveBeenLastCalledWith('/order/cancel');
 await page.getByRole('button',{name:'Back to the store'}).click();expect(back).toHaveBeenCalledOnce();
});
test('local simulator rejects provider failure and unconfirmed success while preserving saved cart',async()=>{
 sessionStorage.setItem(`dbm-order-access:${session}`,token);localStorage.setItem('dbm-test-cart-v1','unchanged-fixture');const navigate=vi.fn();let attempt=0;
 vi.stubGlobal('fetch',vi.fn(url=>Promise.resolve(url==='/api/commerce/config'?response({enabled:true,mode:'test',mock:true}):++attempt===1?response({error:'The local event is unavailable.'},503):response({}))));
 root.render(<TestCheckout navigate={navigate}/>);await expect.element(page.getByRole('button',{name:'Simulate paid event'})).toBeEnabled();
 await page.getByRole('button',{name:'Simulate paid event'}).click();await expect.element(page.getByRole('alert')).toHaveTextContent('The local event is unavailable.');
 await page.getByRole('button',{name:'Simulate pending payment'}).click();await expect.element(page.getByRole('alert')).toHaveTextContent('The local event was not confirmed. Your cart stays saved.');
 expect(navigate).not.toHaveBeenCalled();expect(localStorage.getItem('dbm-test-cart-v1')).toBe('unchanged-fixture');
});
test('cart server-price review, quantity changes, size changes and removal operate on the real drawer',async()=>{
 const replace=vi.fn();
 function Harness(){const[items,setItems]=useState([{variantId:'e92-tee-m',quantity:1}]);return <CartDrawer cart={{items,count:items.reduce((sum,line)=>sum+line.quantity,0),scenario:'changed-price',storageWarning:'Storage unavailable. Keep this page open.',replace:next=>{replace(next);setItems(next);}}} onClose={()=>{}}/>;}
 vi.stubGlobal('fetch',vi.fn(url=>Promise.resolve(response(url==='/api/commerce/config'?{enabled:false,mode:'test',shippingCents:700}:{mode:'test',checkoutAvailable:false,lines:[{variantId:'e92-tee-m',unitAmount:3500,quantity:1}],shipping:700,estimateBeforeTax:4200}))));
 root.render(<Harness/>);const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/Check server estimate/}).click();await expect.element(dialog.getByRole('heading',{name:'A test price changed.'})).toBeVisible();
 await dialog.getByRole('button',{name:'Accept updated test prices'}).click();await expect.element(dialog.getByText(/Server estimate: \$42.00/)).toBeVisible();
 await dialog.getByRole('button',{name:'Increase E92 Coupe Line-Art Tee, M'}).click();expect(replace).toHaveBeenLastCalledWith([{variantId:'e92-tee-m',quantity:2}]);
 await dialog.getByRole('button',{name:'Decrease E92 Coupe Line-Art Tee, M'}).click();expect(replace).toHaveBeenLastCalledWith([{variantId:'e92-tee-m',quantity:1}]);
 await dialog.getByLabelText('Edit size for E92 Coupe Line-Art Tee, M').selectOptions('L');expect(replace).toHaveBeenLastCalledWith([{variantId:'e92-tee-l',quantity:1}]);
 await dialog.getByRole('button',{name:'Remove E92 Coupe Line-Art Tee, L'}).click();await expect.element(dialog.getByRole('heading',{name:'Room for garage gear.'})).toBeVisible();
 await expect.element(dialog.getByText('Storage unavailable. Keep this page open.')).toBeVisible();
});
