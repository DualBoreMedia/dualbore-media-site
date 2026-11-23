import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import {Products} from '../../src/operations/Products.jsx';
import {CatalogManager} from '../../src/operations/CatalogManager.jsx';
import {MxBikes} from '../../src/operations/MxBikes.jsx';
import {readTextRecovery} from '../../src/operations/draft-recovery.js';
import '../../src/styles.css';
import '../../src/operations/operations.css';
let host,root;
const owner='user_syntheticOwner';
const auth={user:{id:owner},getToken:async()=> 'test',fetcher:async()=>Response.json({saved:true})};
beforeEach(()=>{sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();sessionStorage.clear();vi.restoreAllMocks();});
const remount=element=>{root.unmount();host.replaceChildren();root=createRoot(host);root.render(element);};

test('unsaved merch name/description survives a simulated crash and is restored explicitly',async()=>{
 root.render(<Products products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name').fill('Unpublished artwork name');
 await page.getByLabelText('Description',{exact:true}).fill('Owner notes only. No file bytes or passwords.');
 await expect.poll(()=>readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})?.name).toBe('Unpublished artwork name');
 remount(<Products products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await expect.element(page.getByRole('complementary',{name:'Local draft recovery'})).toBeVisible();
 await expect.element(page.getByLabelText('Product name')).toHaveValue('');
 await page.getByRole('button',{name:'Restore unsaved text'}).click();
 await expect.element(page.getByLabelText('Product name')).toHaveValue('Unpublished artwork name');
 await expect.element(page.getByLabelText('Description',{exact:true})).toHaveValue('Owner notes only. No file bytes or passwords.');
 await expect.element(page.getByRole('status',{name:'Product editing status'})).toHaveTextContent('Unsaved changes');
});
test('discarding recovered merch text clears it without changing the saved draft',async()=>{
 root.render(<Products products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name').fill('Do not restore');
 await expect.poll(()=>readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})?.name).toBe('Do not restore');
 remount(<Products products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByRole('button',{name:'Discard local text'}).click();
 await expect.element(page.getByLabelText('Product name')).toHaveValue('');
 expect(readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})).toBeNull();
});
test('MX Bikes draft recovery restores text only; private .stp payload is never saved to sessionStorage',async()=>{
 root.render(<MxBikes products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create setup draft'}).click();
 await page.getByLabelText('Setup name').fill('TC125 private practice setup');
 await page.getByLabelText('Description',{exact:true}).fill('MX test metadata');
 await expect.poll(()=>readTextRecovery({ownerId:owner,editor:'mx_setup',productId:'new'})?.name).toBe('TC125 private practice setup');
 const keys=Object.keys(sessionStorage);
 expect(keys.every(k=>!k.includes('file'))).toBe(true);
 remount(<MxBikes products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create setup draft'}).click();
 await page.getByRole('button',{name:'Restore unsaved text'}).click();
 await expect.element(page.getByLabelText('Setup name')).toHaveValue('TC125 private practice setup');
 await expect.element(page.getByLabelText('Description',{exact:true})).toHaveValue('MX test metadata');
});
test('draft recovery is scoped to the authenticated owner, never another browser login',async()=>{
 root.render(<Products products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name').fill('First owner notes');
 await expect.poll(()=>readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})?.name).toBe('First owner notes');
 remount(<Products products={[]} auth={{...auth,user:{id:'user_other'}}} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await expect.element(page.getByRole('complementary',{name:'Local draft recovery'})).not.toBeInTheDocument();
});


test('a confirmed catalog type switch discards recovery for just the abandoned unsaved record',async()=>{
 root.render(<CatalogManager products={[]} auth={auth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name').fill('Discard with confirmation');
 await expect.poll(()=>readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})?.name).toBe('Discard with confirmation');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await page.getByLabelText('Product type filter').selectOptions('mx_setup');
 expect(readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})?.name).toBe('Discard with confirmation');
 confirm.mockReturnValue(true);
 await page.getByLabelText('Product type filter').selectOptions('mx_setup');
 await expect.element(page.getByRole('heading',{name:'MX Bikes',exact:true})).toBeVisible();
 expect(readTextRecovery({ownerId:owner,editor:'merch',productId:'new'})).toBeNull();
});
