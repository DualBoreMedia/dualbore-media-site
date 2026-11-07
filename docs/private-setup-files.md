# Private MX Bikes setup files

Development only. No production migration, file upload, sales activation,
email activation or download publication is authorized by this implementation.

## Admin workflow

1. Open Admin > Products. Create an MX Bikes digital setup draft or open an
   existing received-file draft. Give it a clear name and unique SKU.
2. Save Draft. Attach the original `.stp` in **Private setup file**, then choose
   **Save private file**. Current Admin access, TOTP MFA and fresh sensitive-action
   verification are required server-side. Employees and customers cannot upload.
3. The server records the file checksum, byte size and embedded OEM bike ID.
   Format validation does not prove it works in-game. Exact bike, OEM pack version,
   MX Bikes version, track/classification and real compatibility testing are still
   required. Uploading a replacement resets the testing status to unverified.
4. Edit the title/metadata, save and preview as usual. Archive hides the product;
   it does not erase an immutable file version needed by an existing order.

Private bytes live in the separate `private_setup_assets` PostgreSQL table from
additive migration `007_private_setup_assets.sql`. Normal catalog reads never
load bytes. Metadata, product revision and immutable audit commit atomically.
Concurrent edits use the saved product version. SHA-256 deduplicates identical
files. The public product endpoint exposes neither file IDs nor bytes. Raw `.stp`
files are ignored by Git and must not be added to `public`, client code or a ZIP
for external code review. Existing backup/restore procedures must cover this table
before production use; storage cost, capacity and retention need owner review.

The recognized binary layout is bounded to 2 MB and checks the observed signature
and an ASCII MX1OEM/MX2OEM bike ID. Unsupported versions are rejected for inspection,
never silently converted. It is not a general-purpose file or executable upload.

## Future purchase delivery

The existing verified-payment webhook and recovery flow now call the same durable
email outbox for `customer-setup-files` when an order snapshot contains setup items.
It requires a processed paid Checkout event, an eligible paid order and all email
and digital-delivery gates. Cancelled, held, refunded and unproven orders cannot
receive setup attachments. A browser success URL never proves payment.

The delivery uses Resend `.stp` attachments, not a public download URL. An immutable
order item must pin `type: mx_setup`, `setupFile` (asset ID, checksum, size, embedded
bike ID and safe filename), and its purchased compatibility metadata. Current
catalog edits must never replace that snapshot. Attachment bytes are loaded only
for the send, rechecked against the pinned checksum and not copied into email-event
JSON, Admin responses, logs or browser output. A bounded 8 MB total raw attachment
budget stays below the provider's documented 40 MB encoded-email limit.

Leased outbox claims and a stable provider idempotency key protect against duplicate
webhooks and retries. Retries preserve the recipient/template and file references.
Ambiguous delivery outside the idempotency window needs manual review. Missing or
mismatched private files enter Needs Attention as `setup-integrity-review-required`;
payment state is preserved. The merchant notification never includes the files.

**This is not yet a saleable digital storefront.** Digital publication remains
unconditionally blocked. The current checkout accepts only the existing apparel
variants; a reviewed digital checkout/catalog-to-order snapshot integration,
digital tax/consumer terms and real sandbox delivery tests are still required.
No fake order or manual production data edit may substitute for that integration.
`DIGITAL_DELIVERY_ENABLED` is an additional server-only fail-closed gate. It must
remain unset/false along with existing payment and email gates until separately
approved. All new email tests use a fake provider; no actual email was sent.

## Intake status, November 6, 2026

The newly named YZ450/YZ250 files and TC125 Downloads folder were not available at
the paths supplied in chat. No new owner file was imported, renamed, hashed or
declared compatible. Reattach the files privately or place them outside public
assets in the workspace. Use descriptive names based on the owner's filenames;
do not invent model years, tuning improvements, pack versions or tested results.
