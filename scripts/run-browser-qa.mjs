import {chromium, firefox, webkit} from '@playwright/test';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createMemoryRepository} from '../netlify/commerce/memory-repository.mjs';
import {createOperationsService} from '../netlify/operations/service.mjs';
import {runStaffBrowserChecks} from '../tests/staff.browser.mjs';
import {runMadeToOrderBrowserChecks} from '../tests/made-to-order.browser.mjs';

// Provider-boundary fixtures only. This suite proves rendered permissions,
// interactions and data minimization, not real hosted authentication or payment.
const output = resolve('test-results/browser');
const fixtures = 'test-results/browser-fixtures';
await mkdir(output, {recursive: true});
await mkdir(fixtures, {recursive: true});
const auth = `const auth={isLoaded:true,isSignedIn:true,getToken:async()=> 'synthetic-test-token',signOut:()=>{},user:{}};`;
for (const [name, component, extra] of [['staff', 'StaffApp', ''], ['admin', 'OperationsApp', 'admin={true}']]) {
  await writeFile(`${fixtures}/${name}.jsx`, `import React from 'react';import {createRoot} from 'react-dom/client';import '../../src/styles.css';import App from '../../src/operations/${component}.jsx';${auth}createRoot(document.getElementById('root')).render(<App ${extra} auth={auth}/>);`);
}
await writeFile(`${fixtures}/error-boundary.jsx`, `import React from 'react';import {createRoot} from 'react-dom/client';import '../../src/styles.css';import {ErrorBoundary} from '../../src/observability/ErrorBoundary.jsx';import {configureBrowserMonitoring} from '../../src/observability/client.js';window.__qaMonitoring={calls:0,tags:null};const sdk={init:()=>{},withScope:callback=>callback({setTags:tags=>window.__qaMonitoring.tags=tags}),captureException:()=>window.__qaMonitoring.calls++};configureBrowserMonitoring(sdk,{dsn:'https://synthetic@example.invalid/1',enabled:true,release:'synthetic-browser',environment:'test'});function Broken(){throw new Error('DBM_SYNTHETIC_BOUNDARY_EXCEPTION customer-sensitive-fixture');}createRoot(document.getElementById('root')).render(<ErrorBoundary><Broken/></ErrorBoundary>);`);
const server = await createServer({
  configFile: false, mode: 'test',
  define: {__APP_RELEASE__: JSON.stringify('synthetic-browser'), __APP_ENVIRONMENT__: JSON.stringify('test')},
  server: {host: '127.0.0.1', port: Number(process.env.QA_PORT || 4197), strictPort: true, watch: null},
  plugins: [react(), {name: 'synthetic-browser-fixtures', configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      const name = request.url === '/.tools/operations-qa/staff.html' ? 'staff' : request.url === '/__qa/admin' ? 'admin' : request.url === '/__qa/error-boundary' ? 'error-boundary' : null;
      if (!name) return next();
      const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/${fixtures}/${name}.jsx"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  }}],
});
await server.listen();
const address = server.httpServer.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const names = (process.env.QA_BROWSERS || 'chromium,firefox,webkit').split(',');
const results = [];
try {
  for (const name of names) {
    const launcher = {chromium, firefox, webkit}[name];
    if (!launcher) throw Error('Unknown QA browser');
    let browser;
    try {browser = await launcher.launch({headless: true, ...(name === 'chromium' && process.env.QA_CHROMIUM_EXECUTABLE ? {executablePath: process.env.QA_CHROMIUM_EXECUTABLE} : {})});}
    catch (error) {results.push({browser: name, status: 'blocked', error: String(error.message)}); process.exitCode = 1; continue;}
    const context = await browser.newContext();
    const consoleIssues = [];
    const expectedConsole = [];
    context.on('page', opened => opened.on('console', message => {
      if (!['warning', 'error'].includes(message.type())) return;
      const entry = {level: message.type(), text: message.text(), url: message.location().url};
      // runStaffBrowserChecks deliberately revokes access and asserts the 404
      // clears sensitive UI. This expected denial is retained, not hidden.
      if (opened.url() === baseUrl + '/__qa/error-boundary' && /DBM_SYNTHETIC_BOUNDARY_EXCEPTION|error occurred in the <Broken>|recreate this component tree/i.test(entry.text)) expectedConsole.push({...entry, reason: 'Deliberate synthetic render exception'});
      else if (entry.text.includes('404') && /^http:\/\/127\.0\.0\.1:\d+\/api\/operations/.test(entry.url)) expectedConsole.push({...entry, reason: 'Verified revoked-access denial'});
      else consoleIssues.push(entry);
    }));
    await context.tracing.start({screenshots: true, snapshots: true, sources: false});
    let page;
    try {
      const principal = {role: 'employee', mfa: true, mfaEnrolled: true, userId: 'user_qa', email: 'staff@example.invalid', sessionId: 'qa'};
      const repository = createMemoryRepository({
        orders: {o: {id: 'o', orderNumber: 'DBM-QA', status: 'paid', fulfillmentStatus: 'received', createdAt: '2026-10-15T12:00:00Z', shippingName: '<script>Example recipient</script>', shippingAddress: {line1: '1 <b>Test</b> St', city: 'Example', state: 'OH', postal_code: '00000', country: 'US'}, version: 0, totalCents: 11000, items: [{variantId: 'tee-m', name: 'E92 Tee', size: 'M', quantity: 2}, {variantId: 'crew-l', name: 'Crewneck', size: 'L', quantity: 1}]}},
        shipments: {a: {id: 'a', orderId: 'o', packageNumber: 'PKG-A', status: 'draft', version: 0, carrier: 'USPS', service: 'Ground', trackingNumber: 'TEST001', trackingUrl: 'https://tools.usps.com/go/TrackConfirmAction', items: [{variantId: 'tee-m', quantity: 1}]}, b: {id: 'b', orderId: 'o', packageNumber: 'PKG-B', status: 'draft', version: 0, items: [{variantId: 'tee-m', quantity: 1}, {variantId: 'crew-l', quantity: 1}]}},
        shipmentItems: {a: {id: 'a', shipmentId: 'a', variantId: 'tee-m', quantity: 1}, b: {id: 'b', shipmentId: 'b', variantId: 'tee-m', quantity: 1}, c: {id: 'c', shipmentId: 'b', variantId: 'crew-l', quantity: 1}},
      });
      page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
      const staff = await runStaffBrowserChecks({page, baseUrl, service: createOperationsService({repository, send: async () => {}}), principal});
      staff.method = `Rendered ${name}, real operations service with memory repository and injected principal; real hosted authentication/MFA not verified`;
      page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(30000);
      const storefront = await runMadeToOrderBrowserChecks({page, baseUrl, adminPreviewPath: '/__qa/admin'});
      await page.screenshot({path: `${output}/${name}-success.png`, fullPage: true});
      page = await context.newPage();
      await page.goto(baseUrl + '/__qa/error-boundary');
      await page.getByRole('heading', {name: 'The garage hit a snag', exact: true}).waitFor();
      const safeText = await page.locator('body').innerText();
      if (/DBM_SYNTHETIC_BOUNDARY_EXCEPTION|customer-sensitive-fixture|\.jsx:\d/.test(safeText)) throw Error('Error boundary exposed internal exception details');
      if (!/Reference: [0-9a-f-]{36}/i.test(safeText)) throw Error('Customer-safe error reference missing');
      const monitoring = await page.evaluate(() => window.__qaMonitoring);
      if (monitoring.calls !== 1 || !monitoring.tags?.requestId || !safeText.includes(monitoring.tags.requestId)) throw Error('Error boundary did not correlate reporter fixture with customer reference');
      await page.getByRole('button', {name: 'Reload the garage', exact: true}).focus();
      if (!await page.getByRole('button', {name: 'Reload the garage', exact: true}).evaluate(element => element === document.activeElement)) throw Error('Error fallback control not keyboard accessible');
      await page.screenshot({path: `${output}/${name}-error-boundary.png`, fullPage: true});
      if (consoleIssues.length) throw Error('Unexplained browser console warnings/errors: ' + consoleIssues.map(issue => issue.text).join('\n'));
      results.push({browser: name, status: 'passed', staff, storefront, errorBoundary: {safeFallback: true, referenceCorrelatedWithReporterFixture: true, actualMonitoringDelivery: false}, consoleIssues, expectedConsole});
      await context.tracing.stop();
    } catch (error) {
      if (page) await page.screenshot({path: `${output}/${name}-failure.png`, fullPage: true}).catch(() => {});
      await context.tracing.stop({path: `${output}/${name}-trace.zip`});
      const focus = page ? await page.evaluate(() => ({tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0, 100)})).catch(() => null) : null;
      results.push({browser: name, status: 'failed', error: String(error.message), focus});
      process.exitCode = 1;
    } finally {await browser.close();}
  }
} catch (error) {
  results.push({status: 'blocked', error: String(error.message)}); process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({baseUrl, providerEvidence: false, results}, null, 2));
  for (const result of results) if (result.browser) await writeFile(`${output}/${result.browser}-results.json`, JSON.stringify(result, null, 2));
  await writeFile(`${output}/index.html`, `<!doctype html><meta charset="utf-8"><title>DualBore browser QA</title><h1>Synthetic local browser QA</h1><p>Real provider enrollment/payment are not verified here.</p><pre>${JSON.stringify(results, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`);
  await server.close();
}
console.log(JSON.stringify(results.map(({browser, status}) => ({browser, status})), null, 2));
