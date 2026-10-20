# DualBore Media

## Local commerce foundation (not published)

The user approved a local test commerce foundation only. Start `npm run dev:commerce` for the loopback-only commerce preview; normal `npm run dev` and `npm run build` retain the Coming soon/waitlist experience. No keys or account access are needed for this stage.

- `src/commerce/catalog.js`: 15 stable variant IDs and SKUs across the three real designs and provisional S-2XL sizes. Draft USD prices use the confirmed $30 per item and $7 USA shipping per order. No stock or Stripe Price IDs are invented.
- `src/commerce/cart.js` and `Commerce.jsx`: size selection, quantities, add/remove/update, cart badge, empty state and versioned localStorage containing only variant IDs and quantities. Corrupt/outdated/tampered storage resets safely. Storage failure keeps the in-memory cart usable. Limits are 10 per variant and 20 per cart; these are abuse/test bounds, not inventory claims.
- `netlify/lib/cart-quote.mjs`: trusted server calculation shared by the local Vite middleware. `/api/cart-quote` exists only in commerce dev mode, accepts same-origin loopback POST JSON up to 4 KB, and rejects unknown variants, duplicate lines, forged prices/shipping, invalid quantities and non-USA destinations. It returns a no-store estimate before tax. Cart changes invalidate prior estimates. This is not an order, stock reservation or payment API, and there is no deployed Netlify quote function.
- The normal build ignores commerce mode regardless of public environment variables. A commerce-mode build alone cannot enable the UI on a public hostname. Existing security headers, waitlist email handling, Sites packaging and explicit deployment guards remain intact.

Run `npm run test:commerce` in addition to the existing verification commands. Local preview testing should cover add/update/remove, two different sizes, refresh persistence, empty state, invalid limits, server estimates, Escape/focus restoration and 375/390/414 px layouts.

### Required next stages

Connect server-resolved Stripe test Price IDs to hosted Checkout Sessions, then verified Stripe webhooks and durable order/event records with idempotency. Fulfillment and Resend purchase confirmations must follow verified paid events, never a success URL. Choose an inventory/reservation policy before claiming availability. Configure USA-only address collection and the confirmed $7 flat shipping, confirm tax registrations before enabling Stripe Tax, and obtain handling/returns/privacy/terms details from the owners. Do not accept payments until these stages are tested. No live keys, purchases, provisioning, push, PR or deployment are part of this foundation.

The earlier local Resend commit remains `0b63d8f588a7bf4a99a228f2092dee4fd28244a7`; this commerce work is a separate, uncommitted workspace change. It has not been pushed or deployed.

React/Vite channel site with a red/cyan carbon-fiber theme using Teko and Inter and a Drop 01 merch preview. Orders are not open. All merch is labeled Coming soon without prices. Drop 01 alerts use Netlify Forms with explicit consent.

## Current implementation: server-side Resend confirmation

The browser still submits `drop-waitlist` to Netlify Forms at `/__forms.html`. Only an accepted submission updates the browser to its success state. A separate `formSubmitted` platform event calls `netlify/functions/drop-waitlist-email.mjs`, which validates the form fields and sends HTML plus plain-text confirmation through the official Resend HTTP API. There is no browser email request, public send endpoint, or new Resend dependency. Netlify verifies platform-event JWS signatures before invoking the handler.

The event shape was checked against the current [Netlify event documentation](https://docs.netlify.com/build/functions/trigger-on-events/) and published `@netlify/functions` 6.0.2 / `@netlify/types` 3.2.0: `FormSubmittedEvent` contains `data: Record<string, string>`. The handler requires the submitted `form-name` field to equal `drop-waitlist`; it does not infer a form from arbitrary payload fields.

Configure these privately in the [existing project's environment settings](https://app.netlify.com/projects/dualbore-media-site/configuration/env):

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Required server-only sending API key. Mark the value secret. |
| `RESEND_FROM` | Required sender mailbox, optionally `DualBore Media <mailbox@your-verified-domain>`. Use an actual domain verified in Resend. |
| `RESEND_REPLY_TO` | Optional monitored reply mailbox for questions and opt-out requests. |
| `RESEND_NOTIFY_TO` | Optional internal signup notification mailbox. Empty disables this extra email. |

Use Functions scope when available. The current free plan permits All scopes; this code still accesses the variables only server-side. Configure production values, and avoid sharing production credentials with untrusted previews. Never use `VITE_` for these values. `.env.example` contains empty placeholders only. Environment changes require a later approved deploy before functions receive them; saving variables does not authorize that deploy.

Missing/invalid configuration logs a short code and skips email. Invalid or unrelated forms do not send. Resend/network failures retry up to three times with 1s and 2s backoff, then throw a generic error so the platform can report failure. Logs contain status/attempt codes, never submitted names, addresses, message bodies, or keys. The already accepted Netlify Forms entry remains saved. The browser does not claim that email was delivered.

Every send uses a deterministic SHA-256 idempotency key for the exact message. Resend's deduplication window is 24 hours; identical signups/messages during that window share a confirmation, and retries after expiration can send again. This is not a durable exactly-once queue. Monitor failure logs and reconcile with Netlify Forms before any manual replay. A Resend API success means accepted for sending, not confirmed inbox delivery.

The Resend sender domain still needs verification and the server variables need configuration. The connector could not refresh domain status during this implementation, so no working sender is assumed. No real confirmation email has been sent as part of local tests.

## Deployment approval and build usage

**Do not deploy this implementation without approval for its exact branch/commit.** The latest user instructions supersede previous automatic publication permission. Before deploying, summarize changes and local verification, identify the version, and ask: "Do you want me to deploy this version to production?" Approval applies once.

Ordinary commit subjects use `[skip netlify]`. Only an explicitly approved production commit may include `[deploy netlify]`. `netlify.toml` runs `node ./scripts/netlify-ignore.mjs`: exit 0 skips, exit 1 continues. The gate checks only the current commit subject, requires production context and `main`, and cancels on missing or unreadable metadata. It cancels branch/deploy-preview builds as well. Marker text in documentation, older commits, or commit bodies cannot authorize a build.

Netlify [build hooks bypass ignore commands](https://docs.netlify.com/build/configure-builds/ignore-builds/), so `prebuild` independently blocks hosted compilation without the approved marker. No hooks, CLI upload workflow, alternate publish service, or automatic GitHub deployment action is added. These repository checks are guardrails, not a substitute for following the single-use approval rule or preventing an authorized administrator from using Netlify's own controls. While this version remains local, the currently deployed repository's build settings are unchanged. Do not push a branch expecting the local gate to protect an older checkout.

## Local verification for this version

Run `npm ci`, `npm run test:email`, `npm run build`, `npm run test:sites`, then `npm run test:client-secrets`. `test:email` invokes the actual event handler/core locally with synthetic inputs and an intercepted Resend HTTP boundary. It checks accepted submissions, unrelated forms, consent/email/style/size rejection, honeypots, missing configuration, API failures, HTML escaping, optional internal notices, retry backoff, and stable idempotency keys. It sends no email and does not deploy. `test:client-secrets` scans the generated client files; the verified build was also run with a synthetic server-secret canary to confirm it is absent from output. Sites packaging remains unchanged.

For local browser checks, run `npm run dev -- --host 127.0.0.1`. Localhost signup intentionally reports that the live Netlify website is required. Do not simulate an accepted lead locally. The server event itself is exercised by `npm run test:email`; a genuine accepted-form-to-email delivery check requires a later approved deployment and a verified sender.

## Local development

From this application directory, run `npm ci`, then `npm run dev -- --host 127.0.0.1`. Run `npm run build` and `npm run test:sites` before publishing.

## Netlify deployment

Connect the existing `DualBoreMedia/dualbore-media-site` repository to the existing Netlify project. This folder's contents belong at the repository root. If the whole parent workspace is uploaded instead, set the Netlify base directory to `site`.

- Production branch: `main`.
- Build command: `npm run build`.
- Publish directory: `dist/client`.
- Configuration: `netlify.toml` and `public/_redirects`.
- Required build environment variables: none. Server-side email requires the variables documented above.
- The Sites worker and hosting manifest are generated alongside the static site for compatibility; Netlify publishes only `dist/client`.

Keep `node_modules`, `dist`, `.netlify`, and environment files out of Git. The `.env.example` contains empty server-only Resend placeholders. A `VITE_` variable is public browser configuration and must never hold a secret. The preview does not initialize Stripe or collect payments.

The source, scripts, tests, hosting manifest, worker, and public assets are stored in GitHub. Creating a Netlify project alone does not establish Git deployment. Confirm a successful deploy tied to the expected commit before declaring the connection complete.

## Working together

Each contributor uses their own GitHub account and local checkout. Make changes on separate branches, review them in pull requests, and merge approved work into `main`. Production builds require the approval marker and the workflow above. Avoid sharing a live checkout through OneDrive.

## Custom domain

`DualBoreMedia.com` is the planned custom domain, referenced in application metadata without an unverified canonical URL; availability, ownership, and checkout price have not been confirmed. Compare registration and renewal totals at the chosen registrar rather than treating example prices as a quote. Domain purchase is a separate step.

After registration and a successful Netlify deploy, add the domain in the project's Domain management. For Netlify DNS, copy the exact assigned nameservers from Netlify to the registrar; do not use example nameservers. Preserve existing email and verification records when changing DNS providers.

For external DNS on Netlify's standard network, Netlify recommends an ALIAS/ANAME/flattened CNAME at the apex to `apex-loadbalancer.netlify.com`; if unsupported, use an A record at `@` to `75.2.60.5`. Set `www` as a CNAME to `dualbore-media-site.netlify.app`. Verify the project's current recommendations before applying changes. HTTPS provisioning follows successful DNS validation, with no fixed completion time promised.

References: [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/), [Netlify HTTPS](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/), [Porkbun registration and renewal comparison](https://porkbun.com/about/domain-cost-calculator/com).


## Navigation and product previews
The site has four keyboard-accessible views: Garage Builds, Video Vault, Garage Merch (Drop 01), and About / Pit Crew. URLs use #garage, #vault, #merch, and #crew; older #films, #shop, and #about links still work. Arrow keys and Home/End switch tabs. The Video Vault includes all five verified video links and five category filters.

Merch Quick Views show real mockups and artwork notes. Fabric specifications, sizing measurements, and final availability are pending. The waitlist collects name, email, preferred style/size, and consent. No payments are collected. The local Resend integration adds confirmation email after a verified form event once configured and deployed with approval. The team manages future drop updates and opt-out requests. Netlify static response headers disable unused camera/microphone/location permissions, content-type sniffing, object embedding, external base URLs, and cross-origin form submissions. Embedded players are restricted to youtube-nocookie.com. External YouTube links use descriptive accessible labels and noopener/noreferrer.



## Mobile media and waitlist
The video player opens only after a click and is removed on close. Durations were verified with vidIQ on October 12, 2026. Responsive 480/768px copies of the original merch artwork reduce downloads without replacing the originals.

Netlify Forms detection must remain enabled. `public/__forms.html` declares `drop-waitlist` and its exact fields for build-time detection. The React form posts URL-encoded data to this static path with a honeypot, required consent, validation, a timeout, and failure feedback. Localhost intentionally refuses submissions rather than interpreting Vite's fallback response as a saved lead. Submissions are managed in the existing Netlify project's Forms dashboard. Production is public; non-production deploys remain private.

Run `node --test tests/waitlist.test.mjs` in addition to the packaging checks. Test coverage includes bad input, unexpected preferences, missing consent, honeypots, encoding, local previews, network errors, and non-success responses. Browser checks cover native form validation, keyboard tabs, dialogs, and mobile layouts.

Canonical, social image, and structured data URLs use the verified Netlify URL until ownership and configuration of DualBoreMedia.com are confirmed. JSON-LD is non-executable metadata; there are no inline executable production scripts.



## Local storefront completeness pass

This stage is local only. Start `npm run dev:commerce` on loopback to review the expanded storefront; normal development and production builds retain Coming soon and the existing waitlist. Stripe remains disconnected. No keys, payment sessions, orders, emails, remote account changes, commits, pushes or deployments are created by this preview.

The preview includes real product artwork, $30 test prices, provisional S-2XL options, an editable persistent cart, a desktop drawer and mobile full-screen cart. The server estimate validates variant IDs and quantities and uses $7 USA shipping. Tax is not calculated, availability is illustrative, and checkout stays disabled. Changing the scenario under Store test controls replaces only this browser's local test cart. Nine fixtures cover available/limited/unavailable items, stale carts, changed prices, service errors and an empty cart. Changed server prices require explicit review.

The five customer-information routes are clearly labeled draft outlines. The three `/order/` routes are UI fixtures, never payment confirmation. They preserve the cart and send no notifications. Footer email acquisition opens the existing waitlist consent form without submitting it; consent remains unchecked. Approved business details, final policies, inventory, tax, secure payment verification and durable order storage are prerequisites for a real launch.

Verification: `npm run test:commerce`, `npm run test:email`, `npm run build`, `npm run test:sites`, and `npm run test:client-secrets`. The reusable `tests/storefront.browser.mjs` exports `runStorefrontBrowserChecks({page,navigate,reload,baseUrl})` for the Codex browser Playwright API or a standard Playwright Page. It requires a loopback commerce preview and sends no real signup. See `qa/storefront-qa.md` for checked scope and limitations.


## Sandbox commerce integration (current local stage)

The approved storefront is preserved. Every checkout route is explicitly opt-in and loopback-only. Hosted requests are disabled even when environment variables are present. Nothing is pushed or deployed. Normal builds stay Coming soon. No browser publishable key is needed: the server returns a Stripe-hosted Checkout URL. There are no custom card fields or customer accounts.

### Architecture and trusted boundaries

React/Vite sends variant IDs and quantities to modern Request/Response Netlify Functions. The server loads trusted price, SKU, active status, test Stripe Price ID and inventory from PostgreSQL. It validates Stripe's matching test price before creating Checkout. Fifteen variants retain the established SKUs. Test prices are $30 and test USA shipping defaults to $7, both server-controlled. The browser's fixture estimates are a separate UX tool, never checkout authority.

`migrations/001_commerce.sql` creates product_variants, orders, order_items, stripe_events, inventory_reservations and email_events, with constraints and a checksummed migration journal. The repository uses bound SQL values and a transaction-scoped PostgreSQL advisory lock. This deliberately serializes all store transactions and rewrites snapshot rows: suitable as a correctness-first, low-volume foundation, not a high-throughput design. Every writer must use this repository. Replace whole-store serialization with row-level repositories before scaling. PGlite tests execute actual PostgreSQL-compatible SQL; its test adapter omits the unsupported advisory-lock call. A real PostgreSQL cross-process locking test is still required. The memory adapter is test-only, never durable order storage.

### Local setup

Run `npm ci` after pulling the eventual reviewed repository version. `npm run dev:commerce -- --port 4176` opens the storefront without active checkout until configuration is supplied. Store secrets only in ignored `.env.local`, with no VITE_ prefix. The placeholder `.env.example` documents names, never real values.

For a no-credential demonstration run `npm run dev:simulation`, then open http://127.0.0.1:4178/#merch. It creates a persistent PGlite test database in ignored `.tools/commerce-simulation-db`, seeds two synthetic units per size only on first use, and substitutes Stripe/Resend boundaries. Checkout leads to an explicitly labeled local simulator, with paid/pending/failed/expired/cancel buttons. No Stripe payment is created or verified and no real email is sent. These actions consume/reserve synthetic inventory. `COMMERCE_SIMULATION_PORT` and `TEST_DATABASE_DIRECTORY` can select another isolated run; never point this tool at production data. Mock gateway sessions exist only in the running process; after restart, existing persisted orders remain readable but abandoned mock sessions may need an isolated fresh test database.

### PostgreSQL and sandbox credentials

No PostgreSQL server, Docker or Stripe CLI was available during implementation. Install/configure a local PostgreSQL server separately, create a dedicated development database and least-privileged application role, then set DATABASE_URL in `.env.local`. No external database is provisioned. Run `npm run db:migrate`; migrations are required, not manual table creation. Keep TLS verification enabled when using a future remote database.

Select a separate Stripe sandbox for this project. Set COMMERCE_TEST_ENABLED=true, COMMERCE_MOCK=false, STRIPE_SECRET_KEY to a restricted test key with required Products/Prices read/write, Checkout Sessions read/write and Tax Registrations read permissions if needed, and STRIPE_WEBHOOK_SECRET from the local listener. Live and publishable keys are refused. Set SITE_ORIGIN=http://127.0.0.1:4176 and TEST_INVENTORY_PER_VARIANT to an explicit synthetic count. Run `npm run catalog:sync` after migrations. It seeds missing test variants, reuses matching metadata-tagged products/prices, writes only test Price IDs into the database and refuses ambiguous pagination. It never changes existing inventory during repeated seeds and never writes a secret file. Update trusted DB prices deliberately and re-sync immutable Stripe prices; Dashboard edits alone are not automatically reflected in the database.

Use the official Stripe CLI after signing into the intended sandbox: `stripe listen --forward-to http://127.0.0.1:4176/api/commerce/webhook`. Enter its signing secret privately into the local environment, then restart the server. Never paste or capture keys in chat/screenshots. Validate success, decline, cancel, async events, duplicate delivery and expiry with Stripe test payment details. A trigger with unrelated order metadata does not prove an application checkout. Real sandbox browser/CLI testing has NOT been performed here.

### Reservation, payment and recovery

Checkout validates the entire cart, atomically moves AVAILABLE to RESERVED, snapshots the order, then creates a Stripe-hosted session using an order-specific idempotency key. A browser random request UUID prevents duplicate requests; a durable 120-second lease serializes retries across workers. Checkout lasts 35 minutes, within Stripe's documented 30-minute to 24-hour range. An initial definitive create rejection releases stock; ambiguous transport failures and all recovery failures retain reservations. Never release simply because local time elapsed: a payable session may exist.

Run `npm run orders:recover` explicitly in the configured local test environment. It retries unlinked orders using the same immutable idempotency key, retrieves linked sessions from Stripe, reconciles verified paid/expired state and scans paid orders for missing/retryable emails. A delayed recovery after Stripe's idempotency retention or changed configuration can require operator review; investigate/expire the existing session before releasing inventory. No automatic job is installed and no public administrative endpoint is exposed.

Raw bytes and the Stripe-Signature header are verified with the official SDK before processing. Supported events: checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed. Duplicate event IDs and logically duplicate payment events cannot sell stock twice. Paid totals/currency/USA destination must match the trusted order. Pending asynchronous payments retain stock until success/failure. Paid orders never release on a late expiry. Order states are centralized: checkout_pending to payment_pending/paid/expired/payment_failed/cancelled; payment_pending to paid/payment_failed; paid to fulfilled/refunded; fulfilled to refunded. Terminal states do not reopen.

The order-status endpoint requires both a test session ID and a separate opaque token held only in sessionStorage; it returns no address, customer email, internal order ID or payment credentials. Order numbers use a separate random DBM identifier. The browser polls at most ten times and clears only matching purchased quantities after a server paid/fulfilled response. Merely visiting a success URL never clears the cart. Returning from cancellation preserves the cart and does not itself release stock.

Fulfillment service records carrier, tracking details and shipped/fulfilled timestamps; no admin dashboard or unauthenticated fulfillment API is added. Refund state supports cumulative partial/full amounts and deduplicated Stripe refund IDs through an internal verified-refund recording method. It never creates a refund or restocks automatically. A future signed refund event integration (refund.updated/charge.refunded), access controls and return inspection policy must be implemented before offering automated refunds.

### Tax and order email

STRIPE_AUTOMATIC_TAX defaults false for this test foundation. Enabling it requires an active sandbox registration, checked by the server. No fake client tax rate is calculated. Sandbox tax settings/registrations are separate from live mode; confirm real obligations and live configuration with the appropriate professional before launch.

Only verified paid orders enqueue transactional Resend confirmations and optional merchant notifications. Set RESEND_API_KEY, verified RESEND_FROM, optional RESEND_REPLY_TO and RESEND_NOTIFY_TO=your-private-order-notification-address privately for the intended sandbox-safe destination. Missing configuration safely skips delivery; payment remains paid. HTML values are escaped, plain text includes the same line items/totals/destination, and retry payloads remain immutable. Durable leases, separate email-type records and stable provider idempotency keys limit duplicates. Transient failures queue retries; ambiguous attempts older than 23 hours require manual review before resending because Resend's deduplication window is 24 hours. The recovery command also scans paid orders lacking email records. Mock mode strips the Resend key and never sends email. Marketing remains the existing explicit-consent Netlify Form, entirely separate from purchase data. No checkout customer is silently subscribed.

### Verification and production blockers

Commands: `npm test`, `npm run test:integration`, `npm run test:commerce`, `npm run test:email`, `npm run build`, `npm run test:sites`, `npm run test:client-secrets`, and `npm run check:launch`. Browser modules `tests/storefront.browser.mjs` and `tests/checkout.browser.mjs` run through the browser Playwright API against loopback only. The checkout browser suite consumes synthetic stock and requires the explicit simulator. Use an isolated test database for repeatable runs.

`check:launch` is intentionally failing while draft legal/business placeholders, test catalog/pricing, final inventory/shipping, production secrets and sender/tax approvals are missing. It does not deploy. Required business decisions include legal seller name, mailing address, public support email, final return window, processing time, loss/delay handling, privacy retention and final prices/stock. No policy is attorney-reviewed. Real Stripe sandbox checkout, real PostgreSQL cross-process locking and verified-domain email delivery remain external checks. Hosted commerce is deliberately disabled in this phase, so a later approved deployment also needs an explicitly reviewed hosted-enablement change and operational controls/rate limiting.

The existing Netlify ignore/prebuild gates are mechanically enforced and tested. Normal/skip commits cancel Git builds; only an approved production/main commit subject with [deploy netlify] passes. No marker has been added. Netlify ignore's 0=skip/1=build semantics and build-hook limitation were rechecked; the extra prebuild guard remains. Nothing in this work changes remote Netlify configuration.

Sources checked: [Netlify ignore builds](https://docs.netlify.com/build/configure-builds/ignore-builds/), [Stripe Checkout lifecycle and expiration](https://docs.stripe.com/payments/checkout/how-checkout-works), [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe Tax](https://docs.stripe.com/tax/checkout), [Resend send email and idempotency](https://resend.com/docs/api-reference/emails/send-email).


### Shipment notifications

The internal fulfillment service now sends a separate customer shipment email after a paid order is recorded as fulfilled with carrier, tracking number, HTTPS tracking URL and shipped timestamp. It includes product/size/quantity details and a tracking link, with escaped HTML and plain text. A separate durable customer-shipment email event and idempotency key prevent repeated fulfillment calls from duplicating the notification. Email failure never undoes fulfillment; orders:recover retries missing/retryable shipment notices. Mock orders never send real email. There is no public fulfillment endpoint or admin GUI yet; shipment must be recorded through the trusted service. Actual sending still requires the verified Resend server configuration.


## Marketing consent and future unsubscribe handling

Purchases and shipment notices never subscribe an address to marketing. Drop 01 signup is optional; its consent checkbox starts unchecked and is required only when joining that list. Transactional order and shipment messages must remain separate from promotional campaigns.

Before sending marketing campaigns, implement and test a durable suppression list keyed by normalized email, record consent timestamp/source/version, and honor unsubscribe requests before each send or export. Provide a working unsubscribe link and appropriate one-click headers through the selected campaign provider. Process provider unsubscribe events idempotently and retain suppression across imports and retries. A later purchase must never clear suppression; renewed marketing enrollment requires a fresh explicit opt-in. Confirm the business mailing address and monitored support/opt-out inbox first.

This is the required future architecture, not a claim that an unsubscribe endpoint or campaign system exists. Marketing campaigns remain blocked until it is implemented and verified. Order confirmations and shipping notices contain no promotional enrollment.

## Sandbox launch-candidate verification (October 13, 2026)

The isolated local PostgreSQL 17 database was migrated and seeded with 15 variants. The existing Stripe sandbox was synced twice without duplicate DBM mappings. Two real hosted test-card payments, a declined card, cancellation, signed completed/expired events, delayed delivery, invalid signatures and duplicate processing were exercised. Resend reported delivered owner-only test confirmation, merchant, shipment and waitlist messages. A branded verified sender and production policies remain launch blockers. Hosted Netlify Forms delivery was not tested or deployed; the email core received a synthetic validated event for that delivery test.

Run `npm run test:postgres` with `DBM_REAL_POSTGRES_TEST=true` and a private local DATABASE_URL for database `dbm_sandbox` on 127.0.0.1. This opt-in test creates a random isolated schema, applies the real migration and launches two independent checkout workers against the final unit. The workers use a Stripe boundary double to isolate database locking; the hosted card/payment tests used real Stripe separately. The generated QA schema is removed afterward. Never point this test at production. Without the opt-in it is explicitly skipped, not counted as database proof.

Verified failure QA found and fixed unsafe idle database error handling. Idle disconnects now log only a generic code, allow reconnection and preserve carts on checkout failure. Sandbox transactional subjects and bodies identify test orders and warn against shipping. Cancellation returns explain that checkout closed, and bounded payment verification can be restarted without creating another checkout. Test credentials and local database/tooling remain ignored; no customer payments, deployment, main merge or PR are enabled by these checks.

Alternative payment methods and real asynchronous settlement were not exercised; async success/failure transitions remain covered by automated boundary tests. Browser QA covers Chromium and all seven requested viewport widths, with keyboard and reduced-motion checks. Production approvals, sender verification, tax, operations and broader browser/device checks remain required before launch.
# Accounts and operations: pre-deployment

See [the operations runbook](docs/operations-runbook.md) and [managed authentication setup](docs/auth-setup.md). `/account`, `/admin`, `/shop`, `/contact` and `/unsubscribe` are implemented. Accounts require configured Clerk; production purchases and transactional email remain disabled server-side. The strict launch validator intentionally fails while real provider/business information is missing. This branch does not authorize deployment.
# Curating the garage and Video Vault

The public channel experience uses `src/content.js` as its source of truth. It does not need a YouTube API key, scheduled provider jobs or a paid feed service.

To add a real upload, verify its video ID and channel ownership, then add one `films` entry with a clear editorial title, a verified duration, a supported category, a label and a local channel thumbnail. Use one of the existing category labels so search and filters stay consistent. Keep the thumbnail descriptive text accurate; do not use an unrelated stock vehicle. Link an episode to a build with the project's `video` or `relatedVideo` ID. Player suggestions use the same category and the project link uses those explicit IDs.

The YouTube channel link always leads to the complete upload archive. The homepage presents a curated selection, not a claim that its films are the latest uploads. Automated updates are intentionally deferred until their provenance, thumbnail rights and failure behavior can be maintained reliably.

Public merchandise `previewPrice` is an owner-approved planned release price, not a Stripe price or a payment configuration. Server catalog prices remain the authority for future orders. Public previews must keep orders and email collection paused, and must not imply that a size selection reserves stock.
