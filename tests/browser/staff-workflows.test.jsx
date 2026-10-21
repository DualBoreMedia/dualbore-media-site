import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import StaffApp from '../../src/operations/StaffApp.jsx';
import '../../src/styles.css';

let root,host;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();});
function fixture(){
 const order={orderNumber:'DBM-STAFF-QA',createdAt:'2026-10-18T00:00:00Z',fulfillmentStatus:'received',version:3,
  shippingName:'Synthetic Recipient',shippingAddress:{line1:'1 Synthetic Way',city:'Test',state:'OH',postal_code:'43013'},
  items:[{variantId:'e92-tee-m',name:'E92 Tee',size:'M',quantity:2}],shipments:[]};
 const data={role:'admin',orders:[order],pagination:{total:51,pageSize:25}};
 const staff={members:[{userId:'user_synthetic',name:'Synthetic Employee',email:'synthetic@example.invalid',role:'employee',status:'active',mfaEnrolled:true}],invitations:[{invitationId:'invite_synthetic',email:'pending@example.invalid',status:'pending'}],unresolved:[{requestKey:'uncertain_synthetic',action:'staff-role',target:'user_synthetic',role:'employee'}]};
 const posts=[];
 const fetcher=vi.fn(async(url,options)=>{
  if(options.method==='POST'){
   const payload=JSON.parse(options.body);posts.push(payload);
   if(payload.action==='packing-slip')return json({packingSlip:{orderNumber:order.orderNumber,orderDate:order.createdAt,packageNumber:payload.shipmentId?1:undefined,shipTo:{name:order.shippingName,address:order.shippingAddress},items:order.items}});
   return json({ok:true});
  }
  return json(new URL(url,'http://local').searchParams.has('staffManagement')?staff:data);
 });
 const auth={isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-staff-token',fetcher,signOut:vi.fn()};
 return {auth,order,data,staff,posts,fetcher};
}
const posted=(f,action)=>f.posts.findLast(p=>p.action===action);

test('staff searches, paginates and filters the queue before opening and closing an order',async()=>{
 const f=fixture();root.render(<StaffApp auth={f.auth}/>);
 await expect.element(page.getByRole('heading',{name:'Fulfillment workspace'})).toBeVisible();
 await page.getByLabelText('Order search').fill('DBM-STAFF');await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect.poll(()=>f.fetcher.mock.calls.at(-1)[0]).toContain('search=DBM-STAFF');
 await page.getByRole('combobox').selectOptions('packing');
 await expect.poll(()=>f.fetcher.mock.calls.at(-1)[0]).toContain('fulfillmentStatus=packing');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect.element(page.getByText('Page 2',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Previous',exact:true}).click();
 await page.getByRole('button',{name:'Shipments',exact:true}).click();
 await expect.poll(()=>f.fetcher.mock.calls.at(-1)[0]).toContain('shipmentStatus=packed');
 await page.getByRole('button',{name:'Fulfillment queue'}).click();
 const opener=page.getByRole('button',{name:/DBM-STAFF-QA/});await opener.click();
 await expect.element(page.getByRole('heading',{name:f.order.orderNumber})).toHaveFocus();
 await page.getByRole('button',{name:'Close order'}).click();await expect.element(opener).toHaveFocus();
 await page.getByRole('button',{name:'Sign out'}).click();expect(f.auth.signOut).toHaveBeenCalledOnce();
});

test('staff whole-order and package packing previews print and return to the order',async()=>{
 const f=fixture();f.order.shipments=[{shipmentId:'shipment_synthetic',packageNumber:1,status:'delivered',items:[{variantId:'e92-tee-m',quantity:2}]}];
 const print=vi.spyOn(window,'print').mockImplementation(()=>{});root.render(<StaffApp auth={f.auth}/>);
 await page.getByRole('button',{name:/DBM-STAFF-QA/}).click();
 await page.getByRole('button',{name:'Preview whole-order packing slip'}).click();
 await expect.element(page.getByRole('dialog').getByText('Synthetic Recipient')).toBeVisible();
 await page.getByRole('button',{name:'Print packing slip'}).click();expect(print).toHaveBeenCalledOnce();
 await page.getByRole('button',{name:'Back to order'}).click();
 await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
 await page.getByRole('button',{name:'Preview package 1 slip'}).click();
 await expect.element(page.getByRole('dialog').getByRole('heading',{name:'DBM-STAFF-QA / Package 1'})).toBeVisible();
 expect(posted(f,'packing-slip')).toEqual({action:'packing-slip',orderNumber:f.order.orderNumber,shipmentId:'shipment_synthetic'});
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

test('staff fulfillment uses versioned transitions and clears privileged data on a revoked-access response',async()=>{
 const f=fixture();vi.spyOn(window,'confirm').mockReturnValue(true);root.render(<StaffApp auth={f.auth}/>);
 await page.getByRole('button',{name:/DBM-STAFF-QA/}).click();
 await page.getByLabelText('Next status').selectOptions('making');await page.getByRole('button',{name:'Update status'}).click();
 await expect.poll(()=>posted(f,'transition')).toEqual({action:'transition',orderNumber:f.order.orderNumber,status:'making',expectedVersion:3});
 await expect.element(page.getByRole('status').getByText('Order status updated.')).toBeVisible();
 f.fetcher.mockImplementation(async()=>json({code:'forbidden'},403));
 await page.getByRole('button',{name:'Preview whole-order packing slip'}).click();
 await expect.element(page.getByRole('heading',{name:'Page unavailable'})).toBeVisible();
 await expect.element(page.getByText('Synthetic Recipient')).not.toBeInTheDocument();
 await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
});

test('staff tracking validates URLs, saves package quantities and records shipment state changes',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 const f=fixture();f.order.shipments=[{shipmentId:'shipment_synthetic',status:'draft',version:2,carrier:'USPS',service:'Ground',trackingNumber:'SYNTHETIC',trackingUrl:'https://example.invalid/track',items:[{variantId:'e92-tee-m',quantity:1}]}];
 root.render(<StaffApp auth={f.auth}/>);await page.getByRole('button',{name:/DBM-STAFF-QA/}).click();
 await page.getByText('Edit carrier / tracking',{exact:true}).click();
 await page.getByLabelText('trackingUrl',{exact:true}).fill('http://example.invalid/unsafe');
 await page.getByRole('button',{name:'Save tracking'}).click();expect(posted(f,'shipment-update')).toBeUndefined();
 await page.getByLabelText('trackingUrl',{exact:true}).fill('https://example.invalid/new-track');
 await page.getByLabelText('E92 Tee (M)',{exact:true}).last().fill('2');
 await page.getByRole('button',{name:'Save tracking'}).click();
 await expect.poll(()=>posted(f,'shipment-update')?.items).toEqual([{variantId:'e92-tee-m',quantity:2}]);
 await page.getByRole('button',{name:'Mark packed'}).click();
 await expect.poll(()=>posted(f,'shipment-status')?.status).toBe('packed');
 f.order.shipments[0].status='packed';await page.getByRole('button',{name:'Fulfillment queue'}).click();await page.getByRole('button',{name:/DBM-STAFF-QA/}).click();
 await page.getByRole('button',{name:'Mark shipped'}).click();await expect.poll(()=>posted(f,'shipment-status')?.status).toBe('shipped');
 f.order.shipments[0].status='shipped';await page.getByRole('button',{name:'Fulfillment queue'}).click();await page.getByRole('button',{name:/DBM-STAFF-QA/}).click();
 confirm.mockReturnValue(false);const before=f.posts.length;
 await page.getByRole('button',{name:'Record delivery'}).click();expect(f.posts).toHaveLength(before);
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Record delivery'}).click();
 await expect.poll(()=>posted(f,'shipment-status')).toMatchObject({status:'delivered',confirmed:true,expectedVersion:2});
});

test('staff management confirms invitations, role changes, revocations and provider reconciliation',async()=>{
 const f=fixture();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);root.render(<StaffApp auth={f.auth}/>);
 await page.getByRole('button',{name:'Employees',exact:true}).click();
 await expect.element(page.getByText('Synthetic Employee',{exact:true})).toBeVisible();
 await page.getByLabelText('Invitation email').fill('new@example.invalid');await page.getByRole('button',{name:'Invite employee'}).click();expect(f.posts).toHaveLength(0);
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Invite employee'}).click();
 await expect.poll(()=>posted(f,'staff-invite')).toMatchObject({email:'new@example.invalid',confirmed:true,requestKey:expect.any(String)});
 await page.getByLabelText('Find an existing account').fill('synthetic');
 await expect.poll(()=>f.fetcher.mock.calls.at(-1)[0]).toContain('search=synthetic');
 await page.getByRole('button',{name:'Set admin'}).click();
 await expect.poll(()=>posted(f,'staff-role')).toMatchObject({targetUserId:'user_synthetic',role:'admin',expectedRole:'employee',confirmed:true});
 await page.getByRole('button',{name:'Revoke staff access'}).click();
 await expect.poll(()=>posted(f,'staff-role')?.role).toBe('customer');
 await page.getByRole('button',{name:'Revoke invitation'}).click();
 await expect.poll(()=>posted(f,'staff-revoke-invitation')?.invitationId).toBe('invite_synthetic');
 await page.getByLabelText('Provider review notes').fill('Reviewed synthetic provider and revoked sessions.');
 await page.getByRole('button',{name:'Verify provider outcome'}).click();
 await expect.poll(()=>posted(f,'staff-reconcile')).toMatchObject({targetRequestKey:'uncertain_synthetic',note:'Reviewed synthetic provider and revoked sessions.'});
});

test('staff mutation network ambiguity retains the idempotency key while enrollment failures reset it',async()=>{
 const f=fixture();vi.spyOn(window,'confirm').mockReturnValue(true);const original=f.fetcher.getMockImplementation();
 let fail='network';f.fetcher.mockImplementation(async(url,options)=>{
  if(options.method==='POST'){f.posts.push(JSON.parse(options.body));if(fail==='network')throw new TypeError('offline');if(fail==='enrollment')return json({code:'staff_enrollment_required'},409);}
  return original(url,options);
 });
 root.render(<StaffApp auth={f.auth}/>);await page.getByRole('button',{name:'Employees',exact:true}).click();
 await page.getByRole('button',{name:'Set admin'}).click();await expect.element(page.getByRole('alert')).toHaveTextContent('temporarily unavailable');
 const first=posted(f,'staff-role').requestKey;
 await page.getByRole('button',{name:'Set admin'}).click();await expect.poll(()=>f.posts.length).toBe(2);expect(posted(f,'staff-role').requestKey).toBe(first);
 fail='enrollment';await page.getByRole('button',{name:'Set admin'}).click();await expect.element(page.getByRole('alert')).toHaveTextContent('enroll two-step');
 fail='network';await page.getByRole('button',{name:'Set admin'}).click();await expect.poll(()=>f.posts.length).toBe(4);expect(posted(f,'staff-role').requestKey).not.toBe(first);
});
