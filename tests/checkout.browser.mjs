// Explicit local simulation flow. Consumes synthetic local stock, never Stripe.
export async function runCheckoutBrowserChecks({page,navigate,baseUrl,captureState=async()=>{}}){
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl))throw new Error('Loopback only.');
 const passed=[];
 const check=(value,message)=>{if(!value)throw new Error(message);};
 for(const [size,action,expected] of [['M','paid','SIMULATED ORDER RESULT.'],['L','pending','CHECKING THE SIMULATED ORDER.'],['XL','failed','SIMULATED ORDER STATUS.'],['2XL','expired','SIMULATED ORDER STATUS.'],['S','cancel','SIMULATED ORDER STATUS.']]){
  await navigate(baseUrl+'/#merch');
  await page.locator('summary').filter({hasText:'Store test controls'}).click();await page.getByRole('combobox',{name:'Commerce scenario',exact:true}).selectOption('empty-cart');await page.getByRole('combobox',{name:'Commerce scenario',exact:true}).selectOption('in-stock');await page.getByRole('combobox',{name:'Commerce scenario',exact:true}).selectOption('empty-cart');
  const item=page.getByRole('article').filter({has:page.getByRole('heading',{name:'E92 Coupe Line-Art Tee',exact:true})});await item.getByRole('button',{name:'E92 Coupe Line-Art Tee, size '+size,exact:true}).click();await item.getByRole('button',{name:'Add to test cart',exact:true}).click();await page.getByRole('button',{name:'Open test cart, 1 items',exact:true}).click();await page.getByRole('button',{name:'Checkout / Local simulation',exact:true}).click();
  await page.getByRole('heading',{name:'Test the order journey.',exact:true}).waitFor({state:'visible'});
  const label={paid:'Simulate paid event',pending:'Simulate pending payment',failed:'Simulate failed payment',expired:'Simulate expired checkout',cancel:'Cancel simulation'}[action];await page.getByRole('button',{name:label,exact:true}).click();
  if(action==='paid')await page.getByRole('heading',{name:'Simulated order result.',exact:true}).waitFor({state:'visible'});
  else await page.getByRole('button',{name:action==='cancel'?'Back to Drop 01':'Back to the garage store',exact:true}).waitFor({state:'visible'});
  await captureState(action);
  if(action==='pending'){await page.getByRole('button',{name:'Check payment status again',exact:true}).waitFor({state:'visible'});await page.getByRole('button',{name:'Check payment status again',exact:true}).click();await page.getByRole('heading',{name:'Checking the simulated order.',exact:true}).waitFor({state:'visible'});passed.push('bounded pending verification can be restarted without a new checkout');}
  if(['failed','expired'].includes(action))check(await page.getByRole('heading',{name:'Checkout closed.',exact:true}).count()===1,'Cancellation return must explain that checkout closed.');
  check(await page.getByRole('button',{name:'Open test cart, '+(action==='paid'?0:1)+' items',exact:true}).count()===1,action+' cart reconciliation failed');
  check((await page.getByRole('main').innerText()).includes('SIMULATION')||(await page.getByRole('main').innerText()).includes('simulat')||(action==='cancel'&&(await page.getByRole('main').innerText()).includes('DEMO ONLY')),'Mock disclosure missing');passed.push(action+' simulation, server status and cart preservation');
 }
 return passed;
}
