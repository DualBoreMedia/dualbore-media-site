# Future operations roadmap

This is a post-launch plan, not a feature or deployment approval. Payments and transactional email remain gated.

## Foundation retained now

- Human-readable DBM order numbers have a PostgreSQL unique constraint. The internal order ID, Checkout Session, PaymentIntent and refund IDs remain server-side records.
- Verified charge.succeeded webhooks retain the Charge ID for future receipt lookup. Subscribe the existing signed webhook endpoint to this event before launch; an event arriving before Checkout reconciliation retries without inventing a paid order. Provider IDs and receipt URLs are omitted from customer and employee projections.
- Each package records packed_by_user_id and packed_at from the authenticated staff session when it becomes packed. Split packages can have different packers. Creation and current tracking-entry actor are retained, with every fulfillment/tracking change attributed in append-only audit history. Historical unknown actors remain unknown; no fabricated backfill.
- Migration 004 is additive. It is not permission to migrate production. Real provider delivery and production migration remain verification gates.

## Post-launch work

- Advanced order lookup with role-limited search, audit logging and customer ownership checks.
- Receipt lookup through stored PaymentIntent/Charge references. Retrieve a current receipt URL from Stripe server-side rather than treating the URL as a durable identifier.
- Receipt resend with recipient verification, explicit operator action, rate limiting and a durable idempotency record.
- Promo codes with server-side pricing, explicit eligibility, expiration and redemption limits enforced transactionally.
- Video campaign attribution with disclosed consent where required and no private order data in analytics events.
- Promo analytics using aggregated campaign results, minimal retention and role-restricted access.

No full discount, campaign, receipt-resend or analytics UI is implemented in this stage.
