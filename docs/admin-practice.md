# Local admin practice

Start in the application repository with `npm run demo:admin`. The existing local PostgreSQL sandbox must be running on `127.0.0.1:55432`, database `dbm_sandbox`; its ignored `.env.local` supplies `DATABASE_URL`. The demo deliberately rejects other database targets, hosted environments and production mode. It does not load real payment, email or authentication handlers or inherit their secrets.

Open **http://127.0.0.1:4330/__demo/admin**. Use **Staff / Employees** for the fulfillment queue and account-management practice. Use only synthetic information ending in `@example.invalid`. Each launch creates a separate schema with all real migrations. Changes survive browser refresh. **Reset demo orders** replaces only that disposable schema and restores the original eight scenarios. A normal stop discards its schema; restarting begins fresh. Production is never copied or changed.

## Fast daily workflow

1. Review **Needs attention**, urgent refunds and shipping deadlines first. It shows at most five grouped tasks per page, with category filters and next/previous controls. A specific shipping-delay task replaces the same order's generic stale-progress reminder. Nothing is silently dismissed; individual records remain in Activity. Queued email records are lower priority and do not mean email sending is active.
2. **Start production**, then **Continue making**, automatically open the corresponding oldest-first paid-order queues. Check blanks and capacity before changing an order's status.
3. **Pack orders** opens the packing queue. In Staff, create split packages, enter synthetic tracking, and preview/print the package-specific packing slip. Printing creates no carrier label or shipment.
4. **Carrier handoff** opens ready-to-ship work. Only confirm shipment after actual physical handoff, never after label creation. Demo confirmations change synthetic records only.
5. **Review holds** and **Customer requests** open the matching work. A support resolution is an internal record, not an email reply.
6. Check Activity for actor IDs, state transitions and unresolved provider records. Counts refresh after saved changes. Automation here sorts, groups and routes work; refunds, cancellations, handoff and messaging are not performed in the background.

## Scenarios

- 1001: new paid order, two tee units and a crewneck; customer ownership fixture.
- 1002: making; 1003: packing with a partially allocated package; 1004: packed and ready for carrier handoff.
- 1005: shipped with deliberately missing tracking; 1006: cancelled with a refund required.
- 1007: supplier-delay response pending (notice is explicitly **DEMO-NOT-SENT**); 1008: overdue production.
- Inventory includes made-to-order variants, a low stocked variant and a sold-out stocked variant.
- Practice role, Expire MFA, Revoke session and Restore session exercise server-side denials. Reset restores changed roles too. These are localhost synthetic identities, **not WorkOS authentication evidence**.
- The five-business-day promise excludes weekends and illustrative holidays. The example calendar is not the owner's final holiday calendar and does not verify real production capacity.

## WorkOS activation checklist

Staging and production require distinct users, organizations, credentials and evidence. On October 21 the staging dashboard was inspected: DualBore Media application, existing loopback callback `http://127.0.0.1:4320/api/auth/callback`, email/password enabled. Automatic domain membership was disabled; organization MFA was made required; enterprise SSO in AuthKit was disabled. JIT membership already required an invitation. The existing admin role and unprivileged default member role were verified; the employee role was created without granting a membership. No provider credential, role membership or billing change was made.

Real staging follow-up: the owner account and email verification now exist, the saved staging key works, and the owner completed authenticator enrollment. The explicitly approved ordinary membership was added to the private staff organization. A real hosted Google sign-in successfully reached the empty account/order screen backed by isolated PostgreSQL. Ordinary membership was denied staff access. Admin promotion remains conditional on verified password and MFA sign-in; enrollment alone is insufficient. Real password/MFA privileged access, recovery and revocation remain verification items. Never set `WORKOS_STAFF_MFA_POLICY_VERIFIED=true` based on fixtures or dashboard configuration alone.

Real-provider testing found two compatibility defects hidden by earlier fixtures: the pinned Node SDK uses `multiFactorAuth.listUserAuthFactors`, and the session issuer is scoped to the client (`https://api.workos.com/user_management/<client_id>`). Both are now enforced and exercised with the installed SDK, including signed foreign-issuer rejection. Local account-only storage uses a separate operations runtime when payments, refunds and transactional emails are explicitly false; it connects only to loopback PostgreSQL and never creates a Stripe client, checkout service, catalog seed or order fixture. Hosted and production execution retain the existing commerce runtime gates. This allows real WorkOS account QA without fake or live payment credentials.

For later production activation, configure server-only `AUTH_PROVIDER=workos`, `SITE_ORIGIN=https://dualboremedia.com`, `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_STAFF_ORGANIZATION_ID`, `DATABASE_URL`; frontend `VITE_AUTH_PROVIDER=workos`; and verify the production callback, staff policy, current sessions and readiness gates independently. API and cookie secrets must never use `VITE_` names. Previously malformed credential-like Netlify variable names need an owner-approved audit and affected-key rotation before activation; do not copy them into this document or alter production during practice.

Keep payments, refunds to real services, transactional/marketing email, Drop Alert collection and Netlify Forms disabled. No deployment is authorized.

Official references: [AuthKit MFA](https://workos.com/docs/authkit/mfa), [organization policies](https://workos.com/docs/authkit/organization-policies), [Node SDK session issuer](https://github.com/workos/workos-node#access-token-issuer-validation), [WorkOS pricing](https://workos.com/pricing). AuthKit user management with MFA/RBAC is currently $0 for up to one million users. No custom domain, enterprise SSO, paid add-on or billing subscription was selected.
