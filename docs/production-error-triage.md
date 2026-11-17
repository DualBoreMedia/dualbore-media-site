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
