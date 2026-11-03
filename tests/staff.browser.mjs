// Called by the local QA runner with its existing browser. Provider authentication
// is deliberately not simulated as evidence of real Clerk enrollment or MFA.
export async function runStaffBrowserChecks({page,baseUrl,evidenceDirectory,service,principal}) {
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl))throw Error('Local QA only.');
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let revoked=false;
 await page.route('**/api/operations*',async route=>{
  if(revoked)return route.fulfill({status:404,json:{code:'staff_required',error:'Not found.'}});
  try{const request=route.request();const query=Object.fromEntries(new URL(request.url()).searchParams);
   const data=request.method()==='POST'?await service.mutate(principal,request.postDataJSON()):await service.read(principal,{...query,staff:query.staff==='true',admin:query.admin==='true'});
   await route.fulfill({json:data});
  }catch(error){await route.fulfill({status:error.status||503,json:{code:error.code,error:error.message}});}
 });
 const results=[],focusTransitions=[];
 for(const width of [320,375,390,414,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto(baseUrl+'/.tools/operations-qa/staff.html');
  await page.getByRole('heading',{name:'Fulfillment workspace',exact:true}).waitFor();
  assert((await page.title())==='Staff | DualBore Media','Staff page title');
  assert(await page.getByRole('link',{name:'Administration',exact:true}).count()===0,'Employee saw admin navigation');
  await page.getByRole('button',{name:/DBM-QA/}).press('Enter');
  await page.getByRole('heading',{name:'DBM-QA',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.tagName==='H2'&&document.activeElement.textContent==='DBM-QA');
  assert(await page.getByText('Payment reference',{exact:true}).count()===0,'Payment details in employee UI');
  assert(await page.getByRole('button',{name:/refund/i}).count()===0,'Refund control in employee UI');
  const preview=page.getByRole('button',{name:'Preview package PKG-A slip',exact:true});await preview.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Packing slip preview'});await dialog.waitFor();
  assert((await dialog.innerText()).includes('PKG-A'),'Package reference missing');
  await page.waitForFunction(()=>document.activeElement?.matches('.packing-preview h1'));
  const beforeTab=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent}));
  await page.keyboard.press('Tab');
  const afterTab=await page.evaluate(()=>({tag:document.activeElement.tagName,text:document.activeElement.textContent}));
  focusTransitions.push({width,beforeTab,afterTab});
  assert(await dialog.getByRole('button',{name:'Back to order'}).evaluate(e=>e===document.activeElement),'Initial heading focus escaped on Tab');
  assert(!(await dialog.innerText()).includes('Crewneck'),'Other package item leaked');
  assert(!(await dialog.innerText()).includes('$'),'Packing slip contains prices');
  assert(await dialog.locator('script,img').count()===0,'Customer markup executed');
  await dialog.getByRole('button',{name:'Print packing slip',exact:true}).focus();
  await page.keyboard.press('Tab');assert(await dialog.getByRole('button',{name:'Back to order'}).evaluate(e=>e===document.activeElement),'Dialog focus escaped');
  if(evidenceDirectory){await page.screenshot({path:evidenceDirectory+'/staff-slip-'+width+'.png',fullPage:true});if(width===1440)await page.pdf({path:evidenceDirectory+'/packing-slip-letter.pdf',format:'Letter',printBackground:true,preferCSSPageSize:true});}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.textContent?.startsWith('Preview package PKG-A slip'));
  assert(await preview.evaluate(e=>e===document.activeElement),'Packing preview focus not restored');
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Staff overflow at '+width);
  if(evidenceDirectory)await page.screenshot({path:evidenceDirectory+'/staff-'+width+'.png',fullPage:true});
  assert(await page.locator('vite-error-overlay').count()===0,'Framework overlay');
  results.push({width,pass:true,flow:'keyboard order lookup, package slip, focus loop, Escape and restored order'});
 }
 await page.getByRole('combobox',{name:/Next status/}).selectOption('making');await page.getByRole('button',{name:'Update status',exact:true}).press('Enter');
 await page.getByRole('status').filter({hasText:'Order status updated.'}).waitFor();
 const changed=await service.read(principal,{staff:true,orderNumber:'DBM-QA'});assert(changed.orders[0].fulfillmentStatus==='making','UI did not update actual service state');
 revoked=true;await page.getByRole('button',{name:'Preview whole-order packing slip'}).click();await page.getByRole('heading',{name:'Page unavailable',exact:true}).waitFor();
 assert(!(await page.locator('body').innerText()).includes('1 <b>Test</b> St'),'Revoked access retained customer address');
 assert(errors.length===0,errors.join('\n'));return {results,errors,focusTransitions,method:'Rendered browser, real operations service with memory repository and injected server principal; real hosted authentication/MFA not verified'};
}

export async function runStaffManagementBrowserChecks({page,baseUrl,evidenceDirectory,management,service,principal,confirmProviderOutcome}){
 if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl))throw Error('Local QA only.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/operations*',async route=>{
  const request=route.request(),query=Object.fromEntries(new URL(request.url()).searchParams);
  try{await route.fulfill({json:request.method()==='POST'?await management.mutate(principal,request.postDataJSON()):query.staffManagement==='true'?await management.read(principal):await service.read(principal,{staff:true})});}
  catch(error){await route.fulfill({status:error.status||503,json:{code:error.code,error:error.message}});}
 });
 await page.setViewportSize({width:390,height:900});await page.goto(baseUrl+'/.tools/operations-qa/staff.html');
 await page.getByRole('button',{name:'Employees',exact:true}).click();
 await page.getByRole('heading',{name:'Provider review required',exact:true}).waitFor();
 await page.getByLabel('Provider review notes',{exact:true}).fill('Reviewed provider account and intended outcome.');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Verify provider outcome',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'This staff change needs an authentication-provider review'}).waitFor();
 await confirmProviderOutcome();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Verify provider outcome',exact:true}).click();
 await page.getByRole('heading',{name:'Provider review required',exact:true}).waitFor({state:'hidden'});
 if(await page.getByRole('alert').count())throw Error('Resolved error did not clear.');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Recovery UI overflows.');
 if(errors.length)throw Error(errors.join('\n'));
 if(evidenceDirectory)await page.screenshot({path:evidenceDirectory+'/staff-reconciliation-390.png',fullPage:true});
 return {pass:true,method:'Rendered recovery controls with real management service and injected provider fixture, no real Clerk mutation'};
}
