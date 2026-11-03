import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import {RetailMerch} from '../../src/commerce/Storefront.jsx';
import '../../src/styles.css';
let host,root;
const body=()=>host;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();history.replaceState(null,'','/#merch');host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

test('public Drop 01 preview searches, filters, sorts and recovers without inventing inventory',async()=>{
 root.render(<App/>);
 await expect.element(page.getByRole('heading',{name:'Explore the shop'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search products'}).fill('SV1000S');
 await expect.element(page.getByText('1 of 3 designs')).toBeVisible();
 expect(host.querySelectorAll('.merch-card')).toHaveLength(1);
 await page.getByRole('searchbox',{name:'Search products'}).fill('');
 await page.getByRole('combobox',{name:'Sort by'}).selectOptions('price-high');
 await expect.element(page.getByText('3 of 3 designs')).toBeVisible();
 expect(Array.from(host.querySelectorAll('.merch-card h3'),element=>element.textContent)).toEqual(['E90 Sedan Front-Clip Crewneck','SV1000S Silhouette Crewneck','E92 Coupe Line-Art Tee']);
 await page.getByRole('combobox',{name:'Sort by'}).selectOptions('price-low');
 expect(host.querySelector('.merch-card h3').textContent).toBe('E92 Coupe Line-Art Tee');
 await page.getByRole('searchbox',{name:'Search products'}).fill('E90');
 await page.getByRole('button',{name:'Apply filters'}).click();
 await expect.element(page.getByText('1 of 3 designs')).toBeVisible();
 expect(host.querySelector('.merch-card h3').textContent).toBe('E90 Sedan Front-Clip Crewneck');
 await page.getByRole('searchbox',{name:'Search products'}).fill('SV1000S');
 await page.getByRole('combobox',{name:'Category'}).selectOptions('stickers');
 await expect.element(page.getByRole('heading',{name:'No matching products yet.'})).toBeVisible();
 expect(host.querySelectorAll('.merch-card')).toHaveLength(0);
 await page.getByRole('button',{name:'Show all merchandise'}).click();
 expect(host.querySelectorAll('.merch-card')).toHaveLength(3);
 await page.getByRole('combobox',{name:'Gender / age'}).selectOptions('kids');
 await expect.element(page.getByText('0 of 3 designs')).toBeVisible();
 await page.getByRole('button',{name:'Clear shop filters'}).click();
 expect(host.querySelectorAll('.merch-card')).toHaveLength(3);
});
test('local commerce preview filters only visual cards without changing cart',async()=>{
 const cart={items:[{variantId:'e92-tee-m',quantity:1}],scenario:'in-stock',count:1};
 root.render(<RetailMerch cart={cart} onAdded={()=>{}} onReview={()=>{}} onDetails={()=>{}} onAlert={()=>{}}/>);
 await page.getByRole('combobox',{name:'Category'}).selectOptions('crewnecks');
 await expect.element(page.getByText('2 of 3 designs')).toBeVisible();
 expect(host.querySelectorAll('.retail-product')).toHaveLength(2);
 await page.getByRole('searchbox',{name:'Search products'}).fill('E90');
 await expect.element(page.getByText('1 of 3 designs')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search products'}).fill('');
 await page.getByRole('combobox',{name:'Category'}).selectOptions('accessories');
 await expect.element(page.getByRole('heading',{name:'No matching products yet.'})).toBeVisible();
 expect(cart.items).toEqual([{variantId:'e92-tee-m',quantity:1}]);
});
test('gated /shop previews remain searchable while checkout and sales stay closed',async()=>{
 history.replaceState(null,'','/shop');
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({enabled:false,variants:[]})));
 root.render(<ProductionStore/>);
 await expect.element(page.getByRole('region',{name:'Drop 01 design previews'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search products'}).fill('sedan');
 expect(host.querySelectorAll('.closed-designs article')).toHaveLength(1);
 await page.getByRole('combobox',{name:'Category'}).selectOptions('accessories');
 expect(host.querySelectorAll('.closed-designs article')).toHaveLength(0);
 await expect.element(page.getByRole('button',{name:/Checkout|Buy|Cart \(/i})).not.toBeInTheDocument();
});


test('server catalog controls each product and cart size without invented options',async()=>{
 history.replaceState(null,'','/shop');
 const variants=[
  {id:'e92-tee-m',productId:'e92-tee',name:'E92 Tee',size:'XS',available:true,inventoryPolicy:'made_to_order',unitAmount:3000},
  {id:'e92-tee-l',productId:'e92-tee',name:'E92 Tee',size:'3XL',available:true,inventoryPolicy:'made_to_order',unitAmount:3500},
  {id:'e92-tee-xl',productId:'e92-tee',name:'E92 Tee',size:'2XS',available:false,inventoryPolicy:'stocked',unitAmount:3000},
 ];
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({enabled:true,variants,shippingCents:995}),{status:200,headers:{'Content-Type':'application/json'}})));
 root.render(<ProductionStore/>);
 const product=page.getByRole('article').filter({has:page.getByRole('heading',{name:'E92 Coupe Line-Art Tee',exact:true})});
 await expect.element(product.getByRole('button',{name:'XS',exact:true})).toBeVisible();
 await product.getByRole('button',{name:'2XS',exact:true}).click();await expect.element(product.getByRole('button',{name:'Sold out',exact:true})).toBeDisabled();
 expect(Array.from(host.querySelectorAll('.size-options button'),e=>e.textContent)).toEqual(['XS','3XL','2XS']);
 await product.getByRole('button',{name:'XS',exact:true}).click();await product.getByRole('button',{name:'Add to cart',exact:true}).click();
 await page.getByRole('button',{name:'Cart (1)',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Your cart'});
 const size=dialog.getByRole('combobox',{name:'Size for E92 Tee'});
 await expect.element(size).toHaveValue('XS');
 expect(Array.from(host.querySelectorAll('.production-cart-line select option'),e=>e.value)).toEqual(['XS','3XL','2XS']);
 expect(host.querySelector('.production-cart-line option[value="2XS"]').disabled).toBe(true);
 await size.selectOptions('3XL');await expect.element(size).toHaveValue('3XL');
 await expect.element(dialog.getByText('Subtotal: $35.00',{exact:true})).toBeVisible();
});
