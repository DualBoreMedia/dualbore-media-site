# MX Bikes Setup Shop — development-only foundation (November 2, 2026)

## Owner-approved direction
- Add an MX Bikes setup shop to DualBore Media without replacing the apparel store, four-tab channel homepage, auth, staff/admin tooling or checkout.
- Track-specific per-bike setup: **$1.00**. General MX per-bike: **$2.00**. General SX per-bike: **$2.00**.
- User-named included tracks for initial previews: MXB Club, Forest, Assen. These are **not** published setup inventory. Other tracks and the actual supported OEM bikes are not yet supplied/verified.
- Existing no-deploy/no-main-merge/no-live-payment/no-transactional-or-marketing-email gates apply. Never use a Netlify preview to circumvent them.

## Implemented phase 1
- Standalone responsive `/setups` route, reachable from the homepage and main merchandise storefront. Four existing tabs stay unchanged.
- Search/filter controls for setup type, track and verified bike inventory; honest planned-price cards and no working purchase/download buttons.
- A separate, intentionally empty approved catalog. No pretend bike/track file combinations.
- A server-only publication model that rejects incomplete published records and strips private file IDs, checksums and unsupported client-controlled prices from public metadata.
- A node test suite for fixed prices, filtering, fail-closed publication and private-asset leakage.

## Requirements for phase 2 (not implemented or authorized by phase 1)
1. Owner supplies each original setup file, exact OEM bike name/ID, OEM pack version, MX Bikes version, track ID/name (or General MX/SX), test notes and proposed revision/compatibility changes. Avoid embedding actual original files in the public repository or Netlify output.
2. Design and approve private object storage, staff-only upload and integrity verification (MIME/content/size/checksum), malware handling, revision audit, rollback and rotation. Ensure credentials and asset keys remain server-side.
3. Add authorized product metadata to the existing PostgreSQL repository via a new migration; no edits to migration 001. Staff publish action must check verified file, QA, active price and download delivery readiness in one transaction.
4. Extend the *existing* quote/checkout/webhook/order systems for digital-only and mixed baskets. Server must enforce catalog prices and never apply physical shipping to purely digital carts. Preserve valid shipping/tax presentation for physical lines. Do not turn on Stripe or email.
5. On verified, idempotent payment settlement, record per-line customer entitlements in durable storage. Provide customer and optional verified guest order access; refund/revocation and fraud policies need explicit decisions. Issue expiring, user/order-scoped download links, rate-limit downloads and protect against IDOR and replay.
6. Add the authenticated My Downloads portal, installation guidance and recovery/support paths. Account login, MFA, staff permissions and audit events must not be weakened.
7. Add sandbox tests for price tampering, unauthorized access, missing asset, duplicates, mixed-cart shipping, split fulfillment, refunded entitlements, download expiry, secret leakage and recovery, plus production-shaped browser/PG/coverage checks. Never assert provider behavior from mocks alone.
8. Draft digital-product terms, permitted personal use, support/refund/tax treatment and independent/non-affiliation wording for review before taking money.

## Files needed from the owner
Send the setup files and for each: **bike + bike version, setup type, track if relevant, MX Bikes version, and any adjustment notes**. The shop must not publish or sell a listing until its exact file passes verification. Keep payment and download operations disabled until the owner explicitly approves a separate activation.
