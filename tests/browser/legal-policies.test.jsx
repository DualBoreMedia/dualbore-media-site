import React from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {page} from 'vitest/browser';
import {StorePage} from '../../src/commerce/Pages.jsx';
import {ShippingCompliance} from '../../src/operations/ShippingCompliance.jsx';
import '../../src/styles.css';
let root,host;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{root.unmount();host.remove();vi.restoreAllMocks();});
test('current public policies disclose real flows, provide working Gmail contact, and never render purchase drafts or forms',async()=>{
 for(const id of ['terms','privacy','contact','shipping','returns']){
  root.render(<StorePage page={id} onBrowse={()=>{}}/>);
  await expect.element(page.getByRole('heading',{level:1})).toBeVisible();
  await expect.poll(()=>host.textContent).toContain('Orders and signups paused');
  expect(host.textContent).not.toMatch(/\[.*REQUIRED\]|55 Union|support@dualboremedia|3 calendar days|14 calendar days/);
  expect(host.querySelectorAll('form,input,iframe').length).toBe(0);
  expect([...host.querySelectorAll('a')].filter(a=>a.textContent==='midohiomx@gmail.com').every(a=>a.getAttribute('href')==='mailto:midohiomx@gmail.com')).toBe(true);
 }
 root.render(<StorePage page="privacy" onBrowse={()=>{}}/>);
 await expect.element(page.getByRole('heading',{name:'Fonts',exact:true})).toBeVisible();
 expect(host.textContent).toContain('when the page opens');expect(host.textContent).toContain('No YouTube player loads until');expect(host.textContent).toContain('does not mean anonymous');expect(host.textContent).toContain('not established a fixed retention period');
 expect(host.querySelector('a[href="https://www.netlify.com/privacy/"]').rel).toBe('noopener noreferrer');
 root.render(<StorePage page="shipping" onBrowse={()=>{}}/>);await expect.poll(()=>host.textContent).toContain('5 business days after payment confirmation');expect(host.textContent).toContain('not merely printing a label');
});
test('future drafts retain genuine owner decisions separately from current public practices',async()=>{
 root.render(<StorePage page="returns" draft onBrowse={()=>{}}/>);await expect.poll(()=>host.textContent).toContain('Pre-launch draft');expect(host.textContent).toContain('30 calendar days');expect(host.textContent).toContain('[APPROVED RETURN MAILING DEADLINE REQUIRED]');expect(host.querySelector('a[href="mailto:midohiomx@gmail.com"]')).not.toBeNull();
});
test('shipment review renders unresolved calendar/refund warnings and records expired cancellation without sending anything',async()=>{
 const act=vi.fn();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);root.render(<ShippingCompliance order={{orderNumber:'QA',shippingReview:{status:'calendar_unconfirmed'}}} act={act}/>);await expect.element(page.getByRole('alert')).toHaveTextContent('Owner-approved calendar');
 root.render(<ShippingCompliance order={{orderNumber:'QA',version:2,shippingReview:{status:'cancel_refund_due'}}} act={act}/>);await page.getByRole('button',{name:'Cancel unshipped merchandise and flag refund'}).click();expect(act).not.toHaveBeenCalled();confirm.mockReturnValue(true);await page.getByRole('button',{name:'Cancel unshipped merchandise and flag refund'}).click();expect(act.mock.calls[0][0]).toEqual({action:'shipping-delay',orderNumber:'QA',expectedVersion:2,operation:'review',confirmed:true});
 root.render(<ShippingCompliance order={{orderNumber:'QA',shippingReview:{status:'refund_required'}}} act={act}/>);await expect.element(page.getByRole('alert')).toHaveTextContent('not proof of a refund');
 root.render(<ShippingCompliance order={{orderNumber:'QA'}} act={act}/>);await expect.poll(()=>host.textContent).toBe('');
});
test('admin forms distinguish preparing a notice from recording actual sending and explicit customer consent',async()=>{
 const act=vi.fn();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);const order={orderNumber:'QA',shippingTimeZone:'America/New_York',shippingReview:{status:'upcoming',dueDate:'2026-10-15'}};
 root.render(<ShippingCompliance order={order} act={act}/>);await page.getByText('Record a delay notice already sent',{exact:true}).click();
 await page.getByLabelText('Reason to explain to the customer').fill('Material delay');await page.getByLabelText('Verified supply/capacity basis for the revised date').fill('Confirmed replacement supply');await page.getByLabelText('Proposed carrier handoff date').fill('2026-10-16');await page.getByLabelText('Notice actually sent at').fill('2026-10-13T10:00');await page.getByLabelText('Customer reply deadline').fill('2026-10-14T10:00');await page.getByLabelText('Sent message reference (not customer credentials)').fill('manual-id');
 await page.getByRole('checkbox').click();await page.getByRole('button',{name:'Record sent delay notice'}).click();expect(act.mock.calls[0][0]).toMatchObject({operation:'notice',expectedVersion:0,confirmed:true,reference:'manual-id'});expect(act.mock.calls[0][0].noticeText).toContain('silence as consent');
 root.render(<ShippingCompliance order={{...order,version:1,shippingReview:{status:'awaiting_consent'},shippingDelay:{status:'awaiting_consent',revisedShipDate:'2026-10-16',replyBy:'2026-10-14T14:00:00Z'}}} act={act}/>);
 await page.getByLabelText('Customer decision').selectOptions('cancel');await page.getByLabelText('Customer reply received at').fill('2026-10-13T11:00');await page.getByLabelText('Customer reply message reference').fill('actual-reply');await page.getByRole('button',{name:'Record customer reply'}).click();expect(act).toHaveBeenCalledTimes(1);confirm.mockReturnValue(true);await page.getByRole('button',{name:'Record customer reply'}).click();expect(act.mock.calls[1][0]).toMatchObject({operation:'response',decision:'cancel',reference:'actual-reply',expectedVersion:1,confirmed:true});
});
