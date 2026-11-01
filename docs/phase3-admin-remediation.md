# Phase 3: production Admin remediation, NO-GO

Read-only provider audit: November 1, 2026. Starting development commit: `8dc19f3ae81b0873912b8855fa5ee9d7affa6d0e`. Branch: `codex/commerce-test-foundation`. This checklist is not permission to change providers, secrets, data, billing, main or production. The published non-selling release remains `0b5f47404c604ceeddf59afe918a832c327ef447`.

## Prioritized owner actions

| Priority | Decision/approval needed | Completion evidence, recorded privately |
| --- | --- | --- |
| P0 | Authorize identification and revocation of the potentially exposed Resend key, then removal of the two malformed Netlify labels | Exact affected key privately matched, revoked state and usage review; sanitized Netlify inventory shows zero credential-shaped labels |
| P0 | Decide whether to unlock WorkOS production using billing information; no paid add-on, custom domain or enterprise connection | Approved spending boundary; actual production environment accessible without purchasing an upgrade |
| P0 | Name a second independent Admin owner and approve each private production membership and promotion separately | Two distinct verified identities, each Google primary authentication plus organization-required TOTP; no shared account |
| P0 | Approve a production database inspection/backup and a separately scoped migration/role change | Correct database identity, clean/understood contents, current recoverable backup, restricted application credentials and migration checksums |
| P1 | Approve the database credit budget, exhaustion response, backup retention and recovery objectives | Actual account rates/usage, remaining credits, acceptable recovery point/time and named recovery owner |
| P1 | Approve free monitoring project configuration, alert destination and a controlled synthetic exception | Actual plan/quota, received redacted event, resolved source line, exact release/request IDs and deduplicated alert |
| Final | Approve an exact Admin-only release SHA after the remaining checks pass | Separate explicit deployment instruction; green tests never authorize deployment |

None of these approvals was executed during this phase. Customer registration, orders, payments, refunds, transactional email, marketing and signup collection remain closed. Government registration is deferred and is not a prerequisite to this engineering audit.

## 1. Malformed variable remediation: precise approval boundaries

The fresh site inventory still has two all-context labels resembling credentials, with empty values and non-secret metadata. Their literal names, identifiers, suffixes and fingerprints must never be exported, screenshot, logged or committed. Shared team inventory was empty.

**Resend label: potentially exposed sending credential.** The read-only provider inventory lists one named website API key, but returns no token; this does not establish which key the malformed label contains. A verified sending domain also does not prove app sending or delivery. Do not infer a match or revoke a different key.

1. Owner authorizes private matching in the Resend API Keys dashboard and inspection of the candidate's existing consumers/usage. Never paste the token in chat. If matching is impossible, obtain explicit approval to rotate the identified candidate and coordinate any other consumers.
2. At the destructive step, obtain approval naming the privately identified provider key and account. Revoke that key in Resend, then verify revoked/deleted status and inspect available usage records for unexpected sending. Do not send a test message. Record only the result, not the key.
3. Separately approve deletion of the malformed **Resend-shaped label** in the existing Netlify site across all contexts. Removing a label does not revoke a credential or erase logs/history. Restrict diagnostic exports and review who could access past labels.
4. **Do not create a replacement for the Admin-only release:** it needs no sending key. A later email phase requires separate creation, secret-storage and controlled-delivery approval. Create/store privately through a supported secure provider path; do not use a connector that requires displaying the new token in chat.
5. A later replacement belongs only in correctly named `RESEND_API_KEY`, marked secret and scoped to production Functions. Never put it in a label, `VITE_`, build output or all contexts. Verify effective scope/secret status; an update of an existing entry may not change its metadata. Recreate only with approval if needed.

**Stripe label: test publishable key, not a secret-key compromise.** Publishable keys are intended for client use. Obtain approval to remove this malformed label separately; no Stripe secret rotation, new products, transactions or replacement payment key is needed. Do not misrepresent the label as evidence of live financial compromise.

Read-only post-cleanup verification should report category counts only. Require zero credential-shaped labels and no secret-like client variables. Keep payment/sending credentials absent and all five activation switches explicitly false. Fresh remote metadata shows four false switches; `REFUNDS_ENABLED` is absent and must be explicitly false in the future candidate configuration. The currently published code defaults refunds closed; absence is not evidence of activation.

## 2. WorkOS production configuration and evidence checklist

WorkOS production was locked behind billing information in the October 31 inspection; that UI was not changed or re-certified today. [Official environment terms](https://workos.com/docs/authkit/environments), checked November 1, say production requires billing information, AuthKit is free up to one million monthly active users and OAuth connections are free. Enterprise connections and over-limit usage can incur charges. Proposed auth cost is **$0 within that allowance**, not an unconditional forever-free promise. No billing details, paid custom domain, Clerk upgrade or WorkOS add-on are authorized.

After separate authorization, an owner/operator must configure and record:

- Isolated production environment, key/client ID/cookie secret and private staff organization. Never copy staging keys, users, organizations or verification flags. Use the ordinary hosted AuthKit domain and free branding controls.
- Google authentication for the production application, exact callback `https://dualboremedia.com/api/auth/callback` and owned origin. Disable public signup, domain admission, JIT/SSO admission and alternate-method bypasses. A verified email or Google identity alone grants no role.
- Default membership unprivileged. Obtain explicit approval for each of two independently controlled owner accounts. Invite/enroll as ordinary members; promote only after verified email, actual Google sign-in and completed required TOTP. No self-assignment, shared inbox login or browser metadata as authority. Do not reuse an enrollment flag as completed MFA evidence.
- Organization-required authenticator policy, recoverable independent owner access and owner-held recovery procedures. Test recovery cannot bypass MFA or silently grant privileges. Never collect passwords, TOTP seeds, backup codes or current codes in chat/source.
- Current server-side user, organization, membership, session and role checks on every privileged request. Test removed role/member, revoked session and changed MFA policy against a still-open browser. Employee cannot access Admin mutations; customer and unrelated organizations are denied. Stable provider user ID remains the audit actor after role/email changes.
- Production HTTPS `__Host` HttpOnly/Secure/SameSite=Lax sessions, bounded refresh, signed state/PKCE and allowlisted returns. Verify fixation, replay, expiration, logout and cross-account denial. Routine navigation must not restart the fixed MFA loop; sensitive actions still require explicit fresh verification.

Working staging and fixture tests are supporting evidence only. Production policy, two owners, recovery, real revocation and deployed-session behavior remain **unverified**. Never set evidence variables true to make the gate green.

## 3. Database audit and approved future procedure

No production database query, schema/role change, backup setting or restore was performed. October 31 dashboard observations remain dated evidence: existing managed production branch, small reported storage, sleep enabled, three-day scheduled retention and last-publish backup only. These are not proof of clean contents, current backups or usable restricted credentials. A managed database binding need not appear among ordinary Netlify environment variables.

Engineering inspection confirms the existing `pg` runtime uses a server-only `DATABASE_URL`, a maximum of two connections **per runtime instance**, bounded connection timeout and a transaction advisory lock. Across instances the connection total can grow. The repository deliberately serializes state operations and is intended for low volume; measure connection/lock pressure before future automation or higher order volume. Do not switch database libraries or provision a second service during this audit.

The strict gate requires a distinct non-local PostgreSQL URL with `sslmode=verify-full`. Do not disable certificate validation. Privately verify actual server identity, TLS, expected database/schema and connection/pool limits before admitting the application role. Current runtime construction alone is not a production TLS/permissions test.

Approved future sequence, with a named database owner:

1. Explicitly authorize read-only production inventory and current backup verification. Inspect the migration ledger and table counts without exporting customer rows. Confirm the selected branch is production, not the sandbox, and agree acceptable recovery point/time.
2. Capture/verify a protected pre-change backup. Restore rehearsal must use an approved isolated recovery target; creating it may cost credits and also needs approval. Do not use the provider production Restore button merely to test it.
3. Review the immutable files `001_commerce.sql`, `002_operations.sql`, `003_support_marketing.sql`, `004_fulfillment_attribution.sql`. The documented `db:migrate` flow uses a single transaction/advisory lock and SHA-256 ledger; applied checksum mismatch aborts. Do not edit applied migrations, auto-run during app startup or seed synthetic orders/inventory in production.
4. Separately authorize the exact migrations and role grants against the confirmed target after backup verification. Use a migration owner distinct from a non-superuser application login. Application needs schema usage and only necessary table DML; audit history must be SELECT/INSERT only, no UPDATE/DELETE/TRUNCATE, DDL, ownership or trigger bypass. Verify least privilege using the actual application role, not the migration owner.
5. Validate checksums, table/constraint presence, bounded connections, failed-write rollback and append-only audit. Record sanitized outcomes. Local synthetic dump/restore tests do not certify managed production recovery.

[Netlify billing](https://docs.netlify.com/build/data-and-storage/netlify-database/billing-and-usage/) meters compute and egress (10 credits per compute-unit-hour and 20 credits/GB). The shared Free credit allowance is limited; other site usage consumes it too. Sleep reduces idle usage but is no cost guarantee. Published storage guidance still refers to July 1, 2026, now past; resolve the current storage rate in the account before activation. Do not enable auto-recharge or promise $0 database operation.

[Managed recovery documentation](https://docs.netlify.com/build/data-and-storage/netlify-database/backup-and-recovery/) states daily and publish-triggered backups, Free scheduled retention of three days and only the latest published backup. A provider restore replaces the **production database** and can lose later changes. Actual retention/freshness, protected export retention, restricted recovery access, off-provider coverage and restore time remain owner decisions/unverified. Code rollback does not roll back data. A restore needs separate target/time/data-loss approval, preservation of current data and a rehearsed reconciliation plan.

## 4. Monitoring, safe logs and release identity

The existing adapter/boundary and [observability runbook](observability.md) are retained. Local tests verify fixed safe exception text, allowlisted context, source coordinates/debug IDs, request correlation, release tags, bounded flushing and secret/PII removal. No user/request bodies, addresses, cookies, tokens, provider payloads, tracing, replay or ambient breadcrumbs should be collected. Private source maps stay outside public output; account-management upload tokens never enter `VITE_` or packaged Functions.

Before approved activation, record the actual Sentry project/plan/error quota/retention and free alert capabilities; no quota values are invented. [Sentry says Developer remains free](https://www.sentry.help/en/articles/16738709-changes-to-legacy-developer-plans-september-2026) and [does not allow on-demand spending](https://www.sentry.help/en/articles/13965037-can-i-set-up-an-on-demand-pay-as-you-go-budget-for-my-free-developer-plan). Quota exhaustion is a monitoring coverage gap, not permission to buy an upgrade.

Owner approval must cover the project, recipient/destination and synthetic event. Group actionable auth/5xx/database failures, deduplicate and use a cooldown; exclude expected access/validation errors. Verify a controlled event and source-mapped original line for the exact release SHA and safe request ID, plus absence of redaction canaries/customer data. Verify the alert actually arrives. No production event, email or alert rule was sent/changed in this phase. Real delivery, alerts, source-map resolution and hosted Function-log redaction remain unverified. Needs Attention retains its five grouped tasks per page; no fabricated orders or automatic sending/refunds.

## 5. Engineering versus owner evidence and GO/NO-GO

`check:admin` is strict and read-only. The default local diagnostic run reports **43 blockers** because production configuration/evidence is deliberately not loaded into that shell. This count is not a claim that all 43 are missing in the provider account. The fresh remote inventory independently confirms malformed labels and missing explicit refund-off configuration; production credential/binding and policy evidence still needs approved verification.

Engineering tasks for this candidate: reproduce/fix narrow public/Admin UI issues, regression tests, full coverage/security/real-local-PostgreSQL/three-browser checks, independent CodeRabbit review and exact-commit CI. Record fresh results and limitations in the private handoff; do not treat historical green jobs as this commit's results.

Owner-dependent blockers: credential cleanup approval/matching, production WorkOS unlock and two approved owners, production database budget/access/migrations/recovery, monitoring configuration/controlled event, and final exact-release approval. Engineering must then execute the approved verification; a declaration alone is insufficient. **Production Admin remains NO-GO.** The current public non-selling site remains unchanged. Future automation, YouTube management and a comprehensive security review follow this evidence, rather than bypassing it.

## Reproduced UI fixes

- Admin: Daily workflow > Start production filters to one order but displayed `1 orders`. The counter now distinguishes zero, one and multiple results, with a rendered regression for each.
- Public: Merch > Release updates placed the YouTube and privacy links directly against each other. A wrapping navigation group adds clear spacing and 48px targets. Rendered checks exercise 320px, 390px and desktop, preserving closed orders/signups and keyboard focus.
