# Channel and operations release candidate — November 13, 2026

## Changes

- One public navigation row with real Garage, Videos, Merch, Setups and Pit Crew paths; a video-led homepage, four build links, a separate Shorts strip and compact preview links.
- Episodes default to three minutes or longer; all shorter videos are Shorts, including untagged clips. Search understands format and exact build identity. Newest, oldest and longest apply within the selected group/shelf.
- Exact N54, SV1000S, RD400 and CRF110 shelves replace generic title-keyword categories. Unmatched content and MX Bikes livestreams remain in Everything else. No extra Google request is made by a visitor.
- A sitemap index includes static page URLs and a server-generated sitemap for the current verified public feed. It never lists private setup files.
- Admin Overview contains bounded financial/deadline attention and a deadline-sorted work queue independent of the 25-order table. Rows include item, size, quantity, deadline and calendar age.
- One Catalog type filter reuses merchandise and MX Bikes editors. Routine draft saves use the current server-verified MFA session. Sensitive actions retain fresh verification.
- Guided packing, authorized printable slips, explicit carrier-possession confirmation and next-order selection. Completing one order never acts on the next order.
- Saved order rows and catalog records update in place. Failed saves remain beside their order; search/paging remain intact and older reads cannot overwrite a confirmed save. Incompatible filtered rows are removed without resetting the filter.
- Server-side duplicate tracking checks run inside existing serialized repository transactions, including independent PostgreSQL repository instances and legacy tracking records.
- Admin Refresh videos uses the same server-only scheduled handler, requires a current MFA Admin and has a shared five-minute cooldown. Refresh results are audited without provider payloads or credentials.

## Verification boundaries

The release remains non-selling. Payment, refund, transactional/marketing email, signup collection and digital delivery gates are unchanged. The 53-bike roster and original private file boundaries are preserved. Synthetic browser/provider fixtures do not prove real hosted sign-in, payment, email or delivery.

The November 12 production daily-sync log confirms failure to persist its outcome. A read-only TLS-verified database probe confirms the runtime role lacks video snapshot writes, sync-run insert and sequence usage. The owner approved precisely those video-only grants on November 13. Applying them and proving a real hosted refresh is a separate operational step; do not mark it verified from local tests or configuration flags.

## Release procedure

1. Require the full build, coverage gate, real local PostgreSQL and recovery checks, cross-browser suites, client-secret/security checks, website readiness and CodeRabbit reviews to pass. Record the exact development SHA and six green CI jobs.
2. Finish the approved video-only permission update through the private workflow, independently verify the permissions and run the existing production scheduled function. Verify a new durable snapshot and run timestamp, then public feed visibility. Do not expose credentials or broaden personal-token database access.
3. Present the exact tested candidate and current risks for owner deployment approval. Ordinary development commits use `[skip netlify]`; do not merge main, add a deployment marker or publish a preview without that exact approval.
4. After an approved deployment, check the five destinations, paused merchandise and setup previews, actual authorized Admin session, draft persistence, sensitive-action MFA and revoked access. Verify production release identity and monitoring privately. No commerce activation.

## Rollback

The pre-update production reference is `6522f5acf28f3fe759ce3c50362f441f9bb7e92c`. Verify the currently published deploy before any later release. Re-publish that known-good Netlify deploy only with owner authorization if the approved new release fails. This source update adds no database migrations or destructive data changes; do not restore a production database merely to roll back frontend code.

The optional permission rollback removes only the newly approved video grants: revoke INSERT/UPDATE on public_video_snapshots, INSERT on public_video_sync_runs and USAGE on public_video_sync_runs_id_seq from dbm_app_runtime. Do not revoke its existing SELECT permissions or change credentials as part of that rollback.

## Still manual

Refunds, customer contact, releasing reserved stock and approving/publishing private setup files require review. New authentic flat garment photography remains an owner asset task. No generated substitute photos, compatibility claims, stock or legal facts were introduced.

## Review follow-up

The initial source review raised two major and three minor issues. The candidate fixes catalog-save/read invalidation, applying mutations against the currently selected filter, visible recovery for failed off-page order loads, preserving Ctrl/Cmd/Shift/Alt link behavior, and distinguishing superseded video snapshots from successful writes. Regression tests reproduce each case. Superseded snapshots never overwrite the cache or claim a new durable write; real PostgreSQL verifies the newer snapshot remains intact.
A second review caught fallback reloads retaining an old query and next-order advancement using an old selection. Reloads now resolve the current query; automatic advancement is limited to an actual carrier-handoff transition while that same order remains selected. Browser regressions cover switching filters or orders while the request is pending and adding notes to an already shipped order.
