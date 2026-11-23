# Production browser error triage — November 16, 2026

The inbox alert DUALBOREMEDIA-WEB-3 identifies production release
`6522f5acf28f3fe759ce3c50362f441f9bb7e92c`. Its deployed JavaScript frame
`/_vite/index-DSDfQt5B.js:56:98602` points directly to the `crypto.randomUUID`
call in `ErrorBoundary.componentDidCatch`. The original initiating render
exception is not recoverable from the redacted alert. Do not claim that its
cause is known or silence future alerts.

Recovery must render even when browser crypto is missing or throws. A support
reference is optional; the original exception must still reach the existing
privacy-preserving reporter. No insecure random fallback is needed for recovery.

Admin screen loading must not generate mutation keys. Confirmed mutations use
secure UUIDs, with a Web Crypto random-values fallback for browsers without
`randomUUID`. If secure randomness is unavailable, the mutation fails locally
with useful guidance and no outgoing request. Retain keys after ambiguous
network failures to preserve idempotency. These changes do not alter MFA,
authorization, revocation or server-side validation.

## Release scope

Include the existing development changes: efficient verified Admin sessions,
the five public destinations, Episodes/Shorts browsing, exact build shelves,
responsive catalog previews, full fulfillment queues and safe video refresh.
Purchases, refunds, customer sending, signup collection and digital delivery
remain disabled. No paid service, migration or new product claim is included.

## Outstanding production prerequisites

- Replace the previously exposed provider Read and write credential through
  the Netlify database dashboard. Do not change the separate runtime login.
- Apply only the already approved video table and sequence grants, verify
  unrelated permissions are unchanged, then prove durable hosted refresh.
- Keep the strict Admin operating gate and read-only pre-deployment gate.
  Do not set verification declarations true without actual evidence.
- Verify exact-release source-map resolution and authorized hosted Admin
  behavior under the existing two-stage verification procedure. Local tests
  are not proof of hosted authentication or monitoring.
- Record the tested SHA and six CI results before the exact-release approval
  and production deployment. Do not bypass the deployment marker gate.

If a future authorized release fails before publication, the prior deploy
remains live. For a published regression, prepare a reviewed fix-forward or
source revert through the normal release gate; never restore the database
merely to roll back UI code.

## November 22, 2026 — alert investigation and deployed-fix reconciliation

The November 17 Sentry production alert DUALBOREMEDIA-WEB-3 (issue
https://dualboremedia.sentry.io/issues/7851905217/) occurred at 04:49:24 UTC
and identifies **release `6522f5acf28f3fe759ce3c50362f441f9bb7e92c`**.
The email names a TypeError in the old `_vite/index-DSDfQt5B.js` bundle.
Comparing source by release confirms the older ErrorBoundary did call
`crypto.randomUUID()` unguarded inside `componentDidCatch`.
That is an identifiable **secondary crash in error recovery**, not proof of
what caused React's original render failure. Because event content was
redacted, no specific original component/data defect can responsibly be
claimed from this email alone.

The newer source catches missing/throwing Web Crypto and reports the original
exception without an obligatory reference. It shipped with production release
`201f963e380b5cf99b1db2fbdd7cd33e71b571a0`, Netlify deploy
`6afbe9f09bcbcd0888c52027`, published November 17 at 05:46:29 UTC,
**after** the older alert. The November 14–21 Sentry report lists one web
issue/error and no function errors, but does not prove the original initiating
exception is eliminated for every user. This code path has coverage for
missing crypto, missing randomUUID, a throwing method and a throwing getter;
never replace a missing UUID with an insecure Math.random() fallback.

Operational follow-up: inspect any NEW event with release equal to the actual
current production SHA, preserving stack coordinates/source-map debug IDs while
scrubbing user/request data. If new render failures recur, trace the original
exception from Sentry with the exact release's private source maps; reproduce
in isolated tests before fixing the causal component. Do not alter Sentry
privacy protections, silence alerts, or mark old synthetic validation alerts
as live regressions. Changes in this investigation are documentation,
comments and regression hardening only; deployment still requires separate
approval under AGENTS.md.
