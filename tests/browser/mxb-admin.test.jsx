import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {test,beforeEach,afterEach,expect,vi} from 'vitest';import {page} from 'vitest/browser';
import {MxBikes} from '../../src/operations/MxBikes.jsx';import '../../src/styles.css';import '../../src/operations/operations.css';
let root,host,rows,actions,fail;
beforeEach(()=>{rows=[];actions=[];fail=false;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.spyOn(window,'confirm').mockReturnValue(true);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();});
function mount(){function Harness(){const[products,setProducts]=useState([]);return <MxBikes products={products} reload={async()=>setProducts([...rows])} auth={{getToken:async()=> 'synthetic',fetcher:async(url,options)=>{const input=JSON.parse(options.body);actions.push(input);if(fail)return Response.json({code:'stale_record'},{status:409});let p=rows[0];if(input.action==='product-save')p={id:'synthetic',draft:input.product,status:'draft',version:(p?.version??-1)+1,updatedAt:'2026-11-07T00:00:00Z'};else if(input.action==='product-archive')p={...p,status:'archived'};else if(input.action==='product-preview-publish')p={...p,setupPreview:{name:p.draft.name}};else if(input.action==='product-preview-unpublish')p={...p,setupPreview:undefined};rows=[p];return Response.json({product:p});}}}/>;}root.render(<Harness/>);}
test('MX Admin selects exact roster bike, saves private metadata, controls preview separately and archives',async()=>{
 mount();await page.getByRole('button',{name:'Create setup draft'}).click();
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Not saved yet');
 await page.getByLabelText('Manufacturer',{exact:true}).selectOptions('Husqvarna');await page.getByRole('searchbox',{name:'Search bikes'}).fill('TC125');
 await page.getByLabelText('Exact bike',{exact:true}).selectOptions('husqvarna-tc-125-2023');await page.getByLabelText('Setup type',{exact:true}).selectOptions('track');await page.getByLabelText('Exact track').fill('Assen');await page.getByLabelText('Setup name').fill('TC125 Assen');await page.getByLabelText('Setup SKU').fill('QA-ASSEN');await page.getByLabelText('Description',{exact:true}).fill('Owner draft for future testing.');
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Unsaved changes');
 await expect.element(page.getByRole('button',{name:'Approve public preview'})).toBeDisabled();await page.getByRole('button',{name:'Save setup draft'}).click();await expect.element(page.getByText('Setup draft saved.')).toBeVisible();
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Saved draft');
 expect(actions[0].product).toMatchObject({bikeId:'husqvarna-tc-125-2023',oemBike:'2023 Husqvarna TC 125',discipline:'track',track:'Assen',priceCents:100,compatibility:'unverified'});
 await page.getByRole('button',{name:'Approve public preview'}).click();await expect.element(page.getByText('Public preview approved. Sales, downloads and sending stay closed.')).toBeVisible();
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Public preview visible: saved snapshot');
 await page.getByLabelText('Setup name').fill('TC125 Assen edited privately');
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Unsaved changes');
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Public preview visible: saved snapshot');
 await expect.element(page.getByRole('button',{name:'Approve public preview'})).toBeDisabled();
 await expect.element(page.getByLabelText('Choose .stp file')).toBeDisabled();
 await page.getByLabelText('Setup name').fill('TC125 Assen');
 await page.getByRole('button',{name:'Hide public preview'}).click();await expect.element(page.getByText('Public preview removed.')).toBeVisible();
 await expect.element(page.getByRole('status',{name:'Setup editing status'})).toHaveTextContent('Public preview hidden');
 fail=true;await page.getByRole('button',{name:'Save setup draft'}).click();await expect.element(page.getByRole('alert')).toBeVisible();fail=false;
 await page.getByRole('button',{name:'Archive setup'}).click();await expect.element(page.getByRole('button',{name:'Save setup draft'})).toBeDisabled();await expect.element(page.getByText('Setup archived. Its public preview is hidden.')).toBeVisible();
});
