// Rendered fixtures only: this never contacts payment, email or auth providers.
export async function runMadeToOrderBrowserChecks({page,baseUrl,evidenceDirectory,adminPreviewPath}) {
  if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl))throw Error('Made-to-order QA requires a local preview.');
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const variants=['S','M','L','XL','2XL'].map(size=>({id:'e92-tee-'+size.toLowerCase(),productId:'e92-tee',name:'E92 Coupe Line-Art Tee',size,unitAmount:3000,inventoryPolicy:'made_to_order',availableQuantity:null,available:size!=='XL'}));
  const stocked={id:'e90-crewneck-m',productId:'e90-crewneck',name:'E90 Sedan Front-Clip Crewneck',size:'M',unitAmount:5000,availableQuantity:0,available:false};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/commerce/catalog',route=>route.fulfill({json:{enabled:true,mode:'production',shippingCents:995,variants:[...variants,stocked]}}));
  const results=[];
  for(const width of [320,375,390,414,768,1024,1440]) {
    await page.setViewportSize({width,height:900});await page.goto(baseUrl+'/shop');
    await page.getByRole('heading',{name:'Wear the garage.',exact:true}).waitFor();
    assert(page.url()===baseUrl+'/shop','Wrong shop URL');
    assert((await page.title()).includes('DualBore Media'),'Wrong title');
    const first=page.getByRole('article').first();
    await first.getByRole('button',{name:'XL',exact:true}).press('Enter');
    assert(await first.getByRole('button',{name:'Orders paused',exact:true}).isDisabled(),'Paused MTO must not imply sold out.');
    await first.getByRole('button',{name:'M',exact:true}).press('Enter');
    await first.getByRole('button',{name:'Add to cart',exact:true}).press('Enter');
    assert((await first.innerText()).includes('Ships within 5 business days'),'Processing promise missing');
    assert(await first.getByRole('link',{name:'Returns and size exchanges'}).getAttribute('href')==='/returns','Product policy missing');
    const stockedCard=page.getByRole('article').nth(1);
    await stockedCard.getByRole('button',{name:'M',exact:true}).click();
    assert(await stockedCard.getByRole('button',{name:'Sold out',exact:true}).isDisabled(),'Finite stocked fallback changed');
    const cart=page.getByRole('button',{name:/^Cart \(/});await cart.press('Enter');
    const dialog=page.getByRole('dialog');
    assert((await dialog.innerText()).includes('Made to order'),'Cart MTO label missing');
    assert((await dialog.innerText()).includes('No change-of-mind returns or refunds.'),'Cart return notice missing');
    assert((await dialog.innerText()).includes('You pay both return and replacement shipping.'),'Cart exchange notice missing');
    assert((await dialog.innerText()).includes('$9.95'),'Approved shipping fallback missing');
    assert(await dialog.getByRole('link',{name:'Returns and size exchanges'}).getAttribute('href')==='/returns','Checkout-adjacent policy missing');
    assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Horizontal overflow '+width);
    assert(await page.locator('vite-error-overlay').count()===0,'Framework overlay');
    if(evidenceDirectory)await page.screenshot({path:evidenceDirectory+'/mto-cart-'+width+'.png',fullPage:true});
    await dialog.getByRole('button',{name:'Close cart',exact:true}).press('Escape');
    assert(!(await dialog.isVisible()),'Escape failed');
    assert(await cart.evaluate(element=>element===document.activeElement),'Cart focus not restored');
    await page.evaluate(()=>localStorage.removeItem('dbm-store-cart-v1'));
    results.push({width,flow:'keyboard size/add/cart/Escape, made-to-order policies, finite-stock fallback',pass:true});
  }
  if(adminPreviewPath){
    const calls=[],data={profile:{},orders:[],overview:{},audit:[],failures:[],variants:[{...variants[1],sku:'DBM-E92-TEE-M',active:true,reservedQuantity:2,soldQuantity:7,version:1}]};
    await page.route('**/api/operations*',async route=>{if(route.request().method()==='POST')calls.push(route.request().postDataJSON());await route.fulfill({json:data});});
    await page.goto(baseUrl+adminPreviewPath);await page.getByRole('button',{name:'Inventory',exact:true}).click();
    await page.getByRole('heading',{name:'E92 Coupe Line-Art Tee',exact:true}).waitFor();
    assert(await page.getByLabel('Available',{exact:true}).count()===0,'MTO must not expose finite-stock input');
    assert((await page.locator('.ops-inventory-list').innerText()).includes('Pending units 2 | Paid units 7'),'Order counters missing');
    await page.getByLabel('Adjustment reason',{exact:true}).fill('Pause made-to-order production');
    await page.getByLabel('Active',{exact:true}).uncheck();page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Inventory updated.'}).waitFor();
    assert(calls[0]?.availableQuantity===0&&calls[0]?.active===false,'MTO activation edit must send neutral finite count');
    if(evidenceDirectory)await page.screenshot({path:evidenceDirectory+'/mto-admin-1440.png',fullPage:true});
    results.push({flow:'admin made-to-order counters and activation edit',pass:true});
  }
  assert(errors.length===0,errors.join('\n'));return {method:'Rendered local frontend with API fixtures, no real provider activation',results,errors};
}
