# Admin-only production candidate: NO-GO until verified

## November 10: owner-approved two-stage verification

The owner approved a controlled non-selling verification rollout because new Production-only secrets are frozen into a Netlify deployment, while real hosted authentication and monitoring evidence can only be collected from that build. This changes the sequence, not the required evidence.

Stage 1 uses `check:admin-predeploy`, also run by `prebuild` on every Netlify production build. It requires the closed-store production configuration, `ADMIN_RELEASE_PHASE=verification` and `WORKOS_KEY_ENVIRONMENT=production`. These are configuration declarations, not verification flags. The preflight uses the actual protected key to read the configured WorkOS organization, then opens the actual restricted database connection with verified TLS in a read-only transaction. It compares the migration ledger against the committed SQL, rejects elevated roles/memberships, verifies immutable and editable permissions, and closes the transaction. It never migrates, changes roles or sends email. Provider errors are reported without credential/PII details. A failure blocks compilation/publication. Local/CI skips are explicitly not production proof.

`WORKOS_STAFF_MFA_POLICY_VERIFIED` describes the independently inspected private organization's required-MFA/invitation policy; it is not hosted login evidence. Existing per-request organization membership, session revocation, TOTP, freshness, authorization and IDOR protections remain unchanged.

Stage 2 keeps `check:admin` strict and unchanged in its required evidence. The verification rollout is **not operationally certified** until owner sign-in/MFA, real saved edits and persistence, session/revocation/least-privilege checks, and release-specific monitoring/source-map/redaction checks pass. Do not set `WORKOS_PRODUCTION_VERIFIED`, `AUTH_PRODUCTION_VERIFIED`, `ERROR_MONITORING_VERIFIED` or other evidence flags merely to permit deployment. The new preflight reports `adminOperational: false` even when successful. Six green CI jobs and the exact owner-approved candidate remain separate deployment prerequisites.

All six payment/refund/transactional-email/marketing-email/waitlist/digital-delivery switches stay false throughout both stages. No data restore, sample-data seeding, setup publication/download, new role grant or paid plan is included. Apply any correction through a reviewed Git change; preserve production data and audit history. A database restore is never the routine code rollback procedure.

## November 5 continuation

Production WorkOS is now accessible. The inspected production organization list was empty, Google OAuth was unconfigured, and no active environment key existed before the owner created one. Production Google OAuth requires a Google Cloud client ID and client secret. Provider enrollment, private membership, required TOTP, recovery and actual revocation still need verification. No production roles were granted.

An empty private staff organization has now been created without trusted domains, SSO or automatic admission. Production AuthKit MFA is set to Required, the organization shows Required MFA, and public signup is Disabled. These saved settings are not evidence of actual owner enrollment, MFA completion or revocation. The owner separately approved saving the production origin, WorkOS provider selection, environment, client ID and private organization ID in Netlify. Cookie-secret setup, Google OAuth, owner enrollment, database configuration and monitoring are still pending. No policy-evidence flag was set true and no deployment occurred.

The owner revoked the first newly created key after it appeared in browser-inspection output and created a replacement. The replacement was saved as a masked Netlify secret. Its preview, branch and agent-runner copies were removed, leaving only Production. No credential values are recorded here. Netlify Free prevents selecting Functions-only scope. The owner approved the free option: production-only secret values with the plan's Builds/Functions/Runtime scopes, no post-processing or preview values, and verified browser-output/log safeguards. This explicitly supersedes Functions-only scoping below for the free-plan release. It does not waive the secret-scope evidence gate, permit secret logging, or authorize a paid plan. CI builds with synthetic server-secret canaries and scans the browser output and build log. Never load production credentials into CI.

WorkOS documents opaque `sk_` keys, so runtime and readiness validation accept that form only with explicit production environment and independently verified production evidence. A prefix cannot establish environment provenance. Known staging keys remain rejected. See [WorkOS API authentication](https://workos.com/docs/reference/api-authentication).

The public non-selling release observed in Netlify is main `cfc3369d61de5dbf9c904a88508fce8e43f5ff4e`, deploy `6ae979544f8c3a62b05517a3`. All five sales/sending/signup flags remain false. The historical snapshots below are retained as dated evidence and do not describe the current deployed SHA.

A read-only inventory of the existing production database found no application tables. The driver transport was encrypted and its certificate authorized with `sslmode=verify-full`; the transaction was explicitly read-only and rolled back. The CLI's empty Netlify migration list does not cover this repository's separate checksum migration flow. All six existing migrations still need approved application, a restricted application role and verification. The dashboard shows daily backups with three-day retention, but its newest scheduled backup is dated October 29. Do not claim managed recovery is current or rehearsed. No production data, schema, role, backup setting or deployment changed. Monitoring and live Admin remain unverified.

Latest continuation: [Phase 3 remediation and approval checklist](phase3-admin-remediation.md), November 1, 2026. The observations below retain their October 31 date unless that continuation explicitly records a fresh check.

Audit date: October 31, 2026. Baseline: `4d220d3f8eaba69270c23b818dde2aa5a88f810b`, development branch `codex/commerce-test-foundation`. This document prepares a release; it does not authorize a deploy, main merge, provider activation, billing, payments, refunds, emails or signup collection. Record the final candidate SHA and six CI results in the handoff manifest after committing. Never substitute the baseline SHA for the final tested SHA.

## Independent remote observations

- GitHub development HEAD matched the baseline; the worktree was clean before Phase 2. Main remains `70d55ddcc342e901e322c4c0c483d355c8346933`.
- Netlify still publishes deploy `6ad82fbc7f1493fac15781e9`, the previously approved non-selling `0b5f474` release. Forms are not enabled. Non-production visitor protection remains enabled.
- Site environment metadata has ten entries; no shared team variables were returned. Payment, transactional email, marketing and Drop Alert flags are explicitly false in all contexts. `REFUNDS_ENABLED` is absent; existing production refund logic requires true, so it remains closed. The candidate requires an explicit false value.
- WorkOS server/client, frontend provider, `SITE_ORIGIN`, application `DATABASE_URL`, and monitoring settings are absent from the site/team metadata inspected. Managed database bindings are not necessarily listed with ordinary site variables; absence here is not proof that no database exists.
- The Netlify Database dashboard shows an existing production branch, approximately 998 KB stored, one compute unit, sleep after five minutes, zero reported 24-hour compute/bandwidth, and personal-token production write access disabled. Do not enable that write-access checkbox. Contents, migration ledger, cleanliness and usable application credentials were not verified. No production database query or restore was performed.
- The Free team dashboard shows three-day scheduled-backup retention and the last published-deploy backup only. The newest scheduled backup visible in this inspection was dated October 29; verify recency and a managed restore before relying on it.
- WorkOS production selection displays **Add billing information to enable Production**. Cancelled without entering details. Production organizations, callback, Google credentials, MFA policy and owners could not be inspected behind that gate. Working staging settings were preserved.
- Read-only public probes: `/admin` and `/staff` return HTML 200 with no-store/noindex; `/api/auth/session` returns JSON 503, `/api/operations?staff=true` JSON 403, and `/api/commerce/config` JSON 404. An HTML page loading is not proof of working Admin access.
- Netlify's saved build settings point to this GitHub repository and `main`, command `npm run build`, saved publish `dist`. Source `netlify.toml` specifies `dist/client` and the fail-closed ignore command. Verify the effective resolved configuration for any future Git build; do not rely on a stale saved UI field. The existing manually uploaded deploy has no commit_ref in the API response.

## Credential-shaped names: approval required, no values reproduced

Two all-context, non-secret variable labels resemble credentials and have empty values. One resembles a Resend secret; the other is a Stripe **test publishable** key. They are not functional configuration names. No credential identifier, suffix, fingerprint or value is included here or in public source.

Treat the Resend label as potentially exposed: after owner approval, identify and revoke that exact key in the owner dashboard, review its usage, remove the malformed label, and create a replacement only when sending is separately authorized. Removing a label alone does not revoke the key or erase provider history. New credentials belong in a properly named secret, kept only in the production deploy context, with the approved free-plan scopes and build-output safeguards, never preview contexts. The Stripe publishable key is designed to be public and is not a secret-key compromise; remove its malformed label after approval. Do not rotate unrelated keys, reveal labels in screenshots, send a test message or enable email to validate cleanup. Browser credential creation/rotation steps still require the owner where applicable.

## Candidate code and non-selling behavior

Rendered Firefox QA exposed a failed Google font download. The candidate now bundles the same Teko/Inter families and weights locally, including their OFL licenses. This preserves typography and removes a third-party font request; the initial failed browser run remains recorded rather than retried into a success claim without a correction.

The refreshed fonts exposed a drawer test that clicked underneath the open menu; it now verifies and clicks an actually uncovered backdrop point. A subsequent full run stalled in the localhost practice server's HTML handling. The isolated Vite transform passed with speculative work disabled, and the original demo HTML/styles passed after bounded explicit dependency optimization, no speculative pre-transforms and a cache under node_modules. The HTTP regression has a thirty-second limit. Temporary diagnostics and the unsuccessful CSS workaround were removed; these development-only changes do not activate hosted services.

Set server `AUTH_ACCESS_MODE=staff-only` and build `VITE_AUTH_ACCESS_MODE=staff-only` together. The candidate hides public My Garage links, disables the customer account page and blocks customer signup/sign-in routes. Staff sign-in stays on the private `/admin` and `/staff` URLs. Old customer authorization attempts cannot complete after switching modes. Production auth refuses staging/unclassified WorkOS keys and requires `WORKOS_ENVIRONMENT=production`.

Staff-only mode independently blocks commerce APIs, service checkout, real refunds, transactional delivery and Drop Alert processing even if a sending/payment flag is accidentally true. It creates no orders or marketing consent. All switches must also explicitly remain false. AuthKit itself must have public signup disabled, invitation-only membership, no domain/JIT admission and no SSO bypass; app-side restrictions do not configure the provider.

Routine authorized navigation retains the fixed session behavior. Sensitive changes still require fresh MFA. Live provider role/membership/session checks, verified email, mandatory organization TOTP, same-origin writes, bounded refresh, PKCE, independent OAuth attempts and stable audit actors remain required. HttpOnly/Secure/SameSite=Lax __Host cookies are issued only on exact HTTPS production origin. Enrollment alone is not MFA evidence.

## Environment manifest

| Setting | Context/scope and required value |
| --- | --- |
| `COMMERCE_ENVIRONMENT`, `SITE_ORIGIN` | Production Functions: `production`, `https://dualboremedia.com` |
| `AUTH_PROVIDER`, `AUTH_ACCESS_MODE` | Production Functions: `workos`, `staff-only` |
| `VITE_AUTH_PROVIDER`, `VITE_AUTH_ACCESS_MODE` | Production build only, public non-secrets: `workos`, `staff-only` |
| `WORKOS_ENVIRONMENT` | Production Functions: `production` |
| `WORKOS_API_KEY`, `WORKOS_COOKIE_PASSWORD`, `DATABASE_URL` | Masked secrets, Production context only. Approved Free-plan Builds/Functions/Runtime scopes require verified build-output safeguards and no preview values. Independently generated production credentials; never staging copies. Database must use verified TLS. |
| `WORKOS_PRODUCTION_VERIFIED` | Keep false until the intended production environment, newly created production key provenance, matching production client ID and isolated configuration are independently verified in the provider. Only then set `true`. Required by runtime for opaque `sk_` keys. Key shape alone is never evidence, and a successful build or staging sign-in is insufficient. Actual production sign-in/MFA remains a separate verification gate. |
| `WORKOS_CLIENT_ID`, `WORKOS_STAFF_ORGANIZATION_ID` | Production Functions: exact isolated production resources |
| `WORKOS_STAFF_GOOGLE_ENABLED` | Production Functions: true only for the approved Google/TOTP method |
| `WORKOS_STAFF_MFA_POLICY_VERIFIED` | False until actual production policy/MFA and bypass checks pass. Never copied from staging. |
| `PAYMENTS_ENABLED`, `REFUNDS_ENABLED`, `TRANSACTIONAL_EMAILS_ENABLED`, `MARKETING_EMAILS_ENABLED`, `DROP_WAITLIST_ENABLED` | Explicit false; Forms remains disabled |
| `STRIPE_SECRET_KEY`, `RESEND_API_KEY` | Omit entirely for this Admin-only release. No sales or sending provider is required. |
| `SENTRY_DSN`, `ERROR_MONITORING_ENABLED` | Production Functions; verified project ingest DSN and enabled monitoring after owner-approved configuration |
| `VITE_SENTRY_DSN`, `VITE_ERROR_MONITORING_ENABLED` | Production build; public ingest DSN and verified monitoring enabled. This is not email/signup activation. |
| `SENTRY_AUTH_TOKEN` | Private release upload process only; never frontend or public packaging |
| `RELEASE_SHA` | Exact reviewed source commit; confirm actual monitoring release tags match it |

`npm run check:admin` is a separate, read-only strict Admin readiness gate. It requires actual production auth/owner/database/backup/security/monitoring/browser evidence as listed by its diagnostics. Flags are operator attestations, not automatic proof. It intentionally remains NO-GO in the current environment. It does not waive `check:launch`, turn sales on, execute migrations or deploy. Merchandise legal/tax/Stripe/email blockers are separate from a closed-store administrative release.

## WorkOS production owner actions and pending tests

The owner must decide whether to unlock production by entering billing details. [Official environment documentation](https://workos.com/docs/authkit/environments) says this is required even within AuthKit's free allowance. AuthKit is $0 within one million monthly active users without paid connections/add-ons; no charge or billing approval is implied here. No custom domain, SSO or paid feature is proposed.

After that separate approval/unlock: create a private production staff organization and roles, use default unprivileged membership, disable automatic admission/SSO/public signup, configure Google production OAuth credentials, and require WorkOS authenticator MFA. Use exact callback `https://dualboremedia.com/api/auth/callback`, exact owned origin and allowlisted local app destinations. Use the normal WorkOS hosted domain, not a paid custom domain.

Two individual owner identities must be named and verified; only one owner login has been demonstrated in staging. Do not treat a shared inbox, Google profile name, staging membership or client-supplied metadata as two production admins. Each initial membership/promotion needs explicit approval and verified MFA. Require real production sign-in, Google plus TOTP, routine navigation beyond ten minutes, step-up, logout/revocation, recovery, customer/employee denial and no self-promotion. Provider MFA evidence can be verified in production before setting the evidence switch; application Admin testing remains pending until an approved deployment makes this candidate available.

## Database migrations, cost and recovery

Reuse the existing `pg` architecture and checksum migration flow under `migrations/`; no Netlify database package, new database or automatic migration directory was introduced. These are bring-your-own migrations, not Netlify's automatically detected migration files. Apply 001 through 006 only after inspecting the selected clean production database and taking a verified backup. Never edit an applied migration or seed test data. A migration owner and restricted application role are separate; app DML permissions must preserve SELECT/INSERT-only audit history. Keep TLS certificate validation enabled.

The new local `pg_dump`/`pg_restore` rehearsal uses fifteen synthetic variants and stable actor audit, restores into a generated disposable schema, compares all six migration checksums, verifies stock, immutable audit and post-restore writes, and confirms the original schema is unchanged. It is **not** a managed production restore, and proves neither backup freshness nor production role/TLS configuration. CI uses the existing PostgreSQL service's matching-version tools without installing a new database dependency. Local CREATEDB was denied; the rehearsal deliberately uses separate schemas instead of elevating the role.

[Netlify Database billing](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/) meters compute at 10 credits per unit-hour and egress at 20 credits/GB. The [Free plan](https://www.netlify.com/pricing/) has a shared 300-credit monthly cap; usage elsewhere reduces the database budget. It is not an unlimited always-on database. Published storage guidance still references billing no earlier than July 1, 2026, already past this audit date: verify current storage treatment and limits in billing before any approved activation. Do not assert indefinite free storage or enable auto-recharge.

[Managed recovery](https://docs.netlify.com/build/data-and-storage/netlify-database/backup-and-recovery/) restores production data and can discard later changes. A code rollback does not restore the database. Obtain explicit approval before an actual restore; preserve current data and rehearse a recovery with the owner/provider. No restore or backup settings were changed during this audit.

## Deployment, health and rollback procedure: not executed

1. Resolve credential cleanup, production billing/access, two owner identities, database cleanliness/roles/TLS/migrations/managed restore and monitoring evidence. Approve a database usage budget and alert/credit-exhaustion response. Keep all sales/email/signup switches false.
2. Verify the exact committed tree, CodeRabbit, coverage, real PostgreSQL, three-browser profile, client-secret checks and six CI jobs. Build with public `VITE_AUTH_ACCESS_MODE=staff-only` and WorkOS selection. Preserve Sites packaging and private source-map handling. Confirm `dist/client` and bundled Functions are both included; static HTML alone is insufficient.
3. Stop for explicit approval naming the exact SHA, existing production site, Admin-only scope and unchanged main. A green gate or `[skip netlify]` commit is not deployment permission. Never add a deploy marker or trigger a hook for this preparation.
4. Only after that approval use the established reviewed deployment procedure for that exact tree, explicitly targeting the client artifact and Functions. Recheck the approved production-only secret contexts, scopes and build-output safeguards. Do not merge main or depend on the saved `dist` UI path.
5. Unauthenticated `/api/auth/session` should return a safe JSON denial, not HTML; a configuration 503 or database failure is not healthy auth. With approved owners, verify session 200, Admin/Staff reads, fresh sensitive operation against an explicitly disposable inactive production QA record, denial/revocation and logout. No orders, payments, refunds or emails are test side effects. Record policy evidence before enabling its verification switch.
6. Send a separately authorized controlled monitoring exception, verify its source-mapped release/request IDs, redaction and actionable alert. Never log credentials, cookies, OAuth codes or customer addresses. Browser tests use a reporter fixture and cannot prove delivery.
7. Confirm public no-selling/no-signup pages, no customer-account entry, private route caching/noindex, and direct API denials. If verification fails, disable the new auth access/rotate compromised sessions as approved, then restore the known non-selling deploy `6ad82fbc7f1493fac15781e9` only with the separately approved rollback authorization. Keep sales switches false. Retain audit/database state; code rollback is not permission to erase data or restore a database.

## Current business source of truth and remaining decisions

Future apparel: tee $30, each sweatshirt $50; USA only; reliable calculated shipping or approved $9.95 flat fallback; made-to-order physical carrier handoff target five business days after payment confirmation, excluding weekends and holidays, with carrier transit additional. Voluntary size-exchange requests within thirty calendar days after delivery; unused/original condition and customer-paid both shipping legs, preserving remedies for seller errors. Manual support/privacy inbox: midohiomx@gmail.com. The personal operating/return street address stays out of public source.

Final holiday dates/calendar/timezone, actual capacity, approved-return mailing deadline, retention/deletion, final policies, tax registration and actual sales-provider verification remain separate sales blockers. Government registration is deferred. Historical $30-all/$7 sandbox fixtures and Clerk notes are not current production instructions.

**Assessment: NO-GO for a production Admin release now.** Code preparation and local/staging evidence do not unlock WorkOS production, verify the existing database or authorize deployment. Exact owner actions: approve the credential cleanup procedure, decide/complete WorkOS billing unlock, identify the second individual owner, approve production membership grants and database usage/configuration/recovery, approve monitoring configuration/controlled test, and finally authorize the exact release deployment after remaining checks.
