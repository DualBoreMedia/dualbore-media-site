# November 7 Admin and catalog candidate

This source candidate is prepared on `codex/commerce-test-foundation` from
`6c0f59aa04db739b647e5c3f67d309582ac1ceb8`. Production/main is a separate
release; no merge, deployment or production migration is included.

## Workflows

- Admin > MX Bikes: choose manufacturer, search the existing 53-bike roster,
  choose exact bike, choose MX/SX/track, and save a private setup draft.
  Prices are proposed $2/$2/$1. Enter only actual tested OEM/game versions.
- Save before attaching/replacing an STP. Selected bike/year must match its
  embedded identifier. Replacement retains immutable original bytes, prior
  metadata/checksums and resets testing. A published preview is downgraded
  after replacement to avoid retaining a stale verified label.
- Duplicate active identities (bike + classification + normalized track) are
  rejected inside the repository transaction, including concurrent requests.
  Existing public preview identities stay reserved while draft edits are private.
- Draft, File received, Testing and Verified are distinct from sales approval.
  Verified describes recorded owner testing, not an automated riding test.
  Approve public preview shares only saved metadata; Hide or Archive removes it.
  Digital sales publication remains unconditionally blocked.
- `/setups` defaults to manufacturer/exact-bike selection with MX/SX/track slots.
  URL bike selection survives reload and back/forward. Recorded TC125 samples
  remain untested. No new missing owner files were imported.
- Home Drop 01 and `/shop` use one catalog projection and identical discovery.
  Publication replaces a saved snapshot; draft edits do not leak. API failures
  show retry without reconstructing an old listing. Successful metadata may
  remain in the existing CDN cache for up to 30 seconds.

## Production observations and remaining owner actions

- Fresh GitHub read confirmed development `6c0f59a`, main `cfc3369` before work.
  They diverge; no history reset or merge was performed.
- Named production reads verified PAYMENTS_ENABLED, REFUNDS_ENABLED,
  TRANSACTIONAL_EMAILS_ENABLED, MARKETING_EMAILS_ENABLED and DROP_WAITLIST_ENABLED
  are false. AUTH_ACCESS_MODE and VITE_AUTH_ACCESS_MODE are staff-only.
  YouTube sync is unset. DIGITAL_DELIVERY_ENABLED was unset/fail-closed and has
  now been explicitly saved false in Production, without triggering a build.
- Automatic approval review rejected a complete environment inventory because
  it could reveal secrets. Only the named non-secret switches were read instead.
  Credential-shaped labels, secret provenance and secret scopes were not freshly
  reverified. Prior exposed Resend-key revocation and label cleanup remain pending.
- WorkOS and Sentry currently present sign-in pages. Owner sign-in handoffs are
  open. No new organizations, invitations, roles, OAuth clients or paid plans
  were created. Prior required-MFA/private-org settings are historical evidence,
  not a newly proven login/revocation flow.
- Production cookie-secret approval remains pending. Google OAuth requires the
  owner's Google Cloud client configuration and provider consent; do not copy
  staging credentials. Enroll the approved independent owners, require TOTP,
  approve private membership/promotion, then exercise recovery/logout/refresh,
  sensitive step-up and immediate role/session revocation.
- Database CLI local status is not production evidence. Remote status refused:
  `The project must be linked with netlify link to target a remote branch.`
  No lower-level API/credential workaround was used. Netlify's browser also needs
  sign-in. Production schema/roles, current backup coverage, costs and restore
  evidence therefore remain unverified in this sprint.
- Existing migrations 001 through 007 are unchanged. This sprint adds JSON
  metadata and uses those tables; no eighth migration is required. The documented
  checksum-preserving migration flow remains in place. Before production schema
  work: approve target/role, obtain current backup, inspect existing contents,
  rehearse restoration in an isolated target, then separately approve application
  migrations and least-privilege grants. Never restore over production as a test.
- Monitoring still requires authenticated project inspection, owner-approved
  controlled test exception, resolved release source maps and alert/redaction
  verification. Do not set evidence flags true from mocks or enable paid usage.

The strict Admin-only gate remains NO-GO. Diagnostics from an unconfigured local
shell are not a count of actual missing production settings. The public website
gate and local test results do not grant production readiness or deployment.

## Validation boundary

The preserved local database initially refused migrations because Windows CRLF
checkouts differed from the recorded LF checksums. Read-only comparison proved
all four mismatches were line-ending-only. The runner now accepts only exact
LF/CRLF equivalents, preserves recorded checksums and rejects substantive SQL
edits. Its seven local migrations were then verified/applied without resetting
existing data. No production migrations were run.

CodeRabbit reviews found and prompted fixes for normal-tab keyboard activation,
archive/import success wording, archived records consuming the active catalog
query limit, and duplicate browser-history entries. Each correction has regression
coverage. No paid review allowance or plan was purchased.

Node and rendered component tests, real local PostgreSQL generated schemas and
three-browser journeys exercise the implementation. Browser Admin identities and
provider responses are synthetic; payment/email tests use mocks. These do not
prove real production WorkOS enrollment or actual email delivery. Screenshots,
logs, synthetic file bytes and environment files stay outside committed source.

After all checks and review pass, record the exact development SHA and six CI
jobs. Obtain separate exact-release deployment approval; keep every sales,
refund, sending, signup and digital-delivery gate false.
