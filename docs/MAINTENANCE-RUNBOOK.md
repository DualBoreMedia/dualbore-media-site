# DualBore Media — human maintenance, security and rollback runbook

Last verified: November 22, 2026. Internal technical record, not a publication or release authorization.
Website: https://dualboremedia.com
Repository: https://github.com/DualBoreMedia/dualbore-media-site
Active development branch: codex/commerce-test-foundation
Last verified live main: 201f963e380b5cf99b1db2fbdd7cd33e71b571a0
Last verified live Netlify deploy: 6afbe9f09bcbcd0888c52027 (ready; published 2026-11-17 05:46:29 UTC).
Before trusting these values during an incident, recheck GitHub main HEAD and Netlify's current published deploy.

## What runs where (without requiring the original developer)

- Public web UI: Vite + React, served by Netlify. Main route switch is src/main.jsx. The ErrorBoundary and private error reporter live under src/observability/.
- Public pages: Garage, Videos (Episodes and Shorts), Merch, Setups, Pit Crew. /shop/ and /setups/ are paused catalogs, not checkout destinations.
- Channel refresh: server-only YouTube Data API key; daily-video-sync runs on Netlify at 10:00 UTC, and visitors read the saved feed (or the curated fallback). Do not publish the YouTube key in frontend VITE_ variables or source.
- Private Admin: WorkOS authentication and server-verified owner roles/MFA. Routine drafts and sensitive publish/upload/access actions have distinct authorization requirements. Admin session success must be tested with the real authorized owner, not inferred from local mocks.
- Production data: managed PostgreSQL with schema migration ledger; approved video-only writer grants are intentionally narrow. Setup STP bytes are private, versioned and not public downloads.
- Error monitoring: Sentry web and functions projects. The beforeSend sanitizer removes identity, requests, secrets and environment details while retaining eligible source-map stack coordinates. Never put credential values or user PII in tickets.

## Release chronology and reference points

2026-11-09: Sentry development/release-validation synthetic alerts verified reporting. Some old synthetic browser events carried IP details, later protections removed IP/geo; distinguish these synthetic events from real production incidents.
2026-11-11: Five-tab private-Admin verification release 8880e26919a52320186c033078c5849c1c5a69aa. Separate metadata-only YouTube enablement marker 6522f5acf28f3fe759ce3c50362f441f9bb7e92c; older Netlify deploy 6af401f914ecc954d2c9e72b.
2026-11-11: Development source improvements included standalone /shop and /setups metadata, balanced mobile fifth tab and per-artwork garment previews; no checkout or fake garment-specific imagery.
2026-11-13: New navigation, episode/short classification, searchable build shelves, owner-friendly Admin work queue, safe draft handling and video refresh enhancements on development. See docs/channel-operations-release.md.
2026-11-16/17: Investigated production WEB-3 TypeError, event November 17 04:49:24 UTC from OLD 6522f5a release. Old ErrorBoundary called crypto.randomUUID() without protection during error handling. It could hide the original exception with a second crash. See docs/production-error-triage.md. Original initiating render error remains undetermined.
2026-11-17: Published newer non-selling production release 201f963e380b5cf99b1db2fbdd7cd33e71b571a0, Netlify deploy 6afbe9f09bcbcd0888c52027 at 05:46:29 UTC. The corrected guarded ErrorBoundary was included. GitHub workflow https://github.com/DualBoreMedia/dualbore-media-site/actions/runs/44026302350 succeeded.
2026-11-21: Sentry weekly report (Nov 14–21) reported one new web issue (WEB-3) and zero function errors for that week. This does NOT establish that the triggering earlier render fault is fully resolved.
2026-11-22: Reviewed Sentry alert against exact older and newer Git sources. Follow-up confined to human-readable explanation and additional recovery regression tests on development; no production action.

## 2026-11-17 alert: exactly what is known and unknown

Alert WEB-3: https://dualboremedia.sentry.io/issues/7851905217/
Source email date: 2026-11-17 04:52 UTC. Event timestamp: 2026-11-17 04:49:24 UTC.
Alert release: 6522f5acf28f3fe759ce3c50362f441f9bb7e92c. Frontend bundle _vite/index-DSDfQt5B.js:56:98602.
Verified source diff: old ErrorBoundary.componentDidCatch called crypto.randomUUID() unconditionally. New ErrorBoundary wraps optional UUID reference generation in try/catch, still forwards original error to Sentry and renders reload/home recovery.
Confidence: HIGH that the secondary failure mechanism existed and was removed in current source. UNKNOWN initiating React render failure; email is intentionally redacted and must not be reverse-engineered into an invented cause.
Action if a new Sentry alert arrives: match event.release to actual deployed commit, check issue frequency and unique browser contexts without collecting PII, privately inspect exact release source maps, reproduce with test fixture, then apply a narrowly scoped patch.

## Security boundaries that must never drift

Required production flags, exact string false: PAYMENTS_ENABLED, REFUNDS_ENABLED, TRANSACTIONAL_EMAILS_ENABLED, MARKETING_EMAILS_ENABLED, DROP_WAITLIST_ENABLED, DIGITAL_DELIVERY_ENABLED.
WorkOS MFA and owner privileges: never promote another member from a mere invitation or bypass sensitive-action step-up. Keep production cookies secret and HTTP-only.
PostgreSQL: preserve least-privilege runtime identity, verified backup and migration checksums. Never copy production DB URLs into Git, ChatGPT prompts, tickets or frontend. Database rollback is NOT implied by a code rollback.
MX Bikes: preserve 53 bike reference slots; keep STP originals and versions private. Three received TC125 sample files have integrity records, not verified in-game compatibility or sales permission.
Merch: same original artwork may have planned T-shirt, crewneck and sweatshirt options, but unapproved imagery, prices, sizes and stock are not actual offerings.
Sentry: no session replay, console/request payload capture or PII. Do not disable monitoring to clear an issue. Keep source maps private and event release identifiers accurate.
Netlify build gate: ordinary commits [skip netlify]; only a separately approved exact tested release can use [deploy netlify]. Never trigger a build hook, production deploy or main merge to bypass this gate.

## Reproducible verification before any future release

1. Read AGENTS.md, docs/admin-only-release.md, this runbook, exact branch SHA and latest GitHub issue/reviews. Read current files before editing.
2. Run npm ci; npm run test; npm run test:coverage; npm run test:client-secrets; npm run test:mutations; npm run test:inventory; npm run test:sites; npm run check:website; npm audit --audit-level=high.
3. Run npm run test:postgres against an isolated disposable PostgreSQL database only. Never aim tests at production. Verify migration concurrency, duplicate webhook/idempotency, unauthorized access, no private file leaks and safe errors.
4. Run browser QA on Chromium, Firefox and WebKit with mobile widths including 320/360/375/390/414, desktop sizes, keyboard accessibility, real browser zoom as a separate check and reduced motion.
5. Explicitly reproduce ErrorBoundary failure cases: missing crypto, missing randomUUID, throwing UUID, throwing property getter and blank UUID return. Recovery must display, preserve cart, capture the ORIGINAL exception only, and display no fabricated reference.
6. Recheck that all six production flags remain false, function schedule is registered, live Admin only admits MFA-verified owners, STP downloads stay closed and no provider secrets appear in frontend artifacts.
7. Wait for all six GitHub CI jobs on the exact SHA to pass, plus any required CodeRabbit or independent review. Do not mark browser simulation as authenticated production Admin verification.

## Safe revert / recovery procedure

Identify the failed deploy by timestamp, exact SHA, Sentry release and Netlify deploy ID. Record the initiating symptom, route, browser, event and first failing check WITHOUT PII.
Stop: a current deployment or publish/write privilege is never inferred from this record. Obtain explicit current owner approval for the exact candidate rollback or fix-forward SHA.
Prefer tested fix-forward if database state changed. For a UI-only regression, the previous known-good deployed code is the Netlify deploy confirmed at that incident's start (not automatically the oldest SHA in this guide).
Last known pre-2026-11-17 release marker: 6522f5acf28f3fe759ce3c50362f441f9bb7e92c, Netlify deploy 6af401f914ecc954d2c9e72b. IMPORTANT: it had an unguarded error boundary; do not blindly restore it to 'fix' a newer error.
Current last verified production reference: 201f963e380b5cf99b1db2fbdd7cd33e71b571a0, Netlify deploy 6afbe9f09bcbcd0888c52027. Recheck current state in provider before any future rollback.
Database changes are separate: code rollback does not reverse schemas, grants, migrations or data. Never restore snapshots to resolve a UI bug. Use tested backups and explicit scoped approval for any database action.
After an approved revert, repeat staff-only, 6 disabled flags, exact release, Admin least privilege and live YouTube/merch/MX Bikes smoke tests, and log the rollback decision and outcome.

## Human maintenance checklist

Daily during a new launch: check Sentry new issues by release, Netlify function error rate and published deploy changes. Classify incident as current-release regression, old-release event, synthetic validation or provider outage.
Weekly: check actual owner Admin session, latest YouTube snapshot age, failed sync runs and independent backup inventory. Record any missing evidence without claiming a pass.
After each code change: add dated troubleshooting note with issue ID, expected behavior, reproduction, root cause/evidence, files changed, tests, exact commit, security implications and rollback instructions. Keep this runbook and the MXBikes Google Drive copy aligned.

## Reference links

GitHub repository: https://github.com/DualBoreMedia/dualbore-media-site
Release/verification tracker: https://github.com/DualBoreMedia/dualbore-media-site/issues/1
Current last confirmed release commit: https://github.com/DualBoreMedia/dualbore-media-site/commit/201f963e380b5cf99b1db2fbdd7cd33e71b571a0
Sentry WEB-3: https://dualboremedia.sentry.io/issues/7851905217/
Netlify project: https://app.netlify.com/projects/dualbore-media-site
Production site: https://dualboremedia.com

Never store API keys, database credentials, cookies, authenticator codes, personal IP addresses, raw logs with request bodies or private .stp file bytes in documentation.