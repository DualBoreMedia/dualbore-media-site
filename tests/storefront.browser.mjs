// Playwright API regression flow. Run against LOCAL commerce mode only.
// The Codex browser supplies page=tab.playwright, navigate=tab.goto,
// reload=tab.reload. A standard Playwright Page supports the same API surface.
// No requests to Stripe, Resend or a production site are made by this suite.
export async function runStorefrontBrowserChecks({page,navigate,reload,baseUrl}) {
  if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl))throw new Error('Browser checks require a loopback commerce preview.');
  const passed=[];
  const expect=(value,message)=>{if(!value)throw new Error(message);};
  const estimate=async()=>{await page.getByRole('button',{name:'Check server estimate',exact:true}).click();await page.locator('.quote-success, .cart-estimate .price-review, .cart-scroll > .form-error').waitFor({state:'visible'});};
  const drawerText=()=>page.getByRole('dialog').innerText();
  const close=()=>page.getByRole('button',{name:'Close test cart',exact:true}).press('Escape');
  const fixture=async id=>{
    if(await page.locator('details.fixture-tools').getAttribute('open')===null)await page.locator('summary').filter({hasText:'Store test controls'}).click();
    await page.getByRole('combobox',{name:'Commerce scenario',exact:true}).selectOption(id);
  };
  await navigate(`${baseUrl}/#merch`);
  await fixture('empty-cart');
  const first=page.getByRole('article').filter({has:page.getByRole('heading',{name:'E92 Coupe Line-Art Tee',exact:true})});
  await first.getByRole('button',{name:'E92 Coupe Line-Art Tee, size M',exact:true}).click();
  await first.getByRole('button',{name:'Add to test cart',exact:true}).click();
  expect(await page.getByRole('dialog').count()===0,'Adding an item must not force open a drawer.');
  await page.getByRole('button',{name:'Open test cart, 1 items',exact:true}).click();
  await page.getByRole('combobox',{name:'Edit size for E92 Coupe Line-Art Tee, M',exact:true}).selectOption('L');
  await page.getByRole('button',{name:'Increase E92 Coupe Line-Art Tee, L',exact:true}).click();
  await estimate();
  expect((await drawerText()).includes('$67.00'),'Server estimate must be $60 plus $7 shipping.');
  passed.push('add without interrupting shopping, edit size, quantity stepper, trusted estimate');
  await reload();
  await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).click();
  await close();
  expect(await page.evaluate(()=>document.activeElement.getAttribute('aria-label'))==='Open test cart, 2 items','Escape must restore focus to the cart trigger.');
  await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Remove E92 Coupe Line-Art Tee, L',exact:true}).click();
  expect((await drawerText()).includes('ROOM FOR GARAGE GEAR.'),'Removing the final item must show the empty state.');
  await close();passed.push('refresh persistence, keyboard open/close, focus restoration, remove/empty');
  await fixture('changed-price');
  await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).click();
  await estimate();
  expect((await drawerText()).includes('A TEST PRICE CHANGED.'),'A changed price must require review.');
  await page.getByRole('button',{name:'Accept updated test prices',exact:true}).click();
  expect((await drawerText()).includes('$70.00'),'Accepted $35 test prices must update the subtotal.');
  await close();passed.push('explicit changed-price acceptance');
  for(const [id,expected] of [['sold-out','unavailable in this demo'],['stale-cart','No longer available (demo)'],['network-failure','Estimate service unavailable.'],['shipping-error','Shipping estimate unavailable.'],['tax-error','Tax estimate unavailable.']]){
    await fixture(id);await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).click();await estimate();expect((await drawerText()).includes(expected),`Missing ${id} error.`);expect((await drawerText()).includes('No order was created.'),'Failure must not fabricate success.');await close();passed.push(id);
  }
  await fixture('low-stock');await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).click();await page.getByRole('button',{name:'Increase E92 Coupe Line-Art Tee, M',exact:true}).click();expect(!(await page.getByRole('button',{name:'Increase E92 Coupe Line-Art Tee, M',exact:true}).isEnabled()),'Demo stock limit must disable increasing past two.');await close();passed.push('low-stock bound');
  await fixture('in-stock');
  for(const path of ['privacy','terms','shipping','returns','contact']){await navigate(`${baseUrl}/${path}`);expect((await page.getByRole('main').innerText()).includes('not an approved customer policy'),'Policy pages must be conspicuous drafts.');expect(await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).count()===1,'Policy navigation must preserve the cart.');}
  passed.push('all five policy routes and cart preservation');
  for(const state of ['pending','success','cancel']){await navigate(`${baseUrl}/order/${state}`);expect((await page.getByRole('main').innerText()).toLowerCase().includes('demo only'),'Order fixtures must disclose simulation.');expect(await page.getByRole('button',{name:'Open test cart, 2 items',exact:true}).count()===1,'An unverified order screen must never clear the cart.');}
  passed.push('pending/success/cancel fixtures never clear cart');
  await page.getByRole('button',{name:'Back to Drop 01',exact:true}).click();
  await page.getByRole('textbox',{name:'Get the first-drop details.',exact:true}).fill('local-test@example.invalid');await page.getByRole('button',{name:'Continue to Drop 01 signup',exact:true}).click();
  expect(await page.getByRole('textbox',{name:'Email address',exact:true}).evaluate(element=>element.value.length>0&&element.type==='email'),'Footer signup must prefill the existing email consent form.');
  expect(await page.getByRole('checkbox').evaluate(element=>!element.checked&&element.required),'Waitlist consent must be explicit, never preselected.');await page.getByRole('button',{name:'Close details',exact:true}).press('Escape');passed.push('footer email handoff, explicit consent, no signup submission');
  return passed;
}

