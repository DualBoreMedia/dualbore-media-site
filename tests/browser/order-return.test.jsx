import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {OrderStatus} from '../../src/commerce/OrderStatus.jsx';
import {cartSignature} from '../../src/commerce/checkout-client.js';

let root,host;
const id='cs_test_ReturnFixture123';
const items=[{variantId:'e92-tee-m',quantity:1},{variantId:'e90-crewneck-l',quantity:1}];
const paid={status:'paid',orderNumber:'DBM-RETURN',subtotalCents:8000,shippingCents:995,taxCents:0,totalCents:8995,items:items.map((item,index)=>({...item,unitPriceCents:index?5000:3000,lineTotalCents:index?5000:3000}))};
beforeEach(()=>{localStorage.clear();sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/order/success?session_id='+id);sessionStorage.setItem('dbm-order-access:'+id,'synthetic-access');sessionStorage.setItem('dbm-order-cart:'+id,JSON.stringify(items));});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();history.replaceState(null,'','/');});
function reset(){root.unmount();root=createRoot(host);}

test('paid return distinguishes simulation, test email and production email with idempotent cart cleanup',async()=>{
 const replace=vi.fn(),back=vi.fn();let payload={...paid,mock:true};vi.stubGlobal('fetch',vi.fn(async()=>Response.json(payload)));
 sessionStorage.setItem('dbm-checkout-attempt',JSON.stringify({signature:cartSignature(items),key:'synthetic'}));
 root.render(<OrderStatus cart={{items,replace}} onBack={back}/>);
 await expect.element(page.getByRole('heading',{name:'Simulated order result.'})).toBeVisible();
 await expect.element(page.getByText('No real order email is sent by this simulation.')).toBeVisible();expect(sessionStorage.getItem('dbm-checkout-attempt')).toBeNull();
 reset();payload={...paid,status:'fulfilled',emailStatus:'sent'};root.render(<OrderStatus cart={{items,replace}} onBack={back}/>);
 await expect.element(page.getByText('The server reports that the test order email was sent.')).toBeVisible();expect(replace).toHaveBeenCalledOnce();
 reset();const live='cs_live_ReturnFixture123';history.replaceState(null,'','/order/success?session_id='+live);sessionStorage.setItem('dbm-order-access:'+live,'synthetic-access');sessionStorage.setItem('dbm-order-cart:'+live,JSON.stringify(items));sessionStorage.setItem('dbm-production-checkout-attempt',JSON.stringify({signature:cartSignature(items),key:'synthetic'}));
 root.render(<OrderStatus mode="production" cart={{items,replace}} onBack={back}/>);await expect.element(page.getByRole('heading',{name:'Payment confirmed.'})).toBeVisible();await expect.element(page.getByText('Your order email was sent.')).toBeVisible();
 await page.getByRole('button',{name:'Back to the garage store'}).click();expect(back).toHaveBeenCalledOnce();expect(sessionStorage.getItem('dbm-production-checkout-attempt')).toBeNull();
});

test('unpaid final states and checkout cancellation preserve every cart item',async()=>{
 const replace=vi.fn();let payload={status:'failed'};vi.stubGlobal('fetch',vi.fn(async()=>Response.json(payload)));
 for(const status of ['failed','expired','cancelled','refunded']){
  payload={status};root.render(<OrderStatus cart={{items,replace}}/>);await expect.element(page.getByRole('heading',{name:'Test order status.'})).toBeVisible();await expect.element(page.getByText('No paid order has been verified on this screen. Your cart stays saved.')).toBeVisible();reset();
 }
 history.replaceState(null,'','/order/cancel?session_id='+id);payload={status:'cancelled',mock:true};root.render(<OrderStatus cart={{items,replace}}/>);
 await expect.element(page.getByRole('heading',{name:'Checkout closed.'})).toBeVisible();await expect.element(page.getByText('You left checkout. No paid order has been verified here. Your cart stays saved.')).toBeVisible();expect(replace).not.toHaveBeenCalled();
});

test('bad totals, bad item totals and unknown provider status cannot clear the cart',async()=>{
 const replace=vi.fn();let payload;vi.stubGlobal('fetch',vi.fn(async()=>Response.json(payload)));
 for(const [body,message] of [[{...paid,totalCents:1},'Order totals could not be verified.'],[{...paid,items:paid.items.map(i=>({...i,lineTotalCents:1}))},'Order items could not be verified.'],[{status:'unverified'},'The order status could not be verified.']]){
  payload=body;root.render(<OrderStatus cart={{items,replace}}/>);await expect.element(page.getByRole('alert')).toHaveTextContent(message);expect(replace).not.toHaveBeenCalled();reset();
 }
});

test('failed cart cleanup rolls back its marker so a verified return can safely retry',async()=>{
 const replace=vi.fn().mockImplementationOnce(()=>{throw Error('Synthetic cart persistence failure');});vi.stubGlobal('fetch',vi.fn(async()=>Response.json(paid)));
 root.render(<OrderStatus cart={{items,replace}}/>);await expect.element(page.getByRole('alert')).toHaveTextContent('Synthetic cart persistence failure');expect(sessionStorage.getItem('dbm-order-cleared:'+id)).toBeNull();
 reset();root.render(<OrderStatus cart={{items,replace}}/>);await expect.element(page.getByRole('heading',{name:'Test payment verified.'})).toBeVisible();expect(replace).toHaveBeenCalledTimes(2);
});

test('pending polling stops after ten checks and explicit retry can verify the payment',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});let payload={status:'pending',mock:true};let calls=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{calls++;return Response.json(payload);}));const replace=vi.fn();root.render(<OrderStatus cart={{items,replace}}/>);
 await vi.waitFor(()=>expect(calls).toBe(1));for(let n=0;n<10;n++)await vi.advanceTimersByTimeAsync(2100);
 vi.useRealTimers();await expect.element(page.getByRole('button',{name:'Check payment status again'})).toBeVisible();expect(calls).toBe(10);expect(replace).not.toHaveBeenCalled();
 payload=paid;await page.getByRole('button',{name:'Check payment status again'}).click();await expect.element(page.getByRole('heading',{name:'Test payment verified.'})).toBeVisible();expect(calls).toBe(11);
});
