import React from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {page} from 'vitest/browser';
import OperationsApp from '../../src/operations/OperationsApp.jsx';
import '../../src/styles.css';

let root,host;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();});
function fixture(){
 const order={orderNumber:'DBM-OPS-QA',createdAt:'2026-10-18T00:00:00Z',status:'paid',paymentStatus:'paid',fulfillmentStatus:'received',version:4,
  totalCents:6995,subtotalCents:6000,shippingCents:995,taxCents:0,shippingName:'Synthetic Buyer',customerEmail:'synthetic@example.invalid',shippingAddress:{line1:'1 Synthetic Way',city:'Test',state:'OH',postal_code:'43013'},sessionId:'cs_test_fixture',paymentIntentId:'pi_fixture',
  items:[{variantId:'e92-tee-m',productId:'e92-tee',name:'E92 Tee',size:'M',quantity:2,lineTotalCents:6000}],shipments:[],
  timeline:[{id:'t1',toStatus:'paid',createdAt:'2026-10-18T00:00:00Z',actor:'synthetic-staff',note:'Synthetic verified event'}],notes:[{note:'Prior synthetic note',createdAt:'2026-10-18T00:00:00Z'}],
  emailEvents:[{eventId:'email_failed',emailType:'order-confirmation',status:'failed',attemptCount:1},{eventId:'email_review',status:'manual-review'},{eventId:'email_queued',status:'queued'}]};
 const data={orders:[order],pagination:{page:1,total:51,pageSize:25},overview:{paid:1},variants:[{id:'e92-tee-m',name:'E92 Tee',sku:'E92-M',size:'M',inventoryPolicy:'stocked',availableQuantity:2,reservedQuantity:1,soldQuantity:1,active:true,version:3}],failures:[],audit:[],profile:{displayName:'Synthetic Buyer',email:'synthetic@example.invalid',marketingConsent:false},supportTickets:[]};
 const posts=[];const fetcher=vi.fn(async(url,options)=>{
  if(options.method==='POST'){posts.push(JSON.parse(options.body));return json({ok:true});}
  const query=new URL(url,'http://local').searchParams;
  return json({...data,pagination:{...data.pagination,page:Number(query.get('page')||1)}});
 });
 const auth={isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-token',fetcher,signOut:vi.fn()};return {auth,data,order,posts,fetcher};
}
const posted=(f,action)=>f.posts.findLast(p=>p.action===action);
test('resolved last category automatically reveals remaining attention tasks',async()=>{
 const f=fixture();f.data.failures=[{type:'email',status:'queued',eventId:'last-mail'},{type:'refund',status:'review',orderNumber:'REFUND-PENDING'}];
 const original=f.auth.fetcher;f.auth.fetcher=async(url,options)=>{if(options.method==='POST')f.data.failures=f.data.failures.filter(e=>e.type!=='email');return original(url,options);};
 root.render(<OperationsApp admin auth={f.auth}/>);await page.getByLabelText('Attention category').selectOptions('email');await page.getByRole('region',{name:'Needs attention'}).getByRole('button',{name:'Retry email',exact:true}).click();
 await expect.element(page.getByLabelText('Attention category')).toHaveValue('');await expect.element(page.getByText('REFUND-PENDING',{exact:true})).toBeVisible();
});
test('closing an attention-opened order restores focus to mounted Orders navigation',async()=>{
 const f=fixture();f.data.failures=[{type:'shipment_delay',status:'refund_required',orderNumber:f.order.orderNumber}];root.render(<OperationsApp admin auth={f.auth}/>);
 await page.getByRole('button',{name:'Review order',exact:true}).click();await expect.element(page.getByRole('heading',{name:f.order.orderNumber,exact:true})).toHaveFocus();
 await page.getByRole('button',{name:'Close',exact:true}).click();await expect.element(page.getByRole('button',{name:'Orders',exact:true})).toHaveFocus();
});
test('daily workflow opens oldest paid work and attention stays bounded, grouped and fully reachable',async()=>{
 const f=fixture();f.data.overview={paid:1,received:1,making:2,packing:3,ready_to_ship:4,on_hold:1};
 f.data.failures=[...Array.from({length:12},(_,i)=>({type:'email',status:'queued',eventId:'mail-'+i,orderNumber:'DBM-'+i})),{type:'shipment_delay',status:'refund_required',orderNumber:'URGENT'},{type:'fulfillment',status:'review',orderNumber:'URGENT'},{type:'email',status:'queued',orderNumber:'DBM-0',eventId:'repeat'}];
 root.render(<OperationsApp admin auth={f.auth}/>);
 await expect.element(page.getByRole('heading',{name:'Daily workflow'})).toBeVisible();
 const attention=page.getByRole('region',{name:'Needs attention'});
 await expect.element(attention.getByText('13 grouped tasks | urgent first')).toBeVisible();
 await expect.element(attention.getByText('URGENT',{exact:true})).toBeVisible();
 expect(host.querySelectorAll('.ops-attention>ul>li')).toHaveLength(5);
 await page.getByRole('button',{name:'Next tasks'}).click();await expect.element(page.getByText('Tasks 6-10 of 13')).toBeVisible();
 await page.getByRole('button',{name:'Previous tasks'}).click();
 await page.getByLabelText('Attention category').selectOptions('email');await expect.element(page.getByText('Tasks 1-5 of 12')).toBeVisible();
 await page.getByRole('button',{name:'Start production 1',exact:true}).click();
 await expect.poll(()=>f.fetcher.mock.calls.filter(([,o])=>o.method==='GET').some(([url])=>url.includes('fulfillmentStatus=received')&&url.includes('sort=oldest')&&url.includes('status=paid'))).toBe(true);
 await page.getByRole('button',{name:'Overview',exact:true}).click();await page.getByRole('button',{name:'Customer requests 0',exact:true}).click();await expect.element(page.getByRole('heading',{name:'Customer support',exact:true})).toBeVisible();
});
async function openOrder(f){await page.getByRole('button',{name:new RegExp(f.order.orderNumber)}).click();await expect.element(page.getByRole('heading',{name:f.order.orderNumber})).toHaveFocus();}

test('admin filters and paginates orders using server query parameters',async()=>{
 const f=fixture();root.render(<OperationsApp admin auth={f.auth}/>);
 await page.getByRole('button',{name:'Orders',exact:true}).click();
 await page.getByLabelText('Search orders or customer').fill('synthetic');
 await page.getByLabelText('Fulfillment status').selectOptions('making');
 await page.getByText('More filters',{exact:true}).click();
 await page.getByRole('combobox',{name:/^Payment/}).selectOptions('paid');
 await page.getByRole('combobox',{name:/^Shipment/}).selectOptions('packed');
 await page.getByLabelText('Customer email').fill('synthetic@example.invalid');
 await page.getByLabelText('From date',{exact:true}).fill('2026-10-01');
 await page.getByLabelText('To date',{exact:true}).fill('2026-10-19');
 await page.getByRole('combobox',{name:/^Sort orders/}).selectOptions('oldest');
 await expect.poll(()=>f.fetcher.mock.calls.at(-1)[0]).toContain('sort=oldest');
 const query=new URL(f.fetcher.mock.calls.at(-1)[0],'http://local').searchParams;
 expect(Object.fromEntries(query)).toMatchObject({admin:'true',page:'1',search:'synthetic',fulfillmentStatus:'making',status:'paid',shipmentStatus:'packed',customer:'synthetic@example.invalid',dateFrom:'2026-10-01',dateTo:'2026-10-19'});
 await page.getByRole('button',{name:'Next',exact:true}).click();await expect.element(page.getByText('Page 2 of 3 | 51 orders')).toBeVisible();
 await page.getByRole('button',{name:'Previous',exact:true}).click();await expect.element(page.getByText('Page 1 of 3 | 51 orders')).toBeVisible();
});

test('admin status, notes, email retry and refund controls submit explicit versioned requests',async()=>{
 const f=fixture();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);root.render(<OperationsApp admin auth={f.auth}/>);await openOrder(f);
 await page.getByLabelText('Next status').selectOptions('on_hold');await page.getByLabelText('Status note (optional)').fill('Review synthetic order');
 await page.getByRole('button',{name:'Update status'}).click();expect(posted(f,'transition')).toBeUndefined();
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Update status'}).click();
 await expect.poll(()=>posted(f,'transition')).toMatchObject({status:'on_hold',expectedVersion:4,confirmed:true,note:'Review synthetic order'});
 await page.getByLabelText('Note',{exact:true}).fill('A private synthetic note');await page.getByRole('button',{name:'Save note'}).click();
 await expect.poll(()=>posted(f,'note')?.note).toBe('A private synthetic note');await expect.element(page.getByLabelText('Note',{exact:true})).toHaveValue('');
 await page.getByRole('button',{name:'Retry email'}).first().click();await expect.poll(()=>posted(f,'retry-email')?.eventId).toBe('email_failed');
 await page.getByText('Payment reference',{exact:true}).click();await expect.element(page.getByText('Payment intent: pi_fixture')).toBeVisible();
 await page.getByText('Refund payment',{exact:true}).click();await page.getByLabelText('Refund amount (USD)').fill('10.25');
 confirm.mockReturnValue(false);await page.getByRole('button',{name:'Review and refund'}).click();expect(posted(f,'refund')).toBeUndefined();
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Review and refund'}).click();
 await expect.poll(()=>posted(f,'refund')).toMatchObject({amountCents:1025,confirmed:true,requestKey:expect.any(String)});
});

test('shipment drafting rejects insecure tracking and preserves package measurements',async()=>{
 const f=fixture();root.render(<OperationsApp admin auth={f.auth}/>);await openOrder(f);
 await page.getByText('Create shipment',{exact:true}).click();
 await page.getByLabelText('Carrier',{exact:true}).fill('USPS');await page.getByLabelText('Service',{exact:true}).fill('Ground');
 await page.getByLabelText('Tracking number',{exact:true}).fill('SYNTHETIC');await page.getByLabelText('Tracking URL',{exact:true}).fill('http://example.invalid/tracking');
 await page.getByLabelText('E92 Tee (M)',{exact:true}).fill('2');
 await page.getByRole('button',{name:'Save shipment draft'}).click();expect(posted(f,'shipment')).toBeUndefined();
 await page.getByLabelText('Tracking URL',{exact:true}).fill('https://example.invalid/tracking');
 await page.getByLabelText('Weight (oz, optional)').fill('12.5');
 for(const [name,value] of [['length','12'],['width','9'],['height','2']])await page.getByLabelText(`${name} (in, optional)`,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Save shipment draft'}).click();
 await expect.poll(()=>posted(f,'shipment')).toMatchObject({orderNumber:f.order.orderNumber,items:[{variantId:'e92-tee-m',quantity:2}],weightOz:12.5,dimensions:{length:12,width:9,height:2}});
 await expect.element(page.getByLabelText('Tracking number',{exact:true})).toHaveValue('');
});

test('inventory adjustments require confirmation and preserve reserved and sold counters',async()=>{
 const f=fixture();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);root.render(<OperationsApp admin auth={f.auth}/>);
 await page.getByRole('button',{name:'Inventory',exact:true}).click();await page.getByLabelText('Search inventory').fill('E92');
 await page.getByLabelText('Available',{exact:true}).fill('7');await page.getByLabelText('Active',{exact:true}).click();await page.getByLabelText('Adjustment reason').fill('Synthetic physical recount');
 await page.getByRole('button',{name:'Save',exact:true}).click();expect(posted(f,'inventory')).toBeUndefined();
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Save',exact:true}).click();
 await expect.poll(()=>posted(f,'inventory')).toEqual({action:'inventory',variantId:'e92-tee-m',availableQuantity:7,active:false,reason:'Synthetic physical recount',expectedVersion:3});
 await expect.element(page.getByText('Available 2 | Reserved 1 | Sold 1')).toBeVisible();
});

test('customer consent, deletion requests and support remain separate from transactions',async()=>{
 const f=fixture();vi.spyOn(window,'confirm').mockReturnValue(true);root.render(<OperationsApp auth={f.auth}/>);
 await page.getByRole('button',{name:'Profile',exact:true}).click();
 const consent=page.getByRole('checkbox');await expect.element(consent).not.toBeChecked();await consent.click();
 await page.getByRole('button',{name:'Save preferences'}).click();await expect.poll(()=>posted(f,'preferences')).toEqual({action:'preferences',marketingConsent:true});
 await page.getByRole('button',{name:'Request account deletion'}).click();await expect.poll(()=>posted(f,'deletion-request')).toEqual({action:'deletion-request'});
 await page.getByRole('button',{name:'Help',exact:true}).click();
 await page.getByLabelText('Topic',{exact:true}).selectOptions('shipping');await page.getByLabelText('Order number (optional)').fill(f.order.orderNumber);
 await page.getByLabelText('How can we help?').fill('Please review this synthetic shipment.');await page.getByRole('button',{name:'Save support request'}).click();
 await expect.poll(()=>posted(f,'support')).toEqual({action:'support',category:'shipping',orderNumber:f.order.orderNumber,message:'Please review this synthetic shipment.'});
 await expect.element(page.getByLabelText('How can we help?')).toHaveValue('');
 await page.getByRole('button',{name:'Sign out'}).click();expect(f.auth.signOut).toHaveBeenCalledOnce();
});

test('support resolution and audit filters expose only the requested synthetic records',async()=>{
 const f=fixture();vi.spyOn(window,'confirm').mockReturnValue(true);
 f.data.supportTickets=[{ticketNumber:'SUP-QA',category:'shipping',status:'open',message:'Synthetic request',customerEmail:'synthetic@example.invalid',orderNumber:f.order.orderNumber,createdAt:'2026-10-18T00:00:00Z',version:2}];
 f.data.audit=[{id:'a1',action:'transition',actor:'synthetic-admin',orderNumber:f.order.orderNumber,createdAt:'2026-10-18T00:00:00Z',metadata:{previous:'received',next:'making',note:'Synthetic transition'}},{id:'a2',action:'inventory',createdAt:'2026-10-18T00:00:00Z',target:'e92-tee-m',metadata:{previous:{availableQuantity:1,active:true},next:{availableQuantity:2,active:false},amountCents:3000,packageNumber:1,marketingConsent:false,method:'verified-primary-email',source:'qa'}}];
 root.render(<OperationsApp admin auth={f.auth}/>);await page.getByRole('button',{name:'Support',exact:true}).click();
 await page.getByLabelText('Internal resolution note').fill('Synthetic carrier verified');await page.getByRole('button',{name:'Mark resolved'}).click();
 await expect.poll(()=>posted(f,'support-status')).toMatchObject({ticketNumber:'SUP-QA',status:'resolved',note:'Synthetic carrier verified',expectedVersion:2});
 await page.getByRole('combobox').selectOptions('resolved');await expect.element(page.getByText('No requests match this view.')).toBeVisible();
 await page.getByRole('button',{name:'Activity',exact:true}).click();await expect.element(page.getByText(/Available units: 1 to 2/)).toBeVisible();
 await page.getByRole('combobox',{name:/^Action/}).selectOptions('transition');await page.getByLabelText('Order or target').fill(f.order.orderNumber);
 await page.getByLabelText('Activity from date').fill('2026-10-01');await page.getByLabelText('Activity to date').fill('2026-10-19');
 await expect.element(page.getByText('Synthetic transition',{exact:true})).toBeVisible();
 await page.getByLabelText('Activity to date').fill('2026-10-17');await expect.element(page.getByText('No audit records match these filters.')).toBeVisible();
});

test('failed account loading can be retried and a failed write never announces success',async()=>{
 const f=fixture();const original=f.fetcher.getMockImplementation();f.fetcher.mockRejectedValueOnce(new TypeError('offline'));
 root.render(<OperationsApp auth={f.auth}/>);await expect.element(page.getByRole('heading',{name:'Garage temporarily unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Try again'}).click();await expect.element(page.getByRole('heading',{name:'Your orders',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Profile',exact:true}).click();f.fetcher.mockImplementation((url,options)=>options.method==='POST'?Promise.resolve(json({code:'stale_record'},409)):original(url,options));
 await page.getByRole('button',{name:'Save preferences'}).click();await expect.element(page.getByRole('alert')).toHaveTextContent('This record changed.');
 await expect.element(page.getByText('Communication preferences saved.')).not.toBeInTheDocument();
});

test('admin reviews split-package tracking and explicitly records each permitted shipment state',async()=>{
 const f=fixture();const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 f.order.shipments=[{id:'draft-fixture',status:'draft',items:[{variantId:'e92-tee-m',quantity:1}]},{id:'packed-fixture',status:'packed',carrier:'UPS',service:'Ground',trackingNumber:'SYNTHETIC',trackingUrl:'https://www.ups.com/track',version:2,items:[{name:'E92 Tee',quantity:1}]},{id:'shipped-fixture',status:'shipped',trackingUrl:'javascript:alert(1)',items:[{variantId:'unknown-fixture',quantity:1}]}];
 root.render(<OperationsApp admin auth={f.auth}/>);await openOrder(f);
 await expect.element(page.getByRole('link',{name:'Track this package'})).toHaveAttribute('href','https://www.ups.com/track');
 expect(host.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
 await expect.element(page.getByText('Carrier not yet assigned').first()).toBeVisible();
 await page.getByRole('button',{name:'Mark packed'}).click();await expect.poll(()=>posted(f,'shipment-status')).toMatchObject({shipmentId:'draft-fixture',status:'packed',expectedVersion:0});
 await page.getByRole('button',{name:'Mark shipped'}).click();await expect.poll(()=>posted(f,'shipment-status')).toMatchObject({shipmentId:'packed-fixture',status:'shipped',expectedVersion:2});
 confirm.mockReturnValue(false);const before=f.posts.length;await page.getByRole('button',{name:'Record delivery'}).click();expect(f.posts).toHaveLength(before);
 confirm.mockReturnValue(true);await page.getByRole('button',{name:'Record delivery'}).click();await expect.poll(()=>posted(f,'shipment-status')).toMatchObject({shipmentId:'shipped-fixture',status:'delivered',confirmed:true});
});

test('pending order reconciliation is explicit and never presents a refund action',async()=>{
 const f=fixture();f.order.status='checkout_pending';f.order.paymentStatus='checkout_pending';f.order.shippingAddress='Synthetic address';f.order.fulfillmentStatus='unfulfilled';f.order.emailEvents=[];f.order.notes=['Synthetic legacy note'];f.order.timeline=[];
 root.render(<OperationsApp admin auth={f.auth}/>);await openOrder(f);
 await page.getByRole('button',{name:'Reconcile with Stripe'}).click();await expect.poll(()=>posted(f,'reconcile')).toEqual({action:'reconcile',orderNumber:f.order.orderNumber});
 await expect.element(page.getByText('Refund payment',{exact:true})).not.toBeInTheDocument();
 await expect.element(page.getByText('No transactional email events have been recorded.')).toBeVisible();
 await expect.element(page.getByText('Synthetic legacy note',{exact:true})).toBeVisible();
 await expect.element(page.getByLabelText('Next status').getByRole('option',{name:'Order received'})).toBeInTheDocument();
});

test('suppressed customer profile cannot silently re-subscribe and displays the existing deletion request',async()=>{
 const f=fixture();f.data.profile={marketingConsent:true,marketingSuppressed:true,deletionRequestedAt:'2026-10-18T00:00:00Z'};
 root.render(<OperationsApp auth={{...f.auth,accountElement:<span>Synthetic provider profile control</span>}}/>);
 await page.getByRole('button',{name:'Profile',exact:true}).click();await expect.element(page.getByRole('checkbox')).toBeDisabled();
 await expect.element(page.getByText('You are unsubscribed. Future purchases will not resubscribe you.')).toBeVisible();
 await expect.element(page.getByText(/Deletion requested on/)).toBeVisible();await expect.element(page.getByRole('button',{name:'Request account deletion'})).not.toBeInTheDocument();
 await expect.element(page.getByText('Synthetic provider profile control').last()).toBeVisible();
});

test('support requests can be reopened and the empty inventory view remains usable',async()=>{
 const f=fixture();vi.spyOn(window,'confirm').mockReturnValue(true);f.data.variants=[];
 f.data.supportTickets=[{ticketNumber:'SUP-RESOLVED',category:'general',status:'resolved',message:'Synthetic resolved request',note:'Prior private resolution',createdAt:'2026-10-18T00:00:00Z'}];
 root.render(<OperationsApp admin auth={f.auth}/>);await page.getByRole('button',{name:'Inventory',exact:true}).click();await expect.element(page.getByRole('heading',{name:'No inventory configured'})).toBeVisible();
 await page.getByRole('button',{name:'Support',exact:true}).click();await page.getByLabelText('Internal resolution note').fill('Synthetic review reopened');await page.getByRole('button',{name:'Reopen request'}).click();
 await expect.poll(()=>posted(f,'support-status')).toMatchObject({status:'open',expectedVersion:0});
});
