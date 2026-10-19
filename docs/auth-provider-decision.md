# Authentication decision and migration boundaries

Reviewed October 15, 2026. Deployment is not authorized. Payments remain false; email activation remains gated. Ohio registration is deferred. Passing any checklist is not permission to deploy.

## Selected target: WorkOS AuthKit

The official [pricing](https://workos.com/pricing) includes AuthKit user management, MFA and RBAC for up to one million monthly active users. The expected recurring authentication charge for this store is **$0/month** while within that allowance, without enterprise SSO/Directory Sync connections, a paid custom domain or other paid add-ons. [Production environments](https://workos.com/docs/authkit/environments) still require billing information. The owner must complete that sensitive step; no card or paid plan has been added by this implementation. Usage above the free allowance is not authorized.

Use the standard hosted AuthKit domain and environment branding. Do not confuse paid enterprise Admin Portal branding with ordinary [AuthKit branding](https://workos.com/docs/authkit/branding). Verify the available dashboard controls before saving; do not buy a custom domain.

## Staff MFA without burdening customers

Create a private staff organization with explicit employee/admin memberships and a mandatory [organization MFA policy](https://workos.com/docs/authkit/organization-policies). Enable email/password and authenticator TOTP; do not enable SSO or domain/JIT automatic staff provisioning. Organization MFA excludes SSO users, so accepting SSO here would invalidate the intended protection. Customers remain outside the staff organization.

Privileged APIs reread the current verified user, active session and active staff membership. Token role claims alone cannot grant access. Staff access additionally requires the correct organization-scoped session, current TOTP enrollment, password authentication and a recent signed auth_time. WORKOS_STAFF_MFA_POLICY_VERIFIED remains false until actual hosted sign-in, enrollment, policy enforcement and bypass attempts have been tested. WorkOS does not document a policy-read endpoint used by this integration, so policy configuration is an explicit operational prerequisite, not an automatically inferred guarantee. Review provider policy changes as security changes.

## Session and identity migration

The Node SDK seals server-held access/refresh tokens into an HttpOnly, Secure, SameSite=Lax __Host cookie on HTTPS. Authorization-code exchange uses PKCE and browser-bound, encrypted, short-lived, single-use state. Mutations require the exact same Origin. No refresh token is stored in localStorage. This avoids the React SDK's documented development-mode storage tradeoff when using a free hosted domain.

Revoked or expired sessions fail on the next authenticated server request. Current role changes are fetched from WorkOS rather than waiting for JWT expiry. Reauthentication uses the hosted staff sign-in route. AuthKit handles verification and password recovery; the application never receives or hashes passwords.

WorkOS actors use stable workos:user_ID identities. Legacy Clerk identities and audit records are preserved. Do not silently remap users or ownership by browser email, import sandbox identities into production or rewrite audit history. Existing guest-order claiming requires a freshly verified email and independently checked order ownership. Legacy Clerk code remains an explicit compatibility path during migration, not a second authority for a configured WorkOS request.

## Better Auth comparison

[Better Auth](https://better-auth.com/docs/installation) is the fallback: no authentication SaaS license fee, existing PostgreSQL compatibility, official [TOTP and backup-code plugin](https://better-auth.com/docs/plugins/2fa), admin/access control and [rate limiting](https://better-auth.com/docs/concepts/rate-limit). Infrastructure and email costs are separate from a free software license. Migration would add owned auth tables/migrations, email verification/recovery delivery, persistent rate-limit storage, cookie/session lifecycle, MFA recovery and upgrade/security operations. WorkOS has lower ongoing operational responsibility and a hosted recovery flow; both require real session, MFA, escalation and IDOR tests.

## Not yet verified

WorkOS account setup, production billing unlock, actual free branding, hosted signup/recovery, mandatory staff MFA and backup/recovery procedures, production origins/session settings, staff administration and real revocation remain launch blockers until demonstrated. SDK contract tests prove local signature/sealed-cookie behavior, not a real account's policies. No deployment, paid upgrade or live activation is authorized by this document.
