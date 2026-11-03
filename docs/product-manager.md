# Product Manager: non-selling development candidate

The Admin **Products** section extends the existing operations service. It does
not activate payments, refunds, customer signup, waitlists, email or digital delivery.

## Workflow

1. Use **Import existing Drop 01 drafts** once to manage the three existing
   previews. Import is idempotent, preserves existing variants and does not
   silently invent audience classifications. Otherwise choose **Create Product**.
   **Import received MX Bikes drafts** reuses the three existing received-file
   previews without copying files, inventing game/OEM versions or approving compatibility.
2. Choose physical merchandise or MX Bikes setup. Save incomplete details as a
   private draft. Do not substitute guessed specifications or compatibility.
3. Physical publication requires a name, unique uppercase SKU, category,
   audience classification, positive USD price, description, authentic registered
   image, approved sizes and physical fulfillment method.
4. Preview the private draft, save it, then explicitly approve the saved price
   and metadata before **Publish**. Publication requires a current Admin role,
   verified MFA and fresh sensitive-action verification on the server.
5. Editing a published product changes only its draft. Publish again to replace
   the public snapshot. **Unpublish** hides it; **Archive** hides it and prevents
   subsequent editing/publication. SKU history remains reserved.

MX Bikes records support exact OEM bike/version, game version, track or general
MX/SX classification and compatibility testing status. **All digital publication
is deliberately rejected**, including records marked tested, until actual file,
private storage, entitlement checks and delivery/recovery are separately verified.
There is no file-upload field or public download URL.

## Images and listings

`netlify/operations/product-images.json` records image paths that actually exist
in this repository. Add authentic owner-approved photos to `public/assets/`,
then update this registry in a reviewed source change. The manager accepts only
local JPG/JPEG/PNG/WebP asset paths. It does not provide image uploads or remote
image fetching. Do not register private setup files.

Published physical snapshots appear in the public Garage Merch listing. Search,
category/audience options and numeric price sorting derive from metadata. The
legacy three previews remain available until replaced by a published managed
record; subsequently unpublishing/archiving that record hides the legacy fallback.
Unavailable catalog storage preserves the existing curated preview, rather than
claiming a successful managed refresh. Successful API snapshots may cache at the
CDN for 30 seconds. The bounded endpoint supports up to 1,000 previously published
records and reads only the product table, without commerce mutations.

Publication creates/updates server-owned physical variants. Existing IDs, stock
counters, reservations, order snapshots and provider mappings are preserved;
changed prices invalidate old live Price mappings. New variants have zero finite
stock and no Stripe Price mapping. Listing publication is **not sales approval**.
Future payment activation still needs provider synchronization and all existing
shipping, tax, legal, inventory and payment gates. Local simulation remains the
original explicitly labeled fixture store, not a payment test for new listings.

## Persistence and release

Apply additive migration `006_managed_products.sql` through `npm run db:migrate`
only against the approved target. This implementation was tested against isolated
local schemas, not production. Migration history/checksums remain immutable; no
previous migration or customer data was rewritten. Normal repository transactions
serialize SKU allocation, version checks, variants and audit entries atomically.
The database also enforces unique draft product SKUs.

No deployment, main merge, provider activation or production migration is part
of this change. All development commit subjects require `[skip netlify]`.
