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
  expect(host.querySelectorAll('.mxb-card:not(.mxb-preview)')).toHaveLength(0);
  expect(host.querySelectorAll('button, a[href]')).not.toContainEqual(expect.objectContaining({textContent:'Buy'}));
  expect(host.querySelectorAll('a[href*="checkout"],a[download]')).toHaveLength(0);
});

test('track search and filters never convert a planned product into inventory',async()=>{
  root.render(<SetupShop/>);
  await page.getByRole('searchbox',{name:'Search'}).fill('forest');
  await expect.element(page.getByRole('heading',{name:'Forest'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'Assen'})).not.toBeInTheDocument();
  await page.getByRole('button',{name:'Clear filters'}).click();
  await expect.element(page.getByRole('heading',{name:'Assen'})).toBeVisible();
  await page.getByRole('combobox',{name:'Setup type'}).selectOptions('general-sx');
  await expect.element(page.getByRole('heading',{name:'General Supercross'})).toBeVisible();
  await expect.element(page.getByRole('heading',{name:'Forest'})).not.toBeInTheDocument();
  await expect.element(page.getByText('No verified setups listed yet.')).toBeVisible();
});
