# Admin session correction

Routine private draft editing previously required authentication within the last ten minutes, the same as publication and sensitive operational changes. That made normal editing unnecessarily request another Google/authenticator flow.

Private product and MX Bikes draft saves now accept an existing MFA-verified Admin session. The server still checks current membership, verified email, session validity and revocation on each request. Saving a draft cannot update its published snapshot, inventory, private attachment or delivery. Publishing, unpublishing, archiving, imports and private uploads retain fresh verification, as do the existing privileged operational actions.

Concurrent API requests share token refresh. A delayed expired response now reuses a rotation already completed by another request instead of rotating the new cookie again. Recovery remains bounded; a revoked or expired provider session still requires sign-in. No tokens are put in browser storage and no session duration or provider policy is changed.

Regression checks cover private edits to a published product without altering its public snapshot/variants, MX drafts, denied employee/customer/non-MFA access, fresh verification for every publication/status/import action, and staggered expired responses producing exactly one rotation. Existing auth tests retain expiry, revocation, issuer, organization, origin and MFA checks.

This is a development correction, not a production deployment or provider change. The six disabled payment/refund/email/signup/delivery switches remain unchanged. Real hosted authentication must be checked on an approved release; local fixtures do not prove provider delivery or an actual owner session.
