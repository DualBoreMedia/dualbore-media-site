import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page,userEvent} from 'vitest/browser';
import {CatalogManager} from '../../src/operations/CatalogManager.jsx';
import OperationsApp from '../../src/operations/OperationsApp.jsx';
import {Products} from '../../src/operations/Products.jsx';
import '../../src/styles.css';
import '../../src/operations/operations.css';

// Browser regressions for lost draft edits. These tests use fixture data;
// they do not authenticate an owner or write to live production.
let host,root;
beforeEach(()=>{
 host=document.createElement('div');
 document.body.append(host);
 root=createRoot(host);
 history.replaceState(null,'','/admin');
});
afterEach(()=>{
 root.unmount();
 host.remove();
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
 history.replaceState(null,'','/');
});
const fixtureAuth={
 isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic',
 fetcher:async()=>Response.json({products:[],orders:[],pagination:{page:1,total:0,pageSize:25},
  overview:{},failures:[],audit:[],supportTickets:[],variants:[],profile:{}}),
 signOut:()=>{}
};

test('switching from merchandise to MX Bikes asks before discarding unsaved artwork edits',async()=>{
 root.render(<CatalogManager products={[]} auth={fixtureAuth} reload={async()=>{}}/>);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name',{exact:true}).fill('Unsaved artwork');
 await expect.element(page.getByRole('status',{name:'Product editing status'})).toHaveTextContent('Unsaved changes');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await page.getByLabelText('Product type filter').selectOptions('mx_setup');
 await expect.element(page.getByLabelText('Product name',{exact:true})).toHaveValue('Unsaved artwork');
 await expect.element(page.getByLabelText('Product type filter')).toHaveValue('physical');
 expect(confirm).toHaveBeenCalledTimes(1);
 confirm.mockReturnValue(true);
 await page.getByLabelText('Product type filter').selectOptions('mx_setup');
 await expect.element(page.getByRole('heading',{name:'MX Bikes',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Create setup draft'}).click();
 await page.getByLabelText('Setup name').fill('Unfinished private setup');
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Unsaved changes');
 confirm.mockReturnValue(false);
 await page.getByLabelText('Product type filter').selectOptions('physical');
 await expect.element(page.getByLabelText('Setup name')).toHaveValue('Unfinished private setup');
 await expect.element(page.getByLabelText('Product type filter')).toHaveValue('mx_setup');
});

test('dirty private editor registers a browser-leave guard; clean editor does not',async()=>{
 // Synthetic beforeunload dispatch is inconsistent in Playwright's browser
 // runner. Verify the actual listener is attached and protects a cancelable
 // unload event, without opening native browser navigation dialogs in CI.
 const listeners=vi.spyOn(window,'addEventListener');
 root.render(<CatalogManager products={[]} auth={fixtureAuth} reload={async()=>{}}/>);
 const clean=new Event('beforeunload',{cancelable:true});
 window.dispatchEvent(clean);
 expect(clean.defaultPrevented).toBe(false);
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name',{exact:true}).fill('Draft not yet saved');
 await expect.element(page.getByRole('status',{name:'Product editing status'})).toHaveTextContent('Unsaved changes');
 await expect.poll(()=>listeners.mock.calls.filter(args=>args[0]==='beforeunload').length).toBeGreaterThan(0);
 const handle=[...listeners.mock.calls].reverse().find(args=>args[0]==='beforeunload')[1];
 const event={preventDefault:vi.fn(),returnValue:null};
 handle(event);
 expect(event.preventDefault).toHaveBeenCalledOnce();
 expect(event.returnValue).toBe('');
});

test('Admin rail and sign out keep a dirty catalog draft until user confirms',async()=>{
 const signOut=vi.fn();
 root.render(<OperationsApp admin auth={{...fixtureAuth,signOut}}/>);
 await page.getByRole('button',{name:'Catalog',exact:true}).click();
 await page.getByRole('button',{name:'Create Product',exact:true}).click();
 await page.getByLabelText('Product name',{exact:true}).fill('Owner draft, not published');
 await expect.element(page.getByRole('status',{name:'Product editing status'})).toHaveTextContent('Unsaved changes');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 await expect.element(page.getByLabelText('Product name',{exact:true})).toHaveValue('Owner draft, not published');
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 expect(signOut).not.toHaveBeenCalled();
 expect(confirm).toHaveBeenCalledTimes(2);
 confirm.mockReturnValue(true);
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 await expect.element(page.getByRole('heading',{name:'Orders',exact:true})).toBeVisible();
});

test('invalid setup file is rejected in the browser without sending request',async()=>{
 const row={id:'qa-setup',status:'draft',version:0,draft:{type:'mx_setup',name:'Private test setup',compatibility:'unverified'}};
 const fetcher=vi.fn(async()=>Response.json({saved:true}));
 root.render(<Products products={[row]} auth={{getToken:async()=> 'synthetic',fetcher}} reload={async()=>{}}/>);
 await page.getByRole('button',{name:/Private test setup/}).click();
 const input=page.getByLabelText('Choose .stp file');
 await userEvent.upload(input,new File([new Uint8Array(47)],'too-small.stp'));
 await expect.element(page.getByRole('alert')).toHaveTextContent('Choose a supported .stp file, no larger than 2 MB');
 await expect.element(page.getByRole('button',{name:'Save private file',exact:true})).toBeDisabled();
 expect(fetcher).not.toHaveBeenCalled();
 await userEvent.upload(input,new File([new Uint8Array(48)],'valid-name.stp'));
 await expect.element(page.getByRole('button',{name:'Save private file',exact:true})).toBeEnabled();
});
