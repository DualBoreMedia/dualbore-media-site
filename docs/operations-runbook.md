# Pre-deployment operations and cutover

The latest October 15 owner correction explicitly prohibits deployment, a main merge and payment activation. Passing a readiness gate grants no deployment permission. A later explicit owner instruction is required. Keep PAYMENTS_ENABLED=false and TRANSACTIONAL_EMAILS_ENABLED=false through initial deployment; verify deployed providers and signed live webhooks, enable verified transactional email, and enable payments last. check:predeploy and check:launch are read-only gates and do not deploy or activate switches. Independent CI, CodeRabbit review and real provider evidence are mandatory. Do not silently purchase recurring services. Production storage must be clean and separate from sandbox orders/customers/shipments. Approved live prices are $30 for the tee and $50 for each crewneck; sizes S/M/L/XL/2XL, made to order. Reliable calculated USA shipping may be used only after verification; otherwise use the approved $9.95 flat charge. Marketing broadcasts remain out of scope.

Business: DualBoreMedia, 55 Union St, Hartford, OH 43013, United States. Owned Porkbun domain: dualboremedia.com. Canonical apex with www redirect. Owner stated 3 days to ship; voluntary size exchanges may be requested within 30 calendar days after delivery, superseding the older 3-day request window. Return unused/unworn/unwashed/undamaged/original-condition items within 14 calendar days after exchange approval. Disclose both customer-paid shipping legs before accepting voluntary exchanges. Seller errors/defects/nonconformity retain mandatory remedies and seller-paid correction shipping.

## Accounts and authorization

See [auth setup](auth-setup.md). WorkOS AuthKit is the selected replacement; see auth-provider-decision.md for current costs, secure cookie design and unverified provider requirements. The following Clerk details describe the retained legacy compatibility path until migration completes. APIs verify Bearer tokens, exact authorized origin, current active session and current verified primary email. Impersonated/deleted/unverified accounts fail closed. Employee/admin roles come from fresh Clerk private metadata. Both require an enrolled second factor verified in the last 10 minutes. Every staff API checks centralized permissions. Clerk's reverification UI cannot override the server's second-factor check. Real Clerk sign-in, recovery, MFA and CSP remain unverified until an owner signs in and configures the instance.

Guest checkout remains available. Authenticated checkout associates an order only when the verified paid receipt matches the verified account email. Guest claims use freshly verified primary email, never browser email or guessed order/session identifiers. Customers receive no address, internal order ID or Stripe reference. Account deletion requests suppress marketing and block ordinary account access pending retention review. The owner must complete managed-account deletion/revocation according to approved retention obligations; there is no arbitrary delete-data API.

## Database and recovery

Migrations 001, 002 and 003 are transactional/checksummed. Do not edit applied files. Run `npm run db:migrate` against the deliberately selected environment with a migration-only owner role. Production application credentials need DML only, no schema ownership/alteration; audit history needs SELECT/INSERT only. Use verified TLS and managed encrypted backups/PITR with approved retention. Back up before migration. Restore into an isolated database, compare orders/inventory and exercise reads/writes before cutover. The local pg_dump/pg_restore rehearsal restored three migrations and fifteen variants into a disposable database; managed production recovery is not yet verified.

All writers use one transaction advisory lock. This favors correctness for low volume and is not a high-throughput architecture. Real PostgreSQL tests cover final-unit locking, stale stock edits, split allocation, append-only audit and competing refunds. Never point destructive QA at production.

## Fulfillment, tracking and attention

Payment and fulfillment are separate. Forward fulfillment is received, making, packing, ready_to_ship. Shipped/delivered derive from recorded packages. Holds resume only their prior stage. Holds/cancellation require exact boolean confirmation and a reason. Fully refunded orders cannot progress to shipment. Refunds/cancellation never silently restock.

Package quantities cannot exceed order quantities across split shipments. Packages move draft -> packed -> shipped -> delivered. Shipping requires ready_to_ship and carrier/service/tracking with HTTPS links and no embedded credentials. Delivery requires recorded manual confirmation, never a date estimate. Actor/time/previous/new events are audited. Legacy sandbox shipments appear as earlier shipments without invented delivery events.

Manual tracking is the enabled provider. The server never fetches arbitrary tracking URLs. Future carrier adapters must authenticate/normalize provider events. [Shippo API pricing](https://goshippo.com/pricing/api) includes a free starter but tracking has fees; no paid service was created.

Needs attention includes failed/uncertain email, failed verified webhooks, stale reservations, inventory inconsistencies, tracking gaps, pending/failed refunds, long-stage orders and deletion requests. Use authenticated Stripe reconciliation or `npm run orders:recover`. Never release stock merely because local time expired. Ambiguous checkout creation without a session ID needs review of the original Stripe request; never create a second purchase to repair uncertainty.

Refunds require admin MFA, confirmation, bounded remaining amount and an immutable idempotency key. Pending requests reserve refundable amount atomically. Stripe Refund objects have no livemode: mode is checked on the original PaymentIntent. State follows authenticated Stripe responses or signed refund events. Keep the same key after uncertainty. Private Help tickets require verified accounts and independently authorized order context. Internal support notes remain admin-only. Ticket tools do not send email or promise a response time before a monitored support workflow exists.

## Email and marketing

Order/merchant, making, shipped, delivered, cancellation and verified refund messages use durable identities. Packing/ready emails are optional (`CUSTOMER_PROGRESS_EMAILS=true`), off by default. Each package/refund has its own identity. Templates escape HTML and include plain text. Payment/fulfillment survive delivery failure. Retry queued/failed records only; ambiguous delivery outside the provider's deduplication window requires manual review.

The owned production email domain is dualboremedia.com at Porkbun. Its Resend sending domain and returned DKIM/Return-Path/SPF records have been verified. DNS verification alone does not establish delivery readiness: a scoped sending key, confirmed monitored reply-to, credential rotation and actual delivery testing remain required. Have the domain administrator review DMARC alignment. Domain/DNS configuration has changed; transactional sending remains disabled.

Marketing is separate; broadcasts are absent. Netlify Forms remains signup source of truth. Configured production storage records explicit consent source/time/policy after the verified event. Account opt-out and confirmed-POST opaque unsubscribe capabilities persist suppression. New purchases/signups cannot silently resubscribe. Before future marketing, check suppression, persist immutable send payloads including unsubscribe links, and add provider List-Unsubscribe headers. Never regenerate changing links inside retries. Hosted form delivery and future campaigns require real validation.

## Future cutover: explicit deployment authorization required

1. Verify the recorded owned domain, legal identity/address, returns, processing time, shipping, product descriptions and final prices. Confirm monitored public support/reply-to, made-to-order availability and tax readiness. Approve policies.
2. Configure owner-controlled production Clerk, private admin roles and MFA. Verify sign-in/recovery/revocation. Set exact `CLERK_FRONTEND_ORIGIN`; generated auth-route CSP permits required vendor challenges and inline styles, never inline scripts/eval. Verify actual provider UI.
3. Provision clean managed production storage with TLS/backups and separate roles. Apply migrations and seed only approved live data. Keep test `stripePriceId` distinct from `liveStripePriceId` and `productionPriceCents`; Checkout independently checks live mode/currency/amount.
4. Live Stripe authentication required. Only sandbox is connected. Complete onboarding and tax/shipping. Do not reuse test prices. Dynamic payment methods remain Stripe-managed, with no custom card inputs.
5. Configure verified Resend and server environment declarations from .env.example. Keep both switches false. Only Clerk's publishable key is public; never VITE-prefix secrets.
6. Rerun tests/audit/browser QA and mandatory pre-deployment checks. Verify the exact commit being deployed is the tested and independently reviewed commit. The latest owner correction requires separate explicit final deployment authorization even if every gate passes. Do not deploy or add a deploy marker without that later instruction.
7. Initially deploy with both switches false. Configure live webhook signing/delivery for completion, expiry, async and refund events. Verify replay/recovery and controlled transactional delivery before enabling email. Enable payments last, only after every activation requirement passes. Verify recovery scheduling.

This runbook and passing gates do not grant authorization; the latest owner prohibition controls. Production remains blocked until actual provider, business and post-deployment checks are satisfied.


## Staff and packing slips

Customer navigation contains no staff/admin links. Direct /staff and /admin access requires a server-authorized staff preflight; employee data excludes prices, payment/provider references, private admin notes and customer account metadata. Employees can perform ordinary fulfillment/package/tracking actions and confirmed delivery; refunds, holds/cancellation, inventory, account administration and role changes require admin. Every staff read/write records stable actor identity; raw session IDs are hashed in read audit metadata. Browser-cached data cannot be recalled from a previously authorized user, but requests always reauthorize and denied requests clear visible staff details.

Admin invitations create ordinary Clerk accounts, with no staff role in public metadata. Verify primary email and MFA before explicit private-role promotion. Self role changes are refused. Staff changes journal intent and confirmed outcome; an ambiguous provider write blocks further access mutations until operator reconciliation in Clerk and the audit. Do not generate a new request merely to bypass uncertainty. Initial owner bootstrap requires a controlled verified Clerk private-role grant and audit, not public self-enrollment.

Packing slip POST is authenticated and staff-authorized; there are no public static slip URLs. Whole-order slips and package slips contain only safe order/package references, recipient address and names/sizes/quantities. Package slips validate allocation against the order and omit prices, payment references, notes and account/provider IDs. Generate/print using the staff preview and browser print; Letter CSS repeats the order/package header and removes dark backgrounds/navigation. QA fixtures and PDF evidence remain outside public source and are not evidence of real Clerk/MFA.

## Ohio tax and production evidence

Ohio operations require completed vendor registration and verified Stripe Tax configuration before launch. Owner completes government credentials, identity, attestations and fees. Monitor other-state economic nexus as sales grow; do not register in every state automatically. Never mark provider or legal evidence true to suppress a blocker. Production retention, monitored support and actual provider recovery remain launch requirements.

Staff provider recovery: uncertain access writes block later changes. An administrator with recent MFA reviews and finishes the intended change in Clerk, then uses Employees > Verify provider outcome with review notes. The server only reads Clerk to confirm the intended role/enrollment or one matching invitation result, then appends immutable resolution evidence. It never repeats an uncertain write or infers success from an absent result. Older requests without recorded intent need manual audit review.
