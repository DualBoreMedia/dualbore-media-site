import {goPublic,openPublicNavigation} from './public-navigation-fixture.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
import OperationsApp from '../../src/operations/OperationsApp.jsx';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import {withPublicCatalog} from './catalog-fixture.js';
import '../../src/styles.css';
import '../../src/product-polish.css';

let root,host;
beforeEach(()=>{vi.stubGlobal('fetch',withPublicCatalog());host=document.createElement('div');document.body.append(host);root=createRoot(host);history.replaceState(null,'','/');localStorage.clear();});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});

test('homepage leads to a real episode, the crew page and the paused original merchandise preview',async()=>{
 root.render(<App/>);await expect.element(page.getByRole('heading',{name:'From our garage. Out for a ride.'})).toBeVisible();
 await page.getByRole('button',{name:'Play The N54 single-turbo build starts here'}).click();await expect.element(page.getByRole('dialog').getByTitle(/The N54/)).toHaveAttribute('src',expect.stringContaining('LOOSFHJGUPM'));await page.getByRole('button',{name:'Close details'}).click();
 await goPublic('Pit Crew');await expect.element(page.getByRole('heading',{name:'From machine to design'})).toBeVisible();await goPublic('Merch');await page.getByRole('button',{name:'Quick View E92 Coupe Line-Art Tee'}).click();await expect.element(page.getByRole('dialog').getByRole('region',{name:'Drop 01 release details'})).toBeVisible();
});

test('episode search combines with exact builds, announces counts and recovers from no matches',async()=>{
 root.render(<App/>);await goPublic('Videos');expect(document.title).toBe('Video Vault | DualBore Media');
 await page.getByRole('searchbox',{name:'Search videos'}).fill('clutch');await expect.element(page.getByRole('status').filter({hasText:'1 film / Episodes'})).toBeVisible();
 const card=host.querySelector('.channel-vault .film-card');expect(card.querySelectorAll('.video-duration')).toHaveLength(1);expect(card.querySelector('.card-copy .video-duration')).toBeNull();
 await page.getByRole('searchbox',{name:'Search videos'}).fill('SV1000S');await expect.element(page.getByText('2 films / Episodes',{exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Build',exact:true}).selectOptions('rd400');await expect.element(page.getByRole('heading',{name:'No matching videos.'})).toBeVisible();await page.getByRole('button',{name:'Clear search and build'}).click();await expect.element(page.getByText('4 films / Episodes',{exact:true})).toBeVisible();
});

test('player links a related SV1000S episode and its actual project without leaving the dialog',async()=>{
 history.replaceState(null,'','/#vault');root.render(<App/>);await page.getByRole('button',{name:/Play Getting the SV1000S clutch/}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'SV1000S common problems & POV ride',exact:true}).click();
 await expect.element(dialog.getByTitle('SV1000S common problems & POV ride')).toHaveAttribute('src',expect.stringContaining('XqX31p88MuA'));
 await dialog.getByRole('button',{name:'Explore the Suzuki SV1000S'}).click();await expect.element(dialog.getByRole('heading',{name:'Suzuki SV1000S',exact:true})).toBeVisible();
 await expect.element(dialog.getByText('2 curated episodes / Watch the project')).toBeVisible();
 await page.getByRole('button',{name:'Close details'}).click();
});

test('merch uses approved preview prices and a size plan without fake measurements or signup collection',async()=>{
 history.replaceState(null,'','/#merch');root.render(<App/>);await expect.element(page.getByText('$30',{exact:true})).toBeVisible();expect(await page.getByText('$50',{exact:true}).all()).toHaveLength(2);
 await page.getByRole('button',{name:'Release details for E92 Coupe Line-Art Tee'}).click();const dialog=page.getByRole('dialog');
 await expect.element(dialog.getByText('To be confirmed',{exact:true})).not.toBeInTheDocument();await expect.element(dialog.getByRole('table')).not.toBeInTheDocument();
 await expect.element(dialog.getByLabelText('Planned sizes, not available to order').getByText('2XL',{exact:true})).toBeVisible();
 await expect.element(dialog.getByText(/No orders or payments are being accepted/)).toBeVisible();
 await dialog.getByRole('button',{name:'Release updates for E92 Coupe Line-Art Tee'}).click();await expect.element(dialog.getByRole('link',{name:/Follow DualBore Media release announcements/})).toHaveAttribute('href','https://www.youtube.com/@DualBoreMedia');
 await expect.element(dialog.getByRole('textbox')).not.toBeInTheDocument();await expect.element(dialog.getByRole('button',{name:/buy|checkout/i})).not.toBeInTheDocument();
 await expect.element(dialog.getByText(/Orders and email signups are not open yet/)).toBeVisible();
 const links=host.querySelector('.release-update-actions');
 const [channelLink,privacyLink]=Array.from(links.querySelectorAll('a')).map(link=>link.getBoundingClientRect());
 expect(channelLink.height).toBeGreaterThanOrEqual(48);expect(privacyLink.height).toBeGreaterThanOrEqual(48);
 expect(privacyLink.top>=channelLink.bottom+12||privacyLink.left>=channelLink.right+16).toBe(true);
});

test('pointer-activated dialogs restore their actual opener when the browser does not focus clicked buttons',async()=>{
 history.replaceState(null,'','/#merch');root.render(<App/>);
 await expect.element(page.getByRole('button',{name:'Quick View E92 Coupe Line-Art Tee'})).toBeVisible();
 const panel=host.querySelector('[aria-label="Garage merch"]');
 for(const label of ['Quick View E92 Coupe Line-Art Tee','Release details for E92 Coupe Line-Art Tee','Release updates']){
  const trigger=Array.from(host.querySelectorAll('button')).find(button=>(button.getAttribute('aria-label')||button.textContent.trim())===label);
  panel.focus();trigger.click();
  await expect.element(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Close details'}).click();
  expect(document.activeElement).toBe(trigger);
 }
});

test('unavailable account access explains prelaunch state and can retry into normal hosted sign-in',async()=>{
 const request=vi.fn().mockRejectedValue(new TypeError('offline'));vi.stubGlobal('fetch',request);root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('region',{name:'Account availability'})).toBeVisible();await expect.element(page.getByRole('link',{name:'Secure sign in'})).not.toBeInTheDocument();
 request.mockImplementation(async()=>Response.json({signedIn:false},{status:401}));await page.getByRole('button',{name:'Check account access'}).click();await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in');
});

test('customer order progress identifies its current step without exposing internal order data',async()=>{
 const order={orderNumber:'DBM-PROGRESS',createdAt:'2026-10-20T00:00:00Z',status:'paid',fulfillmentStatus:'packing',items:[],totalCents:3000,taxCents:0,shippingCents:0,subtotalCents:3000,notes:['PRIVATE-STAFF-NOTE']};
 root.render(<OperationsApp auth={{isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-token',fetcher:async()=>Response.json({orders:[order]})}}/>);
 await page.getByRole('button',{name:/DBM-PROGRESS/}).click();const progress=page.getByRole('list',{name:'Order progress'});await expect.element(progress.getByText('Current step',{exact:true})).toBeVisible();
 expect(host.querySelector('.ops-progress [aria-current="step"]').textContent).toContain('Packing');await expect.element(page.getByText('PRIVATE-STAFF-NOTE')).not.toBeInTheDocument();
});

test('closed shop still presents the three original designs without a purchase button',async()=>{
 history.replaceState(null,'','/shop');vi.stubGlobal('fetch',vi.fn(withPublicCatalog(async()=>Response.json({enabled:false,variants:[]}))));root.render(<ProductionStore/>);
 await expect.element(page.getByRole('region',{name:'Drop 01 design previews'})).toBeVisible();expect(await page.getByRole('article').all()).toHaveLength(3);await expect.element(page.getByRole('button',{name:/cart|checkout|buy/i})).not.toBeInTheDocument();
});

test('unknown public route has a useful recovery page and policy navigation restores tab identity',async()=>{
 history.replaceState(null,'','/not-a-page');root.render(<App/>);await expect.element(page.getByRole('heading',{name:'Page not found.'})).toBeVisible();
 await page.getByRole('button',{name:'Explore Drop 01',exact:true}).click();expect(location.pathname).toBe('/shop');await expect.element(page.getByRole('main')).toHaveFocus();expect(document.title).toBe('Drop 01 Preview | DualBore Media');
});

for(const status of [500,503])test('account refresh '+status+' shows retry instead of a misleading sign-in action',async()=>{
 vi.stubGlobal('fetch',vi.fn(async url=>url==='/api/auth/session'?Response.json({signedIn:false},{status:401}):Response.json({error:'unavailable'},{status})));root.render(<WorkosOperations/>);
 await expect.element(page.getByRole('region',{name:'Account availability'})).toBeVisible();await expect.element(page.getByRole('button',{name:'Check account access'})).toBeVisible();await expect.element(page.getByRole('link',{name:'Secure sign in'})).not.toBeInTheDocument();
});

test('organized footer provides real visitor links and restores keyboard focus when exploring every view',async()=>{
 root.render(<App/>);const footer=page.getByRole('contentinfo');
 const explore=footer.getByRole('navigation',{name:'Explore the garage'});
 for(const [button,path] of [['Video Vault','/videos'],['Drop 01 Preview','/shop'],['Pit Crew','/pit-crew'],['Garage Builds','/garage']]){
  await explore.getByRole('button',{name:button,exact:true}).click();expect(location.pathname).toBe(path);await expect.poll(()=>document.activeElement.id).toBe('content');
 }
 const info=footer.getByRole('navigation',{name:'Customer information'});
 for(const [label,path]of [['Privacy','privacy'],['Shipping','shipping'],['Returns & Exchanges','returns'],['Terms & Conditions','terms'],['Contact & Support','contact']])await expect.element(info.getByRole('link',{name:label,exact:true})).toHaveAttribute('href','/'+path);
 const follow=footer.getByRole('navigation',{name:'Follow DualBore Media'});await expect.element(follow.getByRole('link',{name:/Read DualBore Media community updates/})).toHaveAttribute('href','https://www.youtube.com/@DualBoreMedia/community');await expect.element(footer.getByRole('textbox')).not.toBeInTheDocument();
});
