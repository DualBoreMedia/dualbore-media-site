import {chromium, firefox, webkit} from '@playwright/test';
import {createServer, preview} from 'vite';
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
const publicPreview = await preview({preview: {host: '127.0.0.1', port: Number(process.env.PUBLIC_QA_PORT || 4198), strictPort: true}});
const publicAddress = publicPreview.httpServer.address();
const publicBaseUrl = `http://127.0.0.1:${publicAddress.port}`;
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
      const html = await vite.transformIndexHtml(request.url, `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="/assets/favicon.svg"></head><body style="margin:0"><div id="root"></div><script type="module" src="/${fixtures}/${name}.jsx"></script></body></html>`);
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
      const publicPage = await context.newPage();
      publicPage.setDefaultTimeout(10000);
      const viewportResults = [];
      for (const width of [320, 375, 390, 414, 768, 1024, 1440]) {
        await publicPage.setViewportSize({width, height: 900});
        const response = await publicPage.goto(`${publicBaseUrl}/`);
        if (!response?.ok()) throw Error(`Public site returned ${response?.status()} at ${width}px`);
        await publicPage.getByRole('heading', {name: /Four platforms/}).waitFor();
        if (!/DualBore Media \| Garage Builds, Films & Merch/.test(await publicPage.title())) throw Error('Public site page title is incorrect');
        const layout = await publicPage.evaluate(() => ({width: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth}));
        if (layout.documentWidth > width || layout.bodyWidth > width) throw Error(`Public site overflows horizontally at ${width}px: ${JSON.stringify(layout)}`);
        const visualAssets = await publicPage.evaluate(async () => {
          await document.fonts.ready;
          const visibleImages = [...document.images].filter(image => image.getClientRects().length > 0);
          return {visibleImages: visibleImages.length, brokenVisibleImages: visibleImages.filter(image => image.complete && image.naturalWidth === 0).map(image => image.currentSrc || image.src), interLoaded: document.fonts.check('400 14px Inter'), tekoLoaded: document.fonts.check('600 24px Teko')};
        });
        if (visualAssets.brokenVisibleImages.length) throw Error(`Visible public images failed at ${width}px: ${visualAssets.brokenVisibleImages.join(', ')}`);
        viewportResults.push({width, identity: await publicPage.title(), layout, visualAssets});
        if ([375, 1440].includes(width)) await publicPage.screenshot({path: `${output}/${name}-public-${width}.png`, fullPage: true});
        if (width === 390) {
          await publicPage.getByRole('tab').filter({hasText: 'Video Vault'}).click();
          await publicPage.getByRole('tab').filter({hasText: 'Garage Merch'}).click();
          await publicPage.getByText(/Orders aren’t open yet/).waitFor();
          await publicPage.getByRole('button', {name: /Join Drop Alert for E92/}).click();
          await publicPage.getByText(/signups are not open yet/i).waitFor();
          if (await publicPage.getByRole('dialog').locator('form').count()) throw Error('Public Drop Alert collected personal information while privacy readiness is blocked');
          await publicPage.keyboard.press('Escape');
          for (const route of ['shipping', 'returns', 'privacy', 'terms', 'contact']) {
            await publicPage.goto(`${publicBaseUrl}/${route}`);
            await publicPage.locator('main').getByRole('heading').first().waitFor();
            const copy = await publicPage.locator('main').innerText();
            if (/\[(?:VERIFIED|POLICY|CARRIER)|draft for review|not an approved customer policy/i.test(copy)) throw Error(`Public ${route} page exposed internal draft markers`);
            if (!/not accepting (?:orders|purchases)/i.test(copy)) throw Error(`Public ${route} page does not clearly state that orders are closed`);
          }
          for (const route of ['account', 'staff', 'admin']) {
            await publicPage.goto(`${publicBaseUrl}/${route}`);
            await publicPage.locator('main').waitFor();
            const body = await publicPage.locator('main').innerText();
            if (/Fulfillment workspace|Needs attention|Admin dashboard/i.test(body)) throw Error(`Unconfigured /${route} route exposed a privileged workspace`);
          }
        }
      }
      await publicPage.close();
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
      results.push({browser: name, status: 'passed', staff, storefront, publicWebsite: {baseUrl: publicBaseUrl, viewports: viewportResults, dropAlertClosedWithoutCollectingData: true, policyAndAccountRoutesChecked: true}, errorBoundary: {safeFallback: true, referenceCorrelatedWithReporterFixture: true, actualMonitoringDelivery: false}, consoleIssues, expectedConsole});
      await context.tracing.stop();
    } catch (error) {
      if (page) await page.screenshot({path: `${output}/${name}-failure.png`, fullPage: true}).catch(() => {});
      await context.tracing.stop({path: `${output}/${name}-trace.zip`});
      const focus = page ? await page.evaluate(() => ({tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label'), text: document.activeElement?.textContent?.slice(0, 100)})).catch(() => null) : null;
      results.push({browser: name, status: 'failed', error: String(error.message), focus, consoleIssues, expectedConsole});
      process.exitCode = 1;
    } finally {await browser.close();}
  }
} catch (error) {
  results.push({status: 'blocked', error: String(error.message)}); process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({baseUrl, providerEvidence: false, results}, null, 2));
  for (const result of results) if (result.browser) await writeFile(`${output}/${result.browser}-results.json`, JSON.stringify(result, null, 2));
  await writeFile(`${output}/index.html`, `<!doctype html><meta charset="utf-8"><title>DualBore browser QA</title><h1>Synthetic local browser QA</h1><p>Real provider enrollment/payment are not verified here.</p><pre>${JSON.stringify(results, null, 2).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</pre>`);
  await publicPreview.close();
  await server.close();
}
console.log(JSON.stringify(results.map(({browser, status}) => ({browser, status})), null, 2));
