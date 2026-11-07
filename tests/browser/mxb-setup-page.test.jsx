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
 await expect.element(page.getByRole('tab',{name:'04 MX Bikes Setups'})).toHaveAttribute('aria-selected','true');
 await expect.element(page.getByRole('tab',{name:'05 About / Pit Crew'})).toHaveAttribute('href','/#crew');
 await expect.element(page.getByText('53 matching reference bikes')).toBeVisible();
 await page.getByRole('combobox',{name:'Manufacturer',exact:true}).selectOptions('Husqvarna');
 expect(push).toHaveBeenCalledTimes(0);
 await page.getByRole('searchbox',{name:'Search bikes',exact:true}).fill('TC125');
 await expect.element(page.getByText('1 matching reference bikes')).toBeVisible();
 await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('husqvarna-tc-125-2023');
 await expect.element(page.getByRole('heading',{name:'General Motocross',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'General Supercross',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Assen',exact:true})).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'Maryland',exact:true})).toBeVisible();
 expect(host.querySelectorAll('.mxb-library .mxb-card')).toHaveLength(4);
 expect(host.querySelectorAll('.mxb-library .mxb-bike-status')[1].textContent).toContain('File received');
 expect(location.search).toContain('bike=husqvarna-tc-125-2023');
 expect(push).toHaveBeenCalledTimes(1);
 expect(host.querySelectorAll('a[download],a[href*="checkout"],input[type="email"]')).toHaveLength(0);
 await page.getByRole('button',{name:'Reset bike filters'}).click();await expect.element(page.getByText('Your bike comes first.')).toBeVisible();
 expect(push).toHaveBeenCalledTimes(2);await page.getByRole('button',{name:'Reset bike filters'}).click();expect(push).toHaveBeenCalledTimes(2);
});
test('recorded previews retain exact TC125 assignments and proposed pricing behind the secondary view',async()=>{
 root.render(<SetupShop/>);await page.getByRole('button',{name:'Setup previews',exact:true}).click();
 await expect.element(page.getByText('No verified setups listed yet.')).toBeVisible();
 await expect.element(page.getByText('Examples, not purchasable products')).toBeVisible();
 for(const track of ['Assen','Maryland'])await expect.element(page.getByRole('heading',{name:`2023 Husqvarna TC 125 — ${track}`})).toBeVisible();
 await expect.element(page.getByText('Files received (3)')).toBeVisible();
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
 await page.getByRole('button',{name:'Clear filters'}).click();for(const q of ['MX2OEM_2023_TC_125','TC125']){await page.getByRole('searchbox',{name:'Search',exact:true}).fill(q);await expect.element(page.getByText('Files received (3)')).toBeVisible();}
 await page.getByRole('searchbox',{name:'Search',exact:true}).fill('YZ250');await expect.element(page.getByText('No received setup files match these filters.')).toBeVisible();
});
test('approved metadata is separate from sample records and failed catalog requests disclose unavailability',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({setupPreviews:[{id:'fixture',bikeId:'yamaha-yz-250-2023',name:'Approved MX preview',description:'Synthetic description',discipline:'MX',track:'',bikeVersion:'',gameVersion:'',stage:'Testing',priceCents:200}]})));
 root.render(<SetupShop/>);await page.getByRole('combobox',{name:'Exact bike',exact:true}).selectOptions('yamaha-yz-250-2023');await expect.element(page.getByRole('heading',{name:'Approved MX preview'})).toBeVisible();await expect.element(page.getByText('Testing / Not for sale')).toBeVisible();
 expect(host.querySelectorAll('a[download]')).toHaveLength(0);
 root.unmount();root=createRoot(host);vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('unavailable');}));root.render(<SetupShop/>);await expect.element(page.getByText(/Managed previews are temporarily unavailable/)).toBeVisible();await expect.element(page.getByRole('heading',{name:'Approved MX preview'})).not.toBeInTheDocument();
});
