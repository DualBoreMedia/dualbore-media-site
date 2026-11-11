import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page,userEvent} from 'vitest/browser';
import {App} from '../../src/App.jsx';
import {PublicDetail} from '../../src/PublicDetail.jsx';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import {PrimaryNavigation} from '../../src/PrimaryNavigation.jsx';
import {withPublicCatalog} from './catalog-fixture.js';
import '../../src/styles.css';
import '../../src/product-polish.css';
import '../../src/ui-polish.css';

let root,host;
const labels=['01 Garage Builds','02 Video Vault','03 Garage Merch','04 MX Bikes Setups','05 About / Pit Crew'];
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.stubEnv('VITE_AUTH_ACCESS_MODE','staff-only');vi.stubGlobal('fetch',vi.fn(withPublicCatalog(async()=>Response.json({enabled:false,variants:[],items:[]}))));});
afterEach(()=>{root.unmount();host.remove();vi.unstubAllEnvs();vi.unstubAllGlobals();history.replaceState(null,'','/');});

for(const [path,Component] of [['/privacy',App],['/builds/n54/',PublicDetail],['/videos/c7gF1jjT9YQ/',PublicDetail],['/shop',ProductionStore]]){
 test('all five destinations remain accessible from '+path,async()=>{
  history.replaceState(null,'',path);root.render(<Component/>);
  for(const name of labels)await expect.element(page.getByRole('tab',{name,exact:true})).toBeVisible();
  await expect.element(page.getByRole('tab',{name:'04 MX Bikes Setups'})).toHaveAttribute('href','/setups');
  expect(host.querySelector('.workspace-nav [tabindex="0"]')).toBeTruthy();
  for(const control of host.querySelectorAll('[aria-controls]'))expect(document.getElementById(control.getAttribute('aria-controls'))).toBeTruthy();
 });
}
test('a page without an active destination has a keyboard entry point and arrow navigation',async()=>{
 root.render(<PrimaryNavigation/>);
 await expect.element(page.getByRole('tab',{name:labels[0]})).toBeVisible();
 host.querySelector('[tabindex="0"]').focus();
 await userEvent.keyboard('{ArrowRight}');
 await expect.element(page.getByRole('tab',{name:labels[1]})).toHaveFocus();
 await userEvent.keyboard('{End}');
 await expect.element(page.getByRole('tab',{name:labels[4]})).toHaveFocus();
});
