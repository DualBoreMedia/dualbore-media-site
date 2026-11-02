import {expect} from '@playwright/test';
import {publicProducts} from '../netlify/operations/products.mjs';
export async function runProductsBrowserChecks({page,baseUrl,publicBaseUrl,service,principal,repository,evidenceDirectory}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/operations*',async route=>{try{const r=route.request();const data=r.method()==='POST'?await service.mutate(principal,r.postDataJSON()):await service.read(principal,{admin:true});await route.fulfill({json:data});}catch(e){await route.fulfill({status:e.status||503,json:{code:e.code,error:e.message}});}});
 await page.route('**/api/products',async route=>route.fulfill({json:{products:await repository.transaction(publicProducts)}}));
 await page.goto(baseUrl+'/__qa/admin');await page.getByRole('button',{name:'Products',exact:true}).click();await page.getByRole('button',{name:'Create Product',exact:true}).press('Enter');
 await page.getByLabel('Product name',{exact:true}).fill('QA synthetic merchandise');await page.getByLabel('Product SKU').fill('QA-BROWSER');await page.getByLabel('Category',{exact:true}).fill('QA category');await page.getByLabel('Audience classification').fill('QA audience');await page.getByLabel('Planned USD price').fill('30');await page.getByLabel('Description',{exact:true}).fill('Synthetic browser fixture. Not a real product.');await page.getByLabel('Fulfillment method').selectOption('made_to_order');await page.getByLabel(/Approved images/).fill('/assets/IMG_5076.jpg');await page.getByLabel(/Approved sizes/).fill('M, L');
 await page.getByRole('button',{name:'Save Draft',exact:true}).press('Enter');await expect(page.getByText('Product saved. No payment or email settings changed.')).toBeVisible();
 const viewports=[];
 for(const width of [320,375,390,414,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Preview',exact:true}).press('Enter');await expect(page.getByText('PRIVATE DRAFT PREVIEW / NOT AN ORDER PAGE')).toBeVisible();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Product manager overflow at '+width);
  await page.screenshot({path:`${evidenceDirectory}/products-admin-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Back to editor'}).press('Enter');viewports.push({width,pass:true});
 }
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Publish',exact:true}).press('Enter');await expect(page.getByText('Listing published. Orders and email collection remain paused.')).toBeVisible();
 await page.goto(publicBaseUrl+'/#merch');await page.getByLabel('Category',{exact:true}).selectOption('QA category');await expect(page.getByRole('heading',{name:'QA synthetic merchandise',exact:true})).toBeVisible();await expect(page.getByText('1 of 4 designs',{exact:true})).toBeVisible();await page.getByLabel('Gender / age',{exact:true}).selectOption('QA audience');await page.getByLabel('Sort by').selectOption('price-low');await page.getByRole('button',{name:'Quick View QA synthetic merchandise'}).press('Enter');await expect(page.getByRole('dialog')).toContainText('No orders or payments are being accepted.');await page.screenshot({path:`${evidenceDirectory}/products-public-preview.png`,fullPage:false});await page.keyboard.press('Escape');
 await page.goto(baseUrl+'/__qa/admin');await page.getByRole('button',{name:'Products',exact:true}).click();await page.getByRole('button',{name:/QA synthetic merchandise/}).click();await page.getByRole('button',{name:'Unpublish',exact:true}).press('Enter');await expect.poll(()=>repository.transaction(s=>publicProducts(s).length)).toBe(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Archive',exact:true}).click();await expect(page.getByRole('button',{name:'Save Draft'})).toBeDisabled();
 if(errors.length)throw Error(errors.join('\n'));
 return {viewports,pass:true,method:'Rendered browser with real product service, isolated memory persistence and injected Admin identity; PostgreSQL tested separately.',errors};
}
