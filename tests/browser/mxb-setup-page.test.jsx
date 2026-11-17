import {openPublicNavigation} from './public-navigation-fixture.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import SetupShop from '../../src/setups/SetupShop.jsx';
let host,root;
beforeEach(()=>{history.replaceState(null,'','/setups');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[]})));host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();history.replaceState(null,'','/');});
test('default bike-first destination has five accessible navigation entries and closed setup slots',async()=>{
 const push=vi.spyOn(history,'pushState');
 root.render(<SetupShop/>);await expect.element(page.getByRole('heading',{name:'Choose your bike',level:2})).toBeVisible();
 await openPublicNavigation();await expect.element(page.getByRole('link',{name:'Setups',exact:true})).toHaveAttribute('aria-current','page');
 await expect.element(page.getByRole('link',{name:'Pit Crew',exact:true})).toHaveAttribute('href','/pit-crew');
 await expect.element(page.getByText('53 motorcycles found')).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Browse by manufacturer'})).toBeVisible();
 expect(host.querySelector('.mxb-exact-bike select').options).toHaveLength(54);
 await page.getByRole('combobox',{name:'Manufacturer',exact:true}).selectOptions('Husqvarna');
 expect(push).toHaveBeenCalledTimes(0);
 await page.getByRole('searchbox',{name:'Search bikes',exact:true}).fill('TC125');
 await expect.element(page.getByText('1 motorcycle found')).toBeVisible();
 await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('husqvarna-tc-125-2023');
 await expect.element(page.getByRole('heading',{name:'General Motocross',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'General Supercross',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Assen',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Maryland',exact:true})).toBeVisible();
 expect(host.querySelectorAll('.mxb-library .mxb-card')).toHaveLength(4);
 const cardTitle=host.querySelector('.mxb-card h4');
 expect(getComputedStyle(cardTitle).marginTop).toBe('0px');
 expect(getComputedStyle(cardTitle).marginBottom).toBe('0px');
 expect(host.querySelectorAll('.mxb-library .mxb-bike-status')[1].textContent).toBe('Sample preview');
 expect(location.search).toContain('bike=husqvarna-tc-125-2023');
 expect(push).toHaveBeenCalledTimes(1);
 expect(host.querySelectorAll('a[download],a[href*="checkout"],input[type="email"]')).toHaveLength(0);
 await page.getByRole('button',{name:'Reset bike filters'}).click();await expect.element(page.getByRole('heading',{name:'Browse by manufacturer'})).toBeVisible();
 expect(push).toHaveBeenCalledTimes(2);await page.getByRole('button',{name:'Reset bike filters'}).click();expect(push).toHaveBeenCalledTimes(2);
});
test('recorded previews retain exact TC125 assignments and proposed pricing behind the secondary view',async()=>{
 root.render(<SetupShop/>);await page.getByRole('button',{name:'Setup previews',exact:true}).click();
 await expect.element(page.getByText('The first releases are on the way.')).toBeVisible();
 await expect.element(page.getByText('Compatibility not yet verified')).toBeVisible();
 for(const track of ['Assen','Maryland'])await expect.element(page.getByRole('heading',{name:`2023 Husqvarna TC 125 — ${track}`})).toBeVisible();
 await expect.element(page.getByText('Sample previews (3)')).toBeVisible();
 expect(host.querySelectorAll('.mxb-card:not(.mxb-preview)')).toHaveLength(0);
});
test('legacy track, type, OEM and shorthand filters never convert samples into available inventory',async()=>{
 root.render(<SetupShop/>);await page.getByRole('button',{name:'Setup previews',exact:true}).click();
 await page.getByRole('searchbox',{name:'Search',exact:true}).fill('forest');await expect.element(page.getByRole('heading',{name:'Forest'})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).not.toBeInTheDocument();
 await page.getByRole('button',{name:'Clear filters'}).click();await page.getByRole('combobox',{name:'Setup type',exact:true}).selectOptions('general-sx');
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Supercross'})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();await page.getByRole('combobox',{name:'OEM bike'}).selectOptions('mx2oem-2023-husqvarna-tc-125');await page.getByRole('combobox',{name:'Track',exact:true}).selectOptions('maryland');
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Maryland'})).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();for(const q of ['MX2OEM_2023_TC_125','TC125']){await page.getByRole('searchbox',{name:'Search',exact:true}).fill(q);await expect.element(page.getByText('Sample previews (3)')).toBeVisible();}
 await page.getByRole('searchbox',{name:'Search',exact:true}).fill('YZ250');await expect.element(page.getByText('No sample previews match.')).toBeVisible();
});
test('approved metadata is separate from sample records and failed catalog requests disclose unavailability',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[{id:'fixture',bikeId:'yamaha-yz-250-2023',name:'Approved MX preview',description:'Synthetic description',discipline:'MX',track:'',bikeVersion:'',gameVersion:'',stage:'Testing',priceCents:200}]})));
 root.render(<SetupShop/>);await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('yamaha-yz-250-2023');await expect.element(page.getByRole('heading',{name:'Approved MX preview'})).toBeVisible();await expect.element(page.getByText('In review')).toBeVisible();
 expect(host.querySelectorAll('a[download]')).toHaveLength(0);
 root.unmount();root=createRoot(host);vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('unavailable');}));root.render(<SetupShop/>);await expect.element(page.getByText(/Setup previews could not load/)).toBeVisible();await expect.element(page.getByRole('heading',{name:'Approved MX preview'})).not.toBeInTheDocument();
 const recovered=vi.fn(async()=>Response.json({setupPreviews:[]}));vi.stubGlobal('fetch',recovered);await page.getByRole('button',{name:'Retry setup previews'}).click();await expect.element(page.getByText(/Setup previews could not load/)).not.toBeInTheDocument();expect(recovered).toHaveBeenCalledTimes(1);await expect.element(page.getByRole('heading',{name:'General Motocross',exact:true})).toBeVisible();
});

test('manufacturer and motorcycle cards follow the exact roster without claiming sample compatibility',async()=>{
 root.render(<SetupShop/>);await page.getByRole('button',{name:'Yamaha 4 models',exact:true}).click();
 await expect.element(page.getByRole('heading',{name:'Yamaha motorcycles'})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Yamaha motorcycles'})).toHaveFocus();
 expect(host.querySelectorAll('.mxb-bike-choice')).toHaveLength(4);
 await page.getByRole('button',{name:'View 2023 Yamaha YZ 250 setups'}).click();
 await expect.element(page.getByRole('heading',{name:'2023 Yamaha YZ 250',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'2023 Yamaha YZ 250',exact:true})).toHaveFocus();
 await expect.element(page.getByText('Track setups coming soon.')).toBeVisible();
 await expect.element(page.getByText(/Sample previews are not compatibility verified/)).toBeVisible();
 await page.getByRole('button',{name:'Change motorcycle'}).click();
 await expect.element(page.getByRole('heading',{name:'Yamaha motorcycles'})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Yamaha motorcycles'})).toHaveFocus();
 await page.getByRole('button',{name:'View 2023 Yamaha YZ 250 setups'}).click();
 await page.getByRole('searchbox',{name:'Search bikes',exact:true}).fill('YZF');
 await expect.element(page.getByRole('heading',{name:'2023 Yamaha YZ 250',exact:true})).not.toBeInTheDocument();
 expect(host.querySelectorAll('.mxb-bike-choice')).toHaveLength(2);
 expect(location.search).not.toContain('bike=');
 expect(host.textContent).not.toMatch(/53 placeholders|reference placeholders|BUILD IN PROGRESS|Private delivery|testing pending|Publication blocked/i);
 expect(host.querySelectorAll('a[download],a[href*="checkout"],input[type="email"]')).toHaveLength(0);
});

test('a pending preview request remains recoverable and an aborted response cannot overwrite the retry',async()=>{
 const requests=[];
 vi.stubGlobal('fetch',vi.fn((url,options)=>new Promise(resolve=>requests.push({resolve,signal:options.signal}))));
 root.render(<SetupShop/>);
 await expect.element(page.getByText('Loading setup previews...')).toBeVisible();
 await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('yamaha-yz-250-2023');
 await expect.element(page.getByText('Track setups coming soon.')).not.toBeInTheDocument();
 await page.getByRole('button',{name:'Retry setup previews'}).click();
 await vi.waitFor(()=>expect(requests).toHaveLength(2));
 expect(requests[0].signal.aborted).toBe(true);
 await expect.element(page.getByText('Loading setup previews...')).toBeVisible();
 const preview={id:'fixture',bikeId:'yamaha-yz-250-2023',description:'Approved description',discipline:'MX',track:'',bikeVersion:'',gameVersion:'',stage:'Testing',priceCents:200};
 requests[1].resolve(Response.json({setupPreviews:[{...preview,name:'Fresh preview'}]}));
 await expect.element(page.getByRole('heading',{name:'Fresh preview'})).toBeVisible();
 requests[0].resolve(Response.json({setupPreviews:[{...preview,name:'Outdated preview'}]}));
 await vi.waitFor(()=>expect(host.textContent).not.toContain('Loading setup previews...'));
 await expect.element(page.getByRole('heading',{name:'Outdated preview'})).not.toBeInTheDocument();
 await expect.element(page.getByRole('heading',{name:'Fresh preview'})).toBeVisible();
});

test('invalid preview responses fail closed and retry can recover without losing the selected bike',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[{bikeId:'unknown',name:'Invalid public setup'}]})));
 root.render(<SetupShop/>);
 await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('husqvarna-tc-125-2023');
 await expect.element(page.getByText(/Setup previews could not load/)).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Invalid public setup'})).not.toBeInTheDocument();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[]})));
 await page.getByRole('button',{name:'Retry setup previews'}).click();
 await expect.element(page.getByText(/Setup previews could not load/)).not.toBeInTheDocument();
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Assen',exact:true})).toBeVisible();
});

test('approved track preview shows exact supplied compatibility and price without exposing delivery',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[{id:'track-fixture',bikeId:'yamaha-yz-250-2023',name:'Forest preview',description:'Approved track description',discipline:'track',track:'Forest',bikeVersion:'Synthetic pack',gameVersion:'Synthetic game',stage:'Verified',priceCents:150}]})));
 root.render(<SetupShop/>);await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('yamaha-yz-250-2023');
 await expect.element(page.getByRole('heading',{name:'Forest preview'})).toBeVisible();
 await expect.element(page.getByText('OEM pack: Synthetic pack')).toBeVisible();
 await expect.element(page.getByText('MX Bikes: Synthetic game')).toBeVisible();
 await expect.element(page.getByText('$1.50')).toBeVisible();
 await expect.element(page.getByText('Verified preview')).toBeVisible();
 expect(host.querySelectorAll('a[download],a[href$=".stp"],a[href*="checkout"],input[type="email"]')).toHaveLength(0);
});
