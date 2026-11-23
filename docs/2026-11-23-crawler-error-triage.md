# 2026-11-23 — Google-indexed N54 error snippet: verification and safe hardening

## What the report says (not a verified current incident)
An external assistant reported that Google Search displayed `The garage hit a snag` and a UUID reference for `https://dualboremedia.com/builds/n54/`. That snippet is a **claim about Google's crawl/index history**, not a timestamped Sentry event or proof that the currently deployed release is crashing. The web retrieval available in this session could not fetch the live site and a targeted search did not independently find that particular result. Do not reproduce the reference UUID in public marketing copy or assume a production release is broken without matching release/time evidence.

## Checked in the actual 2026-11-23 development source
- `src/main.jsx` already recognizes `/builds/{id}` and `/builds/{id}/`, including the N54 build. The route normalizes trailing slashes in `src/PublicDetail.jsx`; no observable source defect was found by this static inspection.
- `public/robots.txt` already disallows Admin, Staff, Account, API, order and unsubscribe routes and refers to the canonical sitemap.
- The production `npm run build` executes `scripts/prerender-public-details.mjs` to generate canonical HTML for real builds, sections and videos and a `sitemap.xml` *index* referencing `sitemap-pages.xml` and `sitemap-videos.xml`. Editing the placeholder `public/sitemap.xml` would not fix missing indexing.
- Google index coverage cannot be established merely by counting results from a broad site query. Search Console is the appropriate place to inspect *URL Inspection*, *Crawl date*, *Google-selected canonical*, *Page indexing*, and *Live Test* for `/builds/n54/`.

## Development-only fix and tests
- The fallback removes an irrelevant saved-cart claim while sales are off.
- When a React error boundary actually catches a render error, it temporarily adds `<meta name="robots" content="noindex, nofollow">` to the browser document head; any original robots value is restored if the boundary unmounts. This helps crawlers avoid indexing temporary crash output **when the crawler executes the JS**. It is not a guarantee of indexing, and does not fix the initiating exception.
- Added cold-app bootstrap/browser QA for **all four** real build routes, with and without a trailing slash, with a broken background provider and inaccessible browser storage. Also cover `/shop` and `/setups` with/without slash and broken provider calls. The primary assertion is that build/section content renders and the failure fallback never appears.
- Added regression test for noindex in a synthetic boundary crash, no inactive-cart copy, and cleanup on unmount. Earlier `crypto.randomUUID()` fault-tolerance regressions stay intact.
- Added Node test verifying the *generated* sitemap index and the public page sitemap include actual build/shop/setup URLs without private routes.

## If the incident is still visible on Google
1. **Do not deploy from a screenshot alone.** In Google Search Console, inspect `https://dualboremedia.com/builds/n54/` and record the last crawl date and Google-selected canonical without copying identity data.
2. Compare the crawl against the exact production Netlify deploy SHA and date. A search snippet can persist from a previous release.
3. Use the URL Inspection *Test Live URL* facility and a clean browser on mobile/desktop to check current rendering. Capture only the safe error ID/release, never credentials/cookies, raw IP or customer details.
4. If the current release actually fails, use the matching **current release's** private Sentry source map to find the original error; reproduce it in a targeted test, then fix only the evidenced cause. The 2026-11-17 WEB-3 guard was a secondary recovery fix, not proof that the original exception disappeared.
5. Once a healthy live version is verified, request recrawling in Search Console and monitor the result. Do not globally noindex healthy pages or block public builds in robots.txt.

## Safety, review, rollback
All work is confined to `codex/commerce-test-foundation`, ordinary `[skip netlify]` commits only. No production deployment, database changes, WorkOS roles, payments, refunds, emails, signups, or private STP downloads. Preserve existing SEO headers, Sentry redaction and original error reporting.

If the new fallback meta handling causes a regression, revert this development commit or fix forward after review, then rerun all six GitHub CI jobs. There is no reason to roll back production to undo development-only source changes. Record the exact test run and commit when known.
