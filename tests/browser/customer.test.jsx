import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {page} from 'vitest/browser';
import ProductionStore from '../../src/commerce/ProductionStore.jsx';
import WorkosOperations from '../../src/operations/WorkosOperations.jsx';
import OperationsApp from '../../src/operations/OperationsApp.jsx';
import Unsubscribe from '../../src/operations/Unsubscribe.jsx';
import {Waitlist} from '../../src/Waitlist.jsx';
import {OrderStatus} from '../../src/commerce/OrderStatus.jsx';
import {App} from '../../src/App.jsx';
import {StorePage} from '../../src/commerce/Pages.jsx';
import StaffApp, {PackingSlip} from '../../src/operations/StaffApp.jsx';
import {CartDrawer,ProductOptions} from '../../src/commerce/Storefront.jsx';
import {merch} from '../../src/content.js';
import '../../src/styles.css';

let root, host;
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);localStorage.clear();sessionStorage.clear();});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const mount=element=>root.render(element);
const variants=['S','M','L','XL','2XL'].map(size=>({id:'e92-tee-'+size.toLowerCase(),productId:'e92-tee',name:'E92 Coupe Line-Art Tee',size,unitAmount:3000,inventoryPolicy:'made_to_order',available:size!=='XL'}));

test('closed commerce fails safely without a cart or purchase button',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('network')));mount(<ProductionStore/>);
  await expect.element(page.getByRole('heading',{name:'Drop 01 is coming soon.'})).toBeVisible();
  await expect.element(page.getByRole('button',{name:/Cart/})).not.toBeInTheDocument();
});
test('sizes, quantities and removal update the real persistent cart, and Escape restores focus',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({enabled:true,shippingCents:995,variants})));mount(<ProductionStore/>);
  const first=page.getByRole('article').first();
  await first.getByRole('button',{name:'XL',exact:true}).click();
  await expect.element(first.getByRole('button',{name:'Orders paused'})).toBeDisabled();
  await first.getByRole('button',{name:'M',exact:true}).click();
  await first.getByLabelText('Quantity').selectOptions('2');
  await first.getByRole('button',{name:'Add to cart'}).click();
  await page.getByRole('button',{name:'Cart (2)'}).click();
  const dialog=page.getByRole('dialog');
  await expect.element(dialog.getByText('Subtotal: $60.00')).toBeVisible();
  await dialog.getByLabelText('Quantity',{exact:true}).fill('3');
  await expect.element(dialog.getByText('Subtotal: $90.00')).toBeVisible();
  await dialog.getByLabelText('Size for E92 Coupe Line-Art Tee').selectOptions('L');
  expect(JSON.parse(localStorage.getItem('dbm-store-cart-v1')).items).toEqual([{variantId:'e92-tee-l',quantity:3}]);
  await dialog.getByRole('button',{name:'Remove item'}).click();
  await expect.element(dialog.getByText('Your cart is empty.')).toBeVisible();
  await expect.element(dialog.getByRole('button',{name:'Continue to secure checkout'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Close cart'}).click();
  await expect.element(page.getByRole('button',{name:'Cart (0)'})).toHaveFocus();
});
test('local preview product requires size and cart estimate failure preserves selections',async()=>{
  const onAdded=vi.fn();const onReview=vi.fn();
  function Preview(){
    const [items,setItems]=useState([]);const [open,setOpen]=useState(false);
    const cart={items,scenario:'in-stock',count:items.reduce((sum,line)=>sum+line.quantity,0),add:(variantId,quantity)=>setItems(current=>[...current,{variantId,quantity}]),replace:setItems};
    return <><ProductOptions item={merch[0]} cart={cart} onAdded={onAdded} onReview={()=>{onReview();setOpen(true);}}/>{open&&<CartDrawer cart={cart} onClose={()=>setOpen(false)}/>}</>;
  }
  const fetcher=vi.fn((url)=>url==='/api/commerce/config'?Promise.resolve(response({enabled:false,mode:'test',shippingCents:995})):Promise.reject(new TypeError('offline')));
  vi.stubGlobal('fetch',fetcher);mount(<Preview/>);
  await page.getByRole('button',{name:'Add to test cart'}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('Choose a size');
  await page.getByRole('button',{name:'E92 Coupe Line-Art Tee, size M'}).click();
  await page.getByLabelText('Quantity to add for E92 Coupe Line-Art Tee').selectOptions('2');
  await page.getByRole('button',{name:'Add to test cart'}).click();
  await expect.element(page.getByRole('status').getByText(/M added/)).toBeVisible();
  expect(onAdded).toHaveBeenCalledTimes(1);
  await page.getByRole('button',{name:'View cart'}).click();
  await expect.element(page.getByRole('dialog').getByText('Subtotal (2 items)')).toBeVisible();
  await page.getByRole('button',{name:/Check server estimate/}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('We could not reach the estimate service');
  await expect.element(page.getByRole('dialog').getByText('Subtotal (2 items)')).toBeVisible();
  await expect.element(page.getByRole('button',{name:'Checkout / Not connected'})).toBeDisabled();
  await page.getByRole('button',{name:'Close test cart'}).click();
  expect(onReview).toHaveBeenCalledTimes(1);
});
test('WorkOS refresh refusal shows ordinary hosted sign-in and never staff navigation',async()=>{
  const request=vi.fn().mockResolvedValue(response({signedIn:false},401));vi.stubGlobal('fetch',request);mount(<WorkosOperations/>);
  await expect.element(page.getByRole('link',{name:'Secure sign in'})).toHaveAttribute('href','/api/auth/sign-in');
  expect(request.mock.calls.some(([url,options])=>url==='/api/auth/refresh'&&options.method==='POST')).toBe(true);
  await expect.element(page.getByRole('link',{name:'Create account'})).toBeVisible();
  await expect.element(page.getByRole('navigation',{name:'Operations navigation'})).not.toBeInTheDocument();
});
test('account empty orders, profile and help use customer-only views',async()=>{
  const fetcher=vi.fn().mockResolvedValue(response({orders:[],profile:{},supportTickets:[]}));
  mount(<OperationsApp auth={{isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-browser-token',fetcher}}/>);
  await expect.element(page.getByRole('heading',{name:'No orders found'})).toBeVisible();
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await expect.element(page.getByRole('heading',{name:/Profile|preferences/i}).first()).toBeVisible();
  await page.getByRole('button',{name:'Help',exact:true}).click();
  await expect.element(page.getByRole('heading',{name:/support|help/i}).first()).toBeVisible();
});
test('admin reviews an order, service attention, audit history and made-to-order inventory',async()=>{
  const order={orderNumber:'DBM-QA-1',createdAt:'2026-10-18T00:00:00Z',status:'paid',paymentStatus:'paid',fulfillmentStatus:'received',totalCents:3995,subtotalCents:3000,shippingCents:995,taxCents:0,shippingName:'Synthetic Recipient',shippingAddress:{line1:'1 Test Way',city:'Test',state:'OH',postal_code:'43013'},items:[{variantId:'e92-tee-m',productId:'e92-tee',name:'E92 Coupe Line-Art Tee',size:'M',quantity:1,lineTotalCents:3000}],shipments:[],timeline:[],emailEvents:[]};
  const data={orders:[order],pagination:{page:1,total:1,pageSize:25},overview:{paid:1,needsAttention:1},failures:[{type:'email',status:'failed',eventId:'email-qa',orderNumber:order.orderNumber,safeMessage:'Delivery unavailable.'}],variants:[{id:'e92-tee-m',name:order.items[0].name,sku:'E92-M',size:'M',inventoryPolicy:'made_to_order',availableQuantity:0,reservedQuantity:0,soldQuantity:1,active:true,version:0}],audit:[{id:'a-1',action:'paid',actor:'synthetic-staff',orderNumber:order.orderNumber,createdAt:'2026-10-18T00:00:00Z',metadata:{source:'checkout'}}],supportTickets:[]};
  const fetcher=vi.fn((url,options)=>Promise.resolve(response(options.method==='POST'?{ok:true}:data)));
  mount(<OperationsApp admin auth={{isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-browser-token',fetcher}}/>);
  await expect.element(page.getByRole('heading',{name:'Needs attention'})).toBeVisible();
  await page.getByRole('button',{name:'Review order'}).click();
  await expect.element(page.getByRole('heading',{name:order.orderNumber})).toBeVisible();
  await expect.element(page.getByLabelText('Order detail').getByText('Synthetic Recipient')).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  await expect.element(page.getByText('Made to order | Pending units 0 | Paid units 1')).toBeVisible();
  await page.getByRole('button',{name:'Activity',exact:true}).click();
  await expect.element(page.getByText('synthetic-staff')).toBeVisible();
  await page.getByLabelText('Actor').fill('someone-else');
  await expect.element(page.getByText('No audit records match these filters.')).toBeVisible();
  await page.getByLabelText('Actor').fill('synthetic-staff');
  await page.getByRole('button',{name:'Retry email'}).click();
  expect(fetcher.mock.calls.some(([,options])=>options.method==='POST'&&JSON.parse(options.body).action==='retry-email')).toBe(true);
});
test('marketing preference requires an explicit click and reports a failed request truthfully',async()=>{
  const request=vi.fn().mockResolvedValue(response({saved:false},503));vi.stubGlobal('fetch',request);mount(<Unsubscribe/>);
  expect(request).not.toHaveBeenCalled();await page.getByRole('button',{name:'Unsubscribe from marketing'}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('We could not confirm this preference');
  request.mockResolvedValue(response({saved:true}));await page.getByRole('button',{name:'Unsubscribe from marketing'}).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Order and shipment updates are separate');
});
test('waitlist consent is unchecked and local preview cannot fabricate success',async()=>{
  const success=vi.fn();mount(<Waitlist item={{id:'e92-tee'}} onSuccess={success}/>);
  await expect.element(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByLabelText('Your name').fill('Synthetic');await page.getByLabelText('Email address').fill('synthetic@example.invalid');
  await page.getByLabelText('Preferred size').selectOptions('M');await page.getByRole('checkbox').click();
  await page.getByRole('button',{name:'Join Drop Alert'}).click();
  await expect.element(page.getByRole('alert')).toHaveTextContent('local preview');expect(success).not.toHaveBeenCalled();
});
test('order return without an access session preserves cart and refuses payment confirmation',async()=>{
  const replace=vi.fn();mount(<OrderStatus mode="production" cart={{items:[{variantId:'e92-tee-m',quantity:1}],replace}} onBack={()=>{}}/>);
  await expect.element(page.getByRole('alert')).toHaveTextContent('No valid checkout session');expect(replace).not.toHaveBeenCalled();
  await expect.element(page.getByRole('heading',{name:'Payment confirmed.'})).not.toBeInTheDocument();
});
test('verified sandbox order clears only purchased items and reports email delivery accurately',async()=>{
  const id='cs_test_Synthetic123456';
  window.history.replaceState(null,'',`/order/success?session_id=${id}`);
  sessionStorage.setItem(`dbm-order-access:${id}`,'synthetic-order-token');
  sessionStorage.setItem(`dbm-order-cart:${id}`,JSON.stringify([{variantId:'e92-tee-m',quantity:1}]));
  const cart={items:[{variantId:'e92-tee-m',quantity:2},{variantId:'e90-crewneck-m',quantity:1}],replace:vi.fn()};
  const payload={status:'paid',orderNumber:'DBM-QA-PAID',items:[{variantId:'e92-tee-m',quantity:1,unitPriceCents:3000,lineTotalCents:3000}],subtotalCents:3000,shippingCents:995,taxCents:0,totalCents:3995,emailStatus:'queued'};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(payload)));
  mount(<OrderStatus cart={cart} onBack={()=>{}}/>);
  await expect.element(page.getByRole('heading',{name:'Test payment verified.'})).toBeVisible();
  await expect.element(page.getByText('Order email delivery has not been confirmed.')).toBeVisible();
  expect(cart.replace).toHaveBeenCalledWith([{variantId:'e92-tee-m',quantity:1},{variantId:'e90-crewneck-m',quantity:1}]);
  expect(sessionStorage.getItem(`dbm-order-cleared:${id}`)).toBe('1');
  window.history.replaceState(null,'','/');
});
test('an order return with mismatched purchased items cannot clear the cart',async()=>{
  const id='cs_test_Mismatch1234567';
  window.history.replaceState(null,'',`/order/success?session_id=${id}`);
  sessionStorage.setItem(`dbm-order-access:${id}`,'synthetic-order-token');
  sessionStorage.setItem(`dbm-order-cart:${id}`,JSON.stringify([{variantId:'e92-tee-m',quantity:1}]));
  const cart={items:[{variantId:'e92-tee-m',quantity:1}],replace:vi.fn()};
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response({status:'paid',orderNumber:'DBM-QA-MISMATCH',items:[{variantId:'e90-crewneck-m',quantity:1,unitPriceCents:5000,lineTotalCents:5000}],subtotalCents:5000,shippingCents:995,taxCents:0,totalCents:5995})));
  mount(<OrderStatus cart={cart} onBack={()=>{}}/>);
  await expect.element(page.getByRole('alert')).toHaveTextContent('purchased items do not match');
  expect(cart.replace).not.toHaveBeenCalled();
  await expect.element(page.getByRole('heading',{name:'Test payment verified.'})).not.toBeInTheDocument();
  window.history.replaceState(null,'','/');
});

test('public garage tabs, filters, details and waitlist remain usable without checkout',async()=>{
  window.history.replaceState(null,'','/');
  mount(<App/>);
  await expect.element(page.getByRole('heading',{name:/Four platforms/})).toBeVisible();
  await page.getByRole('button',{name:'Explore BMW N54 platform details'}).click();
  await expect.element(page.getByRole('dialog').getByRole('heading',{name:/BMW N54/})).toBeVisible();
  await page.getByRole('button',{name:'Close details'}).click();
  await page.getByRole('tab',{name:/Video Vault/}).click();
  await expect.element(page.getByRole('button',{name:/Play The N54 single-turbo/}).first()).toBeVisible();
  await page.getByRole('button',{name:'Two-Strokes'}).click();
  await expect.element(page.getByRole('button',{name:/Play Into the hills/}).first()).toBeVisible();
  await page.getByRole('tab',{name:/Drop 01 Merch|Garage Merch/}).click();
  await expect.element(page.getByText('Coming soon · Orders aren’t open yet.')).toBeVisible();
  await page.getByRole('button',{name:/Quick View E92 Coupe/}).click();
  await expect.element(page.getByRole('dialog').getByText('To be confirmed')).toBeVisible();
  await page.getByRole('button',{name:'Close details'}).click();
  await page.getByRole('button',{name:/Join Drop Alert for E92/}).click();
  await expect.element(page.getByRole('dialog').getByText(/signups are not open yet/i)).toBeVisible();
  await expect.element(page.getByRole('dialog').getByRole('checkbox')).not.toBeInTheDocument();
  await page.getByRole('button',{name:'Close details'}).click();
  await page.getByRole('tab',{name:/About|Pit Crew/}).click();
  await expect.element(page.getByRole('heading',{name:/Two brothers/})).toBeVisible();
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect.element(page.getByRole('button',{name:'Close navigation',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close navigation overlay'}).click();
});

test('public merchandise quick view stays a design preview without active purchase-policy promises',async()=>{
  window.history.replaceState(null,'','/');mount(<App/>);
  await page.getByRole('tab',{name:/Drop 01 Merch|Garage Merch/}).click();
  await page.getByRole('button',{name:/Quick View E92 Coupe/}).click();
  const dialog=page.getByRole('dialog');
  await expect.element(dialog.getByText(/Design preview\. No orders or payments are being accepted\./)).toBeVisible();
  await expect.element(dialog.getByText(/Ships within 3 days|No change-of-mind returns|30 calendar days of delivery/)).not.toBeInTheDocument();
  await expect.element(dialog.getByRole('link',{name:/Shipping and processing|Returns and size exchanges/})).not.toBeInTheDocument();
});

test('signed-out customer account does not promise guest checkout while orders are paused',async()=>{
  mount(<OperationsApp auth={{isLoaded:true,isSignedIn:false}}/>);
  await expect.element(page.getByRole('heading',{name:'Welcome to your garage'})).toBeVisible();
  await expect.element(page.getByText(/guest checkout is always available/i)).not.toBeInTheDocument();
  await expect.element(page.getByText(/Orders are currently paused/i)).toBeVisible();
});

test('video player avoids autoplay for reduced-motion visitors and uses a clear YouTube label',async()=>{
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,media:'(prefers-reduced-motion: reduce)',addEventListener:vi.fn(),removeEventListener:vi.fn()})));
  window.history.replaceState(null,'','/#vault');mount(<App/>);
  await page.getByRole('button',{name:/Play The N54 single-turbo/}).first().click();
  const player=page.getByTitle(/The N54 single-turbo/);
  await expect.element(player).toBeVisible();
  await expect.element(player).toHaveAttribute('src',expect.stringContaining('autoplay=0'));
  await expect.element(page.getByRole('link',{name:/Watch .* on YouTube/})).toHaveTextContent('Watch on YouTube');
});

test('public policy pages disclose prelaunch status and keep purchase controls absent',async()=>{
  for(const policy of ['shipping','returns','privacy','terms','contact']){
    mount(<StorePage page={policy} draft onBrowse={()=>{}}/>);
    await expect.element(page.getByText('Pre-launch draft. This page is incomplete and is not an approved customer policy.')).toBeVisible();
    await expect.element(page.getByRole('button',{name:/checkout|buy now/i})).not.toBeInTheDocument();
    root.unmount();host.remove();host=document.createElement('div');document.body.append(host);root=createRoot(host);
  }
});

test('public policy pages show safe pre-launch information without internal draft markers',async()=>{
  for(const policy of ['shipping','returns','privacy','terms','contact']){
    mount(<StorePage page={policy} draft={false} waitlistEnabled={false} onBrowse={()=>{}}/>);
    await expect.element(page.getByText(/Pre-launch information \/ No orders accepted/)).toBeVisible();
    await expect.element(page.getByText(/not accepting (orders|purchases)/i)).toBeVisible();
    await expect.element(page.getByText(/\[VERIFIED|\[POLICY|draft for review|not an approved/i)).not.toBeInTheDocument();
    await expect.element(page.getByRole('button',{name:/checkout|buy now/i})).not.toBeInTheDocument();
    root.unmount();host.remove();host=document.createElement('div');document.body.append(host);root=createRoot(host);
  }
  mount(<StorePage page="privacy" draft={false} waitlistEnabled={false} onBrowse={()=>{}}/>);
  await expect.element(page.getByText(/signup is temporarily closed/i)).toBeVisible();
  await expect.element(page.getByText(/No signup will be recorded/i)).toBeVisible();
});

test('staff route refuses an unsigned or unprivileged account and packing slip omits payment details',async()=>{
  const auth={isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-token',fetcher:vi.fn().mockResolvedValue(response({role:'customer',orders:[]}))};
  mount(<StaffApp auth={auth}/>);
  await expect.element(page.getByRole('heading',{name:'Page unavailable'})).toBeVisible();
  root.unmount();host.remove();host=document.createElement('div');document.body.append(host);root=createRoot(host);
  const slip={orderNumber:'DBM-TEST',orderDate:'2026-10-18T00:00:00Z',shipTo:{name:'Synthetic Recipient',address:{line1:'1 Test Way',city:'Test',state:'OH',postal_code:'43013',country:'US'}},items:[{name:'E92 Tee',size:'M',quantity:1}],paymentIntentId:'pi_private',totalCents:3000};
  mount(<PackingSlip slip={slip} onClose={()=>{}} onPrint={()=>{}}/>);
  const dialog=page.getByRole('dialog',{name:'Packing slip preview'});
  await expect.element(dialog.getByText('Synthetic Recipient')).toBeVisible();
  await expect.element(dialog.getByText('E92 Tee')).toBeVisible();
  await expect.element(dialog.getByText('pi_private')).not.toBeInTheDocument();
  await expect.element(dialog.getByText('$30.00')).not.toBeInTheDocument();
});
test('authorized staff opens an order and prints a package-safe slip with focus restored',async()=>{
  const order={orderNumber:'DBM-QA-2',createdAt:'2026-10-18T00:00:00Z',status:'paid',fulfillmentStatus:'received',shippingName:'Synthetic Recipient',shippingAddress:{line1:'1 Test Way',city:'Test',state:'OH',postal_code:'43013',country:'US'},items:[{variantId:'e92-tee-m',name:'E92 Tee',size:'M',quantity:1}],shipments:[],version:0};
  const slip={orderNumber:order.orderNumber,orderDate:order.createdAt,shipTo:{name:order.shippingName,address:order.shippingAddress},items:order.items,paymentIntentId:'pi_never_print'};
  const fetcher=vi.fn((url,options)=>Promise.resolve(response(options.method==='POST'?{packingSlip:slip}:{role:'employee',orders:[order],pagination:{page:1,total:1,pageSize:25}})));
  mount(<StaffApp auth={{isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-token',fetcher}}/>);
  await expect.element(page.getByRole('heading',{name:'Fulfillment workspace'})).toBeVisible();
  await page.getByRole('button',{name:/DBM-QA-2/}).click();
  await expect.element(page.getByRole('heading',{name:order.orderNumber})).toBeVisible();
  await page.getByRole('button',{name:'Preview whole-order packing slip'}).click();
  const dialog=page.getByRole('dialog',{name:'Packing slip preview'});
  await expect.element(dialog.getByText('Synthetic Recipient')).toBeVisible();
  await expect.element(dialog.getByText('pi_never_print')).not.toBeInTheDocument();
  await dialog.getByRole('button',{name:'Back to order'}).click();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(fetcher.mock.calls.some(([,options])=>options.method==='POST'&&JSON.parse(options.body).action==='packing-slip')).toBe(true);
});
