# Coverage repair and non-selling website checkpoint

Local verification: October 19, 2026. This records engineering evidence, not deployment authorization.

## Measurement repair

- Native Node V8 collection now uses the AST converter used by Vitest's V8 provider. The line-based c8 converter produced invalid negative source columns for ESM branches; a minimal regression fixture reproduces that defect.
- All 75 substantive application and operational source files remain in the combined denominator. Required thresholds remain 90% lines, 90% statements, 90% functions and 85% branches.
- Original-source AST checks recognize implicit else locations while preserving their actual counters. Unknown missing locations, invalid coordinates, conflicting Node/browser maps and absent test-process evidence fail verification.
- The c8 calibration test uses its own raw-data directory. It previously deleted outer coverage evidence when invoked inside the collector.
- Measured combined result: **94.51% lines, 91.12% statements, 94.74% functions, 85.54% branches**. Zero incompatible shared maps or invalid source locations. All 729 implicit else counters were retained.

## Local checks

- Full Node suite: 240 passed, zero skipped.
- Rendered Chromium component suite: 64 passed, zero skipped.
- Real PostgreSQL: three integration checks passed, zero skipped. Tests used generated schemas on the dedicated loopback sandbox and removed those schemas afterward. Cross-process final-unit locking, made-to-order counters, replay, expiry, split packages, audit persistence and concurrent edits passed. Stripe within these database tests is a fixture.
- Existing Chromium E2E suite passed at 320, 375, 390, 414, 768, 1024 and 1440 pixels. It checked public navigation, cart/order states, staff permissions, packing slips, keyboard focus, revoked access and controlled error-boundary behavior. Expected deliberate failure logs are identified separately; unexplained console errors fail the suite.
- Normal build, Sites packaging, client-secret scan, Netlify gate regressions, public website configuration and business-condition mutation spot checks passed.
- Dependency audit: zero reported vulnerabilities.
- CodeRabbit's uncommitted reviews returned zero issues. Subsequent committed review and independent CI must be checked for the exact development checkpoint.
- Screenshots, traces, raw coverage, database files, credentials and tool installations remain ignored local artifacts.

## Security and behavior

- Production-marked environments require WorkOS. Legacy Clerk is available only for non-production migration checks.
- WorkOS membership/session enumeration follows all pages, rejects malformed or cyclic pagination, and fails rather than silently truncating a directory. Role changes revoke sessions and re-read provider state before confirmation. Recovery cannot clear uncertainty while a provider session remains active.
- Hosted contexts cannot expose the local commerce simulator. Local request limiting uses the trusted socket address rather than a caller-supplied forwarded header.
- Packing slips remain blocked server-side for refunded, cancelled and held orders. Rendered tests exercise whole-order and package preview, printing, keyboard focus and Escape.
- Refund replay, ambiguous retries, shipment allocation, stale writes, changed prices, unavailable sizes and invalid order totals have regression coverage. Failed checkout and unverified order returns preserve the cart.
- Transactional email failure cannot change payment/order state. Email retries preserve idempotency and lease ownership. Provider acceptance without a valid message ID is not treated as delivery.

## Publication boundary

No deployment, main-branch update, Netlify build, preview or production activation is authorized. Commits require `[skip netlify]`. Public publication requires a separate owner instruction even after CI passes.

The public site remains Garage Builds, Video Vault, design previews and Pit Crew with pre-launch information pages. Checkout and Drop Alert collection remain paused. Local payment, transactional email, marketing and waitlist switches are explicitly false; private settings are ignored.

Real managed WorkOS sign-in/MFA/recovery, real Stripe sandbox/live flow, Resend delivery, Sentry delivery and source-map resolution are not proved by fixture tests. They remain separate merchandise-sales requirements, along with Ohio/tax readiness, approved policies and retention/support workflow, production database migrations/backup restoration, catalog/fulfillment capacity and explicit sales activation approval.
