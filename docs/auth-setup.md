# Managed accounts and administrator verification

## Current target: WorkOS AuthKit

The October 15 owner correction selects WorkOS AuthKit evaluation/migration instead of a paid Clerk upgrade. Read [the provider decision](auth-provider-decision.md) for the $0 use case, hosted domain, cookie/PKCE integration, staff organization MFA policy and remaining real-provider checks. No deployment is authorized and payments remain false. Configure AUTH_PROVIDER=workos and VITE_AUTH_PROVIDER=workos consistently. Staff/admin memberships must be explicitly granted in the private staff organization; customer signup never grants either role. Actual hosted verification, recovery, revocation and MFA are not yet demonstrated.

## Historical Clerk compatibility path

The following describes retained legacy code and tests only. Do not upgrade Clerk, configure new Clerk production access or treat this legacy guide as the selected production setup.

Clerk supplies authentication, verified email, passwordless sign-in, recovery, session expiration and MFA. The React SDK supplies its managed account controls; the backend SDK verifies signed session tokens. No application password storage, password hashing, custom JWT implementation or browser-provided role is used.

## Required owner configuration

Create a dedicated Clerk development instance for sandbox validation and a separate production instance for the approved owned domain. Configure email verification as required, email code/link sign-in, optional passkeys, recovery and an appropriately short session lifetime. Enable authenticator-app MFA and enroll every administrator. Check the selected Clerk plan's MFA availability before launch; do not weaken enforcement to fit a plan.

Configure server-only `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` and exact `SITE_ORIGIN`. Only the publishable key may also appear as `VITE_CLERK_PUBLISHABLE_KEY` for the frontend. Never put the secret key in a `VITE_` variable. Configure authorized origins and redirects for the actual approved domain and separate loopback sandbox. Production instance configuration and real sign-in/recovery/MFA checks remain launch blockers until validated against that instance.

Promote an administrator using Clerk's authenticated owner dashboard/backend by setting **private metadata** `{"role":"admin"}`. The application has no customer-accessible role-write endpoint. Public metadata, unsafe metadata, organization roles, token role overrides and local storage do not grant administrator access. Remove private metadata to revoke the role; requests re-fetch the current user and session, so role revocation and session revocation take effect without waiting for JWT expiry.

## API contract

The React frontend obtains a fresh Clerk session token and sends `Authorization: Bearer <token>`. API cookies are deliberately ignored. Requests must target `SITE_ORIGIN`, any supplied Origin must match, and the verified token's authorized party must match. The SDK accepts session tokens only. On each request the backend checks the active, unexpired session and current non-deleted/non-banned/non-locked user. Only the currently verified **primary** email is used for ownership checks. No client email or historical JWT email is trusted.

Administrator endpoints additionally call `requireAdmin`. They require both enrolled MFA and a signed session second-factor verification age from zero through ten minutes. Missing/stale second-factor evidence fails closed; first-factor-only reverification cannot substitute. The frontend should offer Clerk's reverification controls when `mfa_required` is returned and then acquire a new token before retrying. Impersonated sessions are rejected.

Recovery and sign-in are provider-managed. Account deletion requests must be recorded through the application's authorized workflow; a request is not a promise to delete payment records that must be retained. Deleting a Clerk user disables subsequent access immediately through the fresh user lookup. Document the business's retention policy before launch.

## Validation boundary

Unit tests inject a Clerk-shaped client to exercise fail-closed authorization, revocation, verified email and MFA behavior. This is not evidence of an actual Clerk sign-in, MFA challenge, recovery delivery or production configuration. Those require a configured owner-controlled Clerk instance and rendered end-to-end tests. Never expose an HTTP impersonation/test-token bypass to make those checks pass.

Official references checked October 13, 2026:

- [Backend request authentication](https://clerk.com/docs/reference/backend/authenticate-request)
- [Current backend session lookup](https://clerk.com/docs/reference/backend/sessions/get-session)
- [Backend user fields](https://clerk.com/docs/reference/backend/types/backend-user)
- [Private user metadata](https://clerk.com/docs/guides/users/extending)
- [Session factor verification ages](https://clerk.com/docs/reference/backend/types/auth-object)
- [Reverification and first-factor downgrade warning](https://clerk.com/docs/guides/secure/reverification)
