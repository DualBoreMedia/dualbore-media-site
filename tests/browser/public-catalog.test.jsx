import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {CatalogStatus,usePublicCatalog} from '../../src/usePublicCatalog.jsx';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import {App} from '../../src/App.jsx';
import '../../src/styles.css';

let host,root;
const physical={id:'e92-tee',type:'physical',name:'Saved published tee',description:'Approved description; private edits are excluded.',category:'Track apparel',audience:'unisex',sku:'QA-MANAGED',priceCents:3500,images:['/assets/IMG_5076.jpg'],sizes:['XS','3XL'],fulfillment:'made_to_order'};
const hiddenOriginals=['e92-tee','e90-crewneck','sv1000s-silhouette'];
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/shop');localStorage.clear();});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});
function CatalogFixture(){const catalog=usePublicCatalog();return <><CatalogStatus catalog={catalog}/><ul>{catalog.products.map(product=><li key={product.id}>{product.name}</li>)}</ul></>;}
test('catalog error retry never resurrects unpublished originals, stale promises cannot replace later snapshots',async()=>{
 let pending,requests=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{requests++;if(requests===1)return Response.json({products:[],hiddenProductIds:hiddenOriginals});if(requests===2)throw Error('offline');return Response.json({products:[],hiddenProductIds:hiddenOriginals});}));
 root.render(<CatalogFixture/>);await expect.poll(()=>host.querySelector('ul')?.children.length).toBe(0);
 root.unmount();root=createRoot(host);root.render(<CatalogFixture/>);
 await expect.element(page.getByText('Product previews are temporarily unavailable. Please try again.')).toBeVisible();
 expect(host.querySelectorAll('li')).toHaveLength(0);
 await page.getByRole('button',{name:'Retry product previews'}).click();await expect.element(page.getByRole('button',{name:'Retry product previews'})).not.toBeInTheDocument();expect(host.querySelectorAll('li')).toHaveLength(0);
 // An ignored abort after unmount cannot publish its stale response.
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(resolve=>{pending=resolve;})));root.unmount();root=createRoot(host);root.render(<CatalogFixture/>);await expect.element(page.getByText('Loading product previews...')).toBeVisible();
 root.unmount();root=createRoot(host);vi.stubGlobal('fetch',vi.fn(async()=>Response.json({products:[],hiddenProductIds:hiddenOriginals})));root.render(<CatalogFixture/>);
 pending(Response.json({products:[physical],hiddenProductIds:[]}));await expect.element(page.getByText('Loading product previews...')).not.toBeInTheDocument();expect(host.querySelectorAll('li')).toHaveLength(0);
});
test('standalone shop renders managed snapshots and real asset path with generated filters and no purchase flow',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>Response.json(url==='/api/products'?{products:[physical],hiddenProductIds:hiddenOriginals.slice(1)}:{enabled:false,variants:[]})));
 root.render(<ProductionStore/>);await expect.element(page.getByRole('heading',{name:'Saved published tee'})).toBeVisible();
 expect(host.querySelector('.closed-designs img').getAttribute('src')).toBe('/assets/IMG_5076.jpg');
 await page.getByRole('combobox',{name:'Category'}).selectOptions('Track apparel');await page.getByRole('combobox',{name:'Gender / age'}).selectOptions('unisex');
 expect(host.querySelectorAll('.closed-designs article')).toHaveLength(1);
 await page.getByRole('searchbox',{name:'Search products'}).fill('QA-MANAGED');await expect.element(page.getByText('1 of 1 designs')).toBeVisible();
 await expect.element(page.getByRole('button',{name:/Cart \(|Checkout|Buy/i})).not.toBeInTheDocument();expect(host.textContent).not.toContain('E90 Sedan');
});
test('malformed response and HTTP failure hide products and allow retry instead of reintroducing a static design',async()=>{
 let fail=true;
 vi.stubGlobal('fetch',vi.fn(async url=>url!=='/api/products'?Response.json({enabled:false,variants:[]}):fail?Response.json({error:'unavailable'},{status:503}):Response.json({products:[physical],hiddenProductIds:hiddenOriginals.slice(1)})));
 root.render(<ProductionStore/>);await expect.element(page.getByRole('button',{name:'Retry product previews'})).toBeVisible();expect(host.querySelectorAll('.closed-designs article')).toHaveLength(0);
 fail=false;await page.getByRole('button',{name:'Retry product previews'}).click();await expect.element(page.getByRole('heading',{name:'Saved published tee'})).toBeVisible();
 root.unmount();root=createRoot(host);vi.stubGlobal('fetch',vi.fn(async url=>Response.json(url==='/api/products'?{products:[{...physical,images:['https://evil.invalid/p.jpg']}],hiddenProductIds:[]}:{enabled:false,variants:[]})));root.render(<ProductionStore/>);
 await expect.element(page.getByRole('button',{name:'Retry product previews'})).toBeVisible();expect(host.querySelectorAll('.closed-designs article')).toHaveLength(0);
});

test('homepage and standalone shop agree across publication, unpublication and catalog outage',async()=>{
 let current={products:[physical],hiddenProductIds:hiddenOriginals.slice(1)};
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/products'?current?Response.json(current):Response.json({error:'unavailable'},{status:503}):url==='/api/commerce/catalog'?Response.json({enabled:false,variants:[]}):Response.json({items:[]})));
 const mount=element=>{root.unmount();root=createRoot(host);root.render(element);};
 history.replaceState(null,'','/#merch');root.render(<App/>);
 await expect.element(page.getByRole('heading',{name:'Saved published tee'})).toBeVisible();
 expect(host.querySelector('.merch-card .product-subtitle').textContent).toBe(physical.description);
 history.replaceState(null,'','/shop');mount(<ProductionStore/>);
 await expect.element(page.getByRole('heading',{name:'Saved published tee'})).toBeVisible();expect(host.querySelectorAll('.closed-designs article')).toHaveLength(1);
 current={products:[],hiddenProductIds:hiddenOriginals};
 history.replaceState(null,'','/#merch');mount(<App/>);await expect.element(page.getByText('0 of 0 designs')).toBeVisible();expect(host.querySelectorAll('.merch-card')).toHaveLength(0);
 history.replaceState(null,'','/shop');mount(<ProductionStore/>);await expect.element(page.getByText('0 of 0 designs')).toBeVisible();expect(host.querySelectorAll('.closed-designs article')).toHaveLength(0);
 current=null;history.replaceState(null,'','/#merch');mount(<App/>);await expect.element(page.getByRole('button',{name:'Retry product previews'})).toBeVisible();expect(host.querySelectorAll('.merch-card')).toHaveLength(0);
});
