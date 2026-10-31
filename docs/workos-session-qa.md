# WorkOS MFA loop remediation

Scope: localhost staging only. Production authentication, payments, refunds to real providers, emails and signup collection remain disabled. No deployment or main merge is authorized.

## Reproduced mechanisms

- An authorization attempt started at 05:23 UTC returned at 05:40 UTC on October 31, 2026 (October 30 local time). Its ten-minute encrypted OAuth state had expired. The app correctly rejected it with invalid_auth_state; this was not a bad authenticator code.
- Staff sign-in always requested maxAge=0, and every staff permission required auth_time within 600 seconds. A valid provider session therefore lost ordinary dashboard access after ten minutes. A regression test reproduced this denial before the fix.
- One shared OAuth state cookie let a second sign-in tab replace the first attempt's state. Tests now complete both independent attempts and reject their replays.
- SDK retryable refresh failures were returned as HTTP 401, misclassifying an upstream interruption as sign-out. Tests reproduced this before the fix; transient results now return 503 without clearing the cookie, while terminal outcomes return 401 and clear it.
- A live staging HTTP-clock comparison showed a small provider clock lead (with HTTP Date's second-level precision). The strict auth_time <= local-now predicate could reject an otherwise verified just-issued authentication. A regression reproduced this with a two-second lead; a bounded 30-second allowance now accepts that case and rejects a 31-second lead or a missing time. JWT signature, issuer, expiry, session status, organization and mandatory MFA checks remain unchanged. This is a reproduced timing mechanism, not proof of the exact predicate behind the historical first 403.
- The local preview's dependency cache outside node_modules caused optimized bundles to be transformed again; overlapping development restarts also collided on port 4320. The commerce cache now stays separate under node_modules and the local preview was restarted once cleanly. This is a local development issue, not evidence of a provider MFA failure.

## Real provider evidence

The owner completed a real organization-scoped Google and WorkOS TOTP flow. Its callback returned 303 and GET /api/auth/session returned 200. An initial staff request returned mfa_required/403; its exact failed predicate was not captured at that instant, so no retrospective claim is made about which predicate failed. The existing session subsequently refreshed successfully and reached both real Staff and Admin with current provider role checks and isolated PostgreSQL.

Boolean-only temporary diagnostics verified Google primary authentication, OAuth transport, required-policy evidence, current TOTP enrollment and matching token/session staff organization. Once auth_time was older than ten minutes, freshness was false while session verification and ordinary operations reads returned 200. Admin Inventory and Staff Employees survived reload and navigation without another challenge. No tokens, cookies, codes, email addresses or provider secrets were logged by these diagnostics; the temporary diagnostic code was removed.

An inactive synthetic inventory fixture was added only to the isolated local auth schema. Its attempted adjustment with older MFA was rejected with step_up_required before any variant change. The UI retained the view and displayed an explicit verification action, without an automatic redirect or retry loop.

The low-level browser network recorder later stalled and evicted its events; no complete raw network trace is claimed. The owner's subsequent real authenticator verification succeeded at WorkOS, but that delayed app return had expired. The previous app session remained valid. A normal organization sign-in reused the just-completed provider verification without another prompt and returned directly to the intended Admin Inventory view. Its fresh server-side authorization permitted the explicitly confirmed inactive test variant adjustment from 2 to 3. Admin Orders, Staff Employees and reload remained usable, and application sign-out returned to the signed-out account page. The database confirmed quantity 3 before the disposable fixture was removed. No sellable product or external provider was mutated by this inventory check.

This rendered check also exposed a missing notice when a failed verification preserved an older signed-in session. A dismissible verification notice now explains the failure without discarding that session or restarting login. Dismissing it removes only the auth query flag and preserves the destination/view.

## Security boundaries

Mandatory organization MFA, verified email, current TOTP enrollment, active session, exact organization, live membership/role reads, issuer/signature/expiry checks, same-origin mutations, rate limits, HttpOnly cookies and stable actor IDs remain required. Enrollment alone is insufficient. Sensitive changes require separate fresh verification. Customers and unapproved methods cannot obtain staff access. No form payload, secret or customer shipping information is placed in the return URL or persistent browser storage.

Hosted session policy is an operational prerequisite because this adapter does not use a documented provider policy-read API. Production requires its own policy and end-to-end evidence. Synthetic browser and service tests do not prove hosted MFA, real provider revocation or production readiness.
