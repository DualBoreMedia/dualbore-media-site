# Website and sales gate record

The latest October 15 owner correction prohibits deployment or a main merge. Passing every mandatory pre-deployment requirement is necessary but never sufficient authorization; wait for a later explicit final deployment instruction. Initial deployment keeps both switches off; verify production, then enable verified transactional email and live payments last. Source remains feature-frozen except configuration, security, QA and fixes to launch blockers.

## Independent GitHub checks

`Production checks` runs on the development branch, main and pull requests to main. It uses read-only repository permissions, pinned official actions and no production credentials. It installs locked dependencies, builds, runs the unit/commerce/auth/operations/security and Sites/client-secret suites, and audits dependencies. It performs no deployment, migration, payment, email or provider mutation.

CI reports engineering, real PostgreSQL, rendered Chromium/Firefox/WebKit, public website configuration, and live sales activation as separate jobs. The public website job requires the engineering and browser jobs to pass first. The **Live sales activation requirements** job runs `npm run check:sales` without suppressing failure. It intentionally fails while approved production configuration and real verification evidence are missing. Do not add dummy live keys or blanket approval variables to make it green. Production credentials must never be exposed to untrusted branch or pull-request code. A reviewed protected release environment/configuration flow is still required once the real values and verification evidence exist. Check the run's exact commit SHA; old green runs do not certify new code.

## Separate readiness phases

**Level A: public non-selling website.** `npm run check:website` examines the built client/server package, canonical domain, crawler files, SPA routing, security headers and supplied merch assets. It requires `PAYMENTS_ENABLED=false` and `TRANSACTIONAL_EMAILS_ENABLED=false` explicitly. In CI, it runs only after engineering and browser jobs pass. This is a configuration gate, not proof of provider setup, deployed behavior, customer policy approval or owner authorization. Server-side checkout and email fail-closed behavior are covered by the separate regression tests. Ohio registration, live Stripe, live Resend and sales inventory are not prerequisites for a non-selling public website.

**Level B: live sales.** `npm run check:predeploy` is the older strict pre-sales preparation check. It requires both switches explicitly false and defers only the deployed live Stripe webhook secret/delivery verification. It still requires real authentication/MFA, clean production storage and restore evidence, live catalog/inventory, verified email delivery, policies, tax, security and rendered QA. Missing values remain blockers. Production sender tests may be performed directly against the verified provider without activating the application email switch.

`npm run check:launch` remains the default strict activation gate: it additionally requires the live webhook secret, verified deployed event delivery and both switches explicitly true. It performs no changes and must not be used as justification to activate switches without the owner's final deployment/activation authorization. Unknown phases fail closed. A green declaration check is necessary but is not a substitute for the evidence and exact-commit CI review.

Netlify's documented automatic database path provisions/applies hosted migrations through deployment. The database must be verified before conditional application deployment. A separately accessible clean managed production database, with provider access and any paid-plan approval, is required to complete storage and restore verification beforehand. No sandbox data may be copied.

## Provider and business prerequisites

- Authenticate the intended live Stripe merchant and verify onboarding, payouts, currency and business details. The connected account currently exposes sandbox mode only.
- Approved live catalog: E92 tee $30; E90 and SV1000S crewnecks $50 each; USD; S/M/L/XL/2XL. All 15 current variants are made to order; no finite launch stock count is required. Active modes, quantity limits and fulfillment capacity must be verified. Reliable address-calculated shipping requires verified carrier inputs; otherwise use the approved $9.95 USA flat rate. Tax setup remains unapproved.
- Sign in to WorkOS AuthKit, configure separate staging/production environments, hosted redirects and the private staff organization, then demonstrate verification, login/logout, recovery, revocation, guest ownership and cross-account denial. Verify mandatory organization TOTP MFA without SSO/JIT bypass and actual role revocation. Use the normal free hosted auth domain.
- The owned Porkbun domain dualboremedia.com is confirmed; verify Netlify DNS/TLS, WorkOS hosted redirects, email authentication and inbound routing. Do not purchase a WorkOS custom domain. Verify DKIM/Return-Path/SPF/TLS and the monitored sender/reply-to. Resend now verifies DKIM/SPF for the owned domain. Restricted key rotation, monitored inbound support, actual delivery and lifecycle verification remain pending.
- A separate empty Netlify managed production database is provisioned. Apply approved migrations through the documented hosted flow, verify TLS/separate roles/backups and perform an isolated restore before treating it as ready.
- Finalize the business/legal name, mailing and return address, public support email, processing time, returns/refund rules, retention and approved customer policies.
- Complete actual authenticated browser/provider flows, deployed headers/CSP and operational recovery checks. Chromium fixtures do not substitute for real managed authentication. Firefox/WebKit remain environment limitations until working runtimes are available.

## Rollback preparation

Before deployment, record the candidate SHA/tree, CI run, previous published deploy ID, schema versions, inventory totals and provider configuration evidence. Take and validate an isolated recoverable database backup. Never include secrets or customer records in public Git artifacts.

If production has a critical failure, disable payments first through server configuration, then disable transactional email if necessary. Verify the disabled behavior. Restore the previously known-good published Netlify application using the owner's authorized rollback path or deploy an exact tested code revert, after checking schema compatibility. Database schema/data recovery is a separate reviewed operation: do not destructively roll migrations backward or overwrite new orders with an old snapshot. Preserve payment events and reconcile authoritative Stripe state before resuming.

## Historical notification-address cleanup

The address is absent from the current development tree but exists in older commits on the local codex/local-test-commerce branch; current remote branch tips do not contain that branch. Historical public exposure of unreachable objects is not yet established. This is a privacy item, not a leaked payment credential. Before rewriting, inventory all remote branches/tags, check which current tips still contain it, preserve an access-restricted recovery bundle, stop concurrent pushes, and prepare an exact old-to-new commit map.

History rewriting changes descendant SHAs and invalidates signatures, open comparisons and prior CI references. All affected branches must move together with explicit expected-old-SHA leases; collaborators must reclone or carefully reconcile their copies so old history is not reintroduced. A rewrite cannot erase forks, cached pages or existing downloads. Coordinate cleanup of GitHub cached objects through the repository owner/support when needed.

No force push or main rewrite is part of this CI-preparation commit. Main and the currently published deployment remain unchanged. The latest explicit prohibition on deployment applies even when every mandatory gate passes. Re-run tests, CI and deployment SHA checks after any separately coordinated rewrite.
