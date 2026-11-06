import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test} from 'vitest';
import {page} from 'vitest/browser';
import SetupShop from '../../src/setups/SetupShop.jsx';

let host, root;
beforeEach(()=>{
  history.replaceState(null,'','/setups');
  host=document.createElement('div');
  document.body.append(host);
  root=createRoot(host);
});
afterEach(()=>{
  root.unmount();host.remove();
  history.replaceState(null,'','/');
});

test('setup shop renders proposed pricing but no purchase or download action',async()=>{
  root.render(<SetupShop/>);
  await expect.element(page.getByRole('heading',{name:'Setup finder'})).toBeVisible();
  await expect.element(page.getByText('No verified setups listed yet.')).toBeVisible();
  await expect.element(page.getByText('Examples, not purchasable products')).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'MXB Club'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'Forest'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Maryland'})).toBeVisible();
  await expect.element(page.getByText('Files received (3)')).toBeVisible();
  expect(host.querySelectorAll('.mxb-card:not(.mxb-preview)')).toHaveLength(0);
  expect(host.querySelectorAll('button, a[href]')).not.toContainEqual(expect.objectContaining({textContent:'Buy'}));
  expect(host.querySelectorAll('a[href*="checkout"],a[download]')).toHaveLength(0);
});

test('track search and filters never convert a planned product into inventory',async()=>{
  root.render(<SetupShop/>);
  await page.getByRole('searchbox',{name:'Search'}).fill('forest');
  await expect.element(page.getByRole('heading',{name:'Forest'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).not.toBeInTheDocument();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).toBeVisible();
  await page.getByRole('combobox',{name:'Setup type'}).selectOptions('general-sx');
  await expect.element(page.getByRole('heading',{name:'General Supercross'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Supercross'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'Forest'})).not.toBeInTheDocument();
  await expect.element(page.getByText('No verified setups listed yet.')).toBeVisible();
});


test('received TC125 previews can be filtered to the bike without exposing a download', async () => {
  root.render(<SetupShop/>);
  await page.getByRole('combobox',{name:'OEM bike'}).selectOptions('mx2oem-2023-husqvarna-tc-125');
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Supercross'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Maryland'})).toBeVisible();
  await page.getByRole('combobox',{name:'Track'}).selectOptions('maryland');
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Maryland'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).not.toBeInTheDocument();
  await expect.element(page.getByText('No verified setups listed yet.')).toBeVisible();
  expect(host.querySelectorAll('a[download],a[href*="checkout"]')).toHaveLength(0);
});

test('compact OEM bike search filters the received file previews',async()=>{
 root.render(<SetupShop/>);
 await page.getByRole('searchbox',{name:'Search'}).fill('MX2OEM_2023_TC_125');
 await expect.element(page.getByText('Files received (3)')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search'}).fill('TC125');
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125 — Assen'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search'}).fill('YZ250');
 await expect.element(page.getByText('No received setup files match these filters.')).toBeVisible();
});

test('bike library exposes all reference placeholders with working filters but no delivery or selling controls',async()=>{
 root.render(<SetupShop/>);
 await page.getByRole('button',{name:/Bike library 53 placeholders/}).click();
 await expect.element(page.getByText('53 of 53 bike placeholders')).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'2025 Triumph TF 450-RC',exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search bikes',exact:true}).fill('TC125');
 await expect.element(page.getByText('1 of 53 bike placeholders')).toBeVisible();
 await expect.element(page.getByRole('heading',{name:'2023 Husqvarna TC 125',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Model family',exact:true}).selectOptions('TC');
 await page.getByText('Track setups',{exact:true}).click();
 const trackToggle=host.querySelector('.mxb-bike-tracks summary');
 expect(trackToggle.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
 trackToggle.focus();
 expect(document.activeElement).toBe(trackToggle);
 expect(trackToggle.parentElement.textContent).toContain('No verified setup');
 expect(trackToggle.parentElement.textContent).not.toContain('Coming soon');
 await expect.element(page.getByRole('region',{name:'Bike library',exact:true}).getByText('Assen',{exact:true})).toBeVisible();
 await expect.element(page.getByText('Sample received · testing pending').first()).toBeVisible();
 await page.getByRole('combobox',{name:'Manufacturer',exact:true}).selectOptions('Honda');
 await expect.element(page.getByText('No bikes match these filters.')).toBeVisible();
 await page.getByRole('button',{name:'Reset bike filters',exact:true}).click();
 await expect.element(page.getByText('53 of 53 bike placeholders')).toBeVisible();
 expect(host.querySelectorAll('a[download],a[href*="checkout"],input[type="email"]')).toHaveLength(0);
 await page.getByRole('link',{name:'Explore the setup finder',exact:true}).click();
 await expect.element(page.getByRole('heading',{name:'Setup finder',exact:true})).toBeVisible();
});
