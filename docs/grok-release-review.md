# Grok handoff: non-selling website candidate

Review the latest local `codex/commerce-test-foundation` checkpoint, including
Product Manager commit `9681eda37fc6bbeabc25fbd442b1def28515d682` and its catalog-size
follow-up. The GitHub branch was still at `1d90713cb40cd003d28cb2b56250c78b6af4b7b7`
when inspected. Its six green CI jobs do not certify the newer local candidate.
Use the exact follow-up SHA supplied with this handoff, not the older remote tree.

## Scope to review

- Preserve the forty remote commits incorporated by the Product Manager merge.
- Admin product drafts, version checks, unique SKUs, published snapshots, archive
  enforcement, fresh MFA, immutable actor audit and metadata-driven filtering.
- Merchandise and cart size controls use each product's returned catalog variants,
  rather than a global S-2XL list. Unavailable sizes cannot be purchased. Cart size
  changes keep the catalog's price and preserve existing stock/paused-order feedback.
- Digital setup publication remains blocked. Received-file records contain public
  metadata only; no raw setup files, storage credentials or download grants belong
  in the public repository or package.
- Public policy pages, real imagery, navigation, responsive layouts, closed Drop
  Alert dialogs and no public disclosure of the owner's residential address.
- Security boundaries, deployment gates, private source maps and source-only Git
  contents. Do not infer real provider verification from injected test principals.

## Fresh read-only production checkpoint

Netlify still reports ready production deploy `6ad82fbc7f1493fac15781e9` at
`https://dualboremedia.com`. Forms processing is not enabled. Payments,
transactional email, marketing email and Drop Alert flags are explicitly false
in all contexts. `REFUNDS_ENABLED` is absent; its server gate must remain closed,
and an explicit false value is required before an Admin release.

One malformed Resend credential-shaped variable name and one malformed Stripe
publishable-key-shaped name remain. No credential is reproduced here. The Resend
entry is a potentially exposed secret and requires private provider-side matching,
revocation if valid and owner-approved cleanup. A publishable Stripe key is not a
secret. No provider variables were changed in this inspection.

Production WorkOS owner access/MFA/revocation, database isolation/permissions and
managed recovery, and monitoring delivery/source maps/alerts remain unverified.
Do not enable production Admin access or selling based on local tests.

## Release decision

Prepare a **public, non-selling** release only after:

1. Review and approve the exact tested source checkpoint for publishing to the
   development branch. Keep every commit subject marked `[skip netlify]`.
2. Verify all six independent GitHub jobs for that exact candidate SHA.
3. Resolve the potentially exposed Resend credential separately. Never paste its
   label or replacement value into a review, chat, source file or screenshot.
4. Obtain Grok's findings against the correct candidate. Reproduce and fix valid
   issues; rerun affected checks before changing the release SHA.
5. Verify the intended build and server configuration fail closed for registration,
   payments, refunds, transactional/marketing sending and signup collection. Do
   not accidentally activate Admin providers, database migrations, scheduled media
   work or digital delivery during a public website release.
6. Present the exact deployment SHA, target, flags, test evidence and rollback
   target to the owner. Obtain explicit approval for that deployment.

The owner's plan to review with Grok and deploy later is not approval to deploy
now. No main merge, deployment, production migration or provider activation is
part of this follow-up. Keep live sales and production Admin readiness separate
from the public website release.
