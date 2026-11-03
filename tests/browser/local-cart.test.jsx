import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {RetailMerch} from '../../src/commerce/Storefront.jsx';
import {StoreFooter} from '../../src/commerce/Pages.jsx';

let root,host;
afterEach(()=>{root?.unmount();host?.remove();vi.restoreAllMocks();vi.unstubAllEnvs();localStorage.clear();});
test('local commerce hook restores and persists cart edits and explicit fixtures',async()=>{
 vi.stubEnv('MODE','commerce');
 const {useTestCart,testCommerceEnabled}=await import('../../src/commerce/Commerce.jsx');
 expect(testCommerceEnabled).toBe(true);
 localStorage.setItem('dbm-commerce-test-cart-v1',JSON.stringify({version:1,items:[]}));
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 function Cart(){const cart=useTestCart();return <><output aria-label="Cart count">{cart.count}</output><button onClick={()=>cart.add('e92-tee-m',1)}>Add fixture item</button><button onClick={()=>cart.replace([])}>Clear cart</button><RetailMerch cart={cart} onAdded={()=>{}} onReview={()=>{}} onDetails={()=>{}} onAlert={()=>{}}/><StoreFooter onAlert={()=>{}}/></>;}
 root.render(<Cart/>);
 await page.getByRole('button',{name:'Add fixture item'}).click();await expect.element(page.getByLabelText('Cart count')).toHaveTextContent('1');
 await page.getByRole('button',{name:'Clear cart'}).click();await expect.element(page.getByLabelText('Cart count')).toHaveTextContent('0');
 await page.getByText('Store test controls',{exact:false}).click();await page.getByRole('combobox',{name:/Commerce scenario/}).selectOptions('sold-out');
 await expect.poll(()=>localStorage.getItem('dbm-test-scenario-v1')).toBe('sold-out');
});
