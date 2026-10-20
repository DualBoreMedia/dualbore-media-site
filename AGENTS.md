# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Deployment approval gate

- Local development, local builds, and local tests are allowed without additional approval.
- Do not publish, deploy, trigger a Netlify build hook, call a Netlify deploy API/CLI command, merge a deployment commit, or otherwise make a new build live unless the user explicitly approves that specific deployment in the current conversation.
- Treat deployment approval as single-use. Approval to implement, edit, test, commit, or review code is not approval to deploy it.
- Before an approved production deployment, summarize the changes and test status, name the target branch/commit, and wait for an explicit instruction such as `deploy it`, `push it live`, or equivalent.
- Normal GitHub commits must include `[skip netlify]` in the commit message so continuous deployment does not consume a build.
- The repository Netlify build gate only permits a Git-triggered build when the current commit message contains `[deploy netlify]`. Codex must never add that marker unless the user explicitly approved that specific deployment.
- Do not use a build hook, manual Netlify deploy, Netlify API deploy, Netlify CLI deploy, or agent-generated Deploy Preview to bypass this gate without the same explicit approval.

## Durable project decisions

### Finished product development, October 20, 2026

- Refine the established public website, not only its test infrastructure: cohesive homepage, complete build/video journeys, original merchandise previews, Pit Crew and public information. Preserve the charcoal/red/cyan visual identity and real channel assets.
- Public planned release prices are now approved for previews: E92 tee $30 USD, E90 crewneck $50 USD, SV1000S crewneck $50 USD. Label them as planned release prices. No checkout, orders, inventory promises or Drop Alert collection is enabled by showing them.
- Public product previews must not show internal placeholder tables, invented material weights or measurements. Explain planned S/M/L/XL/2XL sizes and forthcoming fit guidance in customer language. Preserve detailed local test fixtures separately.
- The owner requests visual review at 320/375/390/414/768/1024/1440px and meaningful journey tests. Preserve the 90/90/90/85 coverage gates. Safe development checkpoints may be pushed only to codex/commerce-test-foundation with [skip netlify]. No deployment, previews, main merges, paid services or production-provider changes.

### Controlling correction: authentication, testing and no deployment, October 15, 2026

- Deployment is NOT authorized, even if all readiness checks pass. Do not merge main, trigger any Netlify deployment or enable production payments. PAYMENTS_ENABLED remains false. Transactional email activation stays gated pending final verification and explicit authorization. This supersedes every conditional deployment permission below.
- Do not upgrade Clerk or purchase recurring authentication charges. Evaluate WorkOS AuthKit first using official current pricing, organization MFA policies and production terms; use its ordinary hosted domain and free branding. Compare Better Auth as fallback, using official password/TOTP/session implementations and existing PostgreSQL. Do not weaken staff MFA or persist refresh tokens in browser localStorage to avoid a paid custom domain.
- Ohio/government registration is deferred by the owner. Do not attempt government sign-in or wait on that task during current engineering work; tax readiness remains a launch blocker.
- Measure lines/statements/functions/branches and enforce meaningful coverage thresholds in CI. Test counts alone are insufficient. Real Postgres, rendered E2E, permission/revocation/IDOR checks, structured redacted correlation logs, frontend error boundaries, monitored backend exceptions, release/source-map verification and actionable Needs Attention remain required. Do not report monitoring delivery or managed provider behavior as verified using mocks.

### Historical conditional production completion authorization, October 15, 2026: superseded

- Preserve the current local worktree. The earlier conditional authorization is superseded by the controlling correction above. Deployment is NOT authorized even if every gate passes. Do not merge main, trigger Netlify deployments or enable payments; wait for the owner's later explicit final deployment instruction.
- Initial deployment keeps payments and transactional email false. Verify production and signed live webhook delivery, then activate transactional email with controlled delivery verification. Live payments activate last. Never purchase a recurring service or upgrade without showing exact plan/cost and obtaining approval.
- DualBoreMedia operates, makes, packs and ships apparel at 55 Union St, Hartford, OH 43013, United States. The domain dualboremedia.com is owned at Porkbun. Canonical https://dualboremedia.com; www redirects to apex.
- All current 15 variants are made to order. Preserve future finite stock mode. Tee $30, each crewneck $50, USD, USA only; reliable calculated shipping or $9.95 flat fallback. No false stock scarcity.
- Owner answered 3 days to ship and revised voluntary size-exchange REQUEST window to 30 calendar days after delivery. Items unused/unworn/unwashed/undamaged/original condition; customer pays both shipping legs, disclosed before acceptance. Define a reasonable approved-return mailing deadline (current draft: 14 calendar days after approval). Seller errors/defects/nonconformity retain applicable remedies and seller-paid correction shipping.
- Individual Clerk customer/employee/admin accounts, private server role metadata, staff MFA and least privilege are mandatory. No staff/admin links in customer navigation. Packing slips are staff-authorized, order/package specific, contain no prices/provider IDs/notes, and require print QA.
- Ohio vendor registration and tax configuration are required. Human completes government authentication/identity/attestations/signature/payment. Never request SSN/FEIN/password/MFA in chat.
- Run required CodeRabbit uncommitted review before any commit, fix valid Critical/Major issues and rerun; committed/base review follows. Development commits contain [skip netlify]. No force push/history rewrite without specific approval.

### Latest production setup authorization, October 14, 2026

- Complete real provider setup and pre-deployment validation, then STOP. Do not deploy, merge main, trigger a production build, enable payments or enable transactional email. The controlling October 15 correction above confirms no deployment is authorized; any intervening conditional permission is superseded.
- The owner approved $30 USD for the E92 tee, $50 USD for each crewneck, sizes S/M/L/XL/2XL, and reliable calculated USA shipping or a $9.95 flat fallback. Sandbox prices and $7 shipping remain test-only. Do not guess stock, tax registrations, legal identity/address, processing time, return terms, support email or domain ownership.
- Keep PAYMENTS_ENABLED=false and TRANSACTIONAL_EMAILS_ENABLED=false. The dedicated check:predeploy gate may defer deployed webhook verification; all other requirements remain mandatory. The default check:launch activation gate remains strict. Never mark evidence true without verification.
- Feature freeze: provider setup, launch blockers, security, QA and targeted fixes only. Source-only development commits retain [skip netlify]. Independent CI must not deploy. Do not rewrite history or force-push without separate approval.
- Ask the owner to complete passwords, MFA, OAuth consent, business verification and purchases at their exact blocking step. Domain/paid-service purchases need prior approval. Continue unrelated setup while waiting.

### Latest pre-deployment production-build authorization

- Preserve current local work on codex/commerce-test-foundation. The user now authorizes managed Clerk accounts, MFA administration, production-shaped commerce/fulfillment/support, production resource structure and tested source-only pushes with [skip netlify]. This supersedes older sandbox-only implementation restrictions below, never deployment/main merge/public live payments/marketing broadcasts.
- PAYMENTS_ENABLED and TRANSACTIONAL_EMAILS_ENABLED are server-only, fail closed, and remain false before explicit cutover. Production database/catalog must be clean and separate, with approved prices/stock. Do not infer final prices from sandbox values or ownership of a planned domain.
- Use migrations 002+ without editing 001. Keep Sites artifacts and Netlify gates. Real managed auth and production-provider checks remain blockers until actually exercised.

### Current sandbox implementation decisions

- Continue from the approved local storefront. The user authorized a source-only GitHub development branch backup. Exclude QA artifacts, screenshots and secrets. Do not deploy, trigger previews/build hooks, merge main, add a deploy marker or mutate remote account settings.
- Local sandbox Checkout Sessions, verified raw Stripe webhooks, PostgreSQL order/inventory persistence, transactional Resend confirmations and mocked end-to-end tests are now authorized. This supersedes the earlier local no-Stripe integration restriction only for this sandbox stage. Normal builds remain Coming soon; all commerce HTTP handlers refuse hosted/Netlify requests.
- Credentials are server-only; hosted Checkout needs no publishable key. Test/restricted-test keys only. No real credentials or real Stripe CLI/server PostgreSQL were available during this implementation. Report mock tests separately from real sandbox E2E.
- Prices/stock/shipping/tax/order status come from trusted server state. Existing stable SKUs remain. Test seeding is explicit and never resets existing stock. Reservations are transactional; ambiguous Stripe creation and recovery failures retain stock pending verified recovery. Never release solely on local expiration.
- PostgreSQL repository uses one global transaction advisory lock for correctness at low volume. PGlite tests omit this unsupported call; real multi-process PostgreSQL locking remains an external check. All database writes must use the repository.
- Stripe paid events drive orders, sold inventory and email. Success URLs are not payment proof. Order status requires a session-only access token and returns minimal data. Local simulator clearly discloses that no Stripe payment is verified or email sent.
- Preserve waitlist marketing consent separately from orders. Draft legal policies and test catalog must block check:launch. Preserve existing Sites outputs and deployment gates.
- Run all tests, normal build, client-secret scan, local browser suites and the intentionally failing launch check before handoff. Keep real credentials, databases, .tools, dist and node_modules out of Git.

### Latest authorization: local sandbox commerce integration

- The user explicitly authorized building the commerce foundation locally in test mode, without pushing or deploying. This supersedes the earlier no-cart/no-price instruction only for the local commerce preview. Normal builds remain Coming soon and waitlist-only.
- Use the existing three designs and provisional S-2XL range: 15 stable variant IDs/SKUs. Test prices are $30 each and one $7 USA shipping charge per order, per the user's confirmed values. No invented stock or garment measurements.
- Run `npm run dev:commerce` to expose the cart and server estimate on loopback only. The quote API accepts variant IDs, integer quantities and US destination only, and rejects client-supplied prices. It never creates a payment session, order or inventory reservation.
- Keep the waitlist and Resend event flow intact. No external Stripe account mutations, keys, real purchases, database provisioning, push, PR, or deployment are authorized for this stage.
- Checkout Sessions, verified Stripe webhooks, durable/idempotent order storage, inventory policy, tax registrations and customer policies are required future stages before accepting payments. The cart is not evidence of paid orders or stock availability.
- The latest attachment guides a local storefront completeness pass before Stripe: editorial garage/merch presentation, responsive editable cart drawer, clearly labeled stock/error fixtures, draft customer policy routes and simulated order-state screens. Preserve carts on unverified order screens. Footer acquisition opens the existing explicit-consent waitlist. These features are loopback commerce-mode only; no Stripe integration or external mutations.
- Verify `npm run test:commerce`, the existing email/Sites/client-secret suites, a normal build, and the local commerce preview. Preserve the deployment approval gate.

### Previous stage: Resend waitlist, retained for normal builds

- The user's latest brief supersedes earlier commerce and automatic-publishing requests. Keep merch Coming soon, with no prices, Stripe checkout, cart, inventory, orders, accounts, or invented garment specifications. Previously created Stripe sandbox objects are not connected to this version.
- Preserve the existing `drop-waitlist` Netlify Form and its fields: name, email, style, size, consent, and bot-field. Netlify Forms is the source of truth. A confirmation email failure must never change the browser's accepted-signup state.
- Email runs only in the modern Netlify `formSubmitted` platform-event handler. Netlify verifies its event signature. No public email-sending HTTP endpoint. Validate the intended form, email, consent, allowed style/size, and honeypot on the server too.
- Secrets belong in Netlify environment variables, never `src/`, `public/`, HTML, committed environment files, or any `VITE_` variable. Use `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_REPLY_TO`, and optional `RESEND_NOTIFY_TO`. Do not invent a sender domain. Missing configuration skips email safely.
- Never deploy, publish, trigger a build hook, merge/push changes to production `main`, or create a Deploy Preview without approval for that exact version. Prior approvals are superseded. Approval is single-use. Before deployment report changes, local test/build results, and the exact branch/commit; ask: "Do you want me to deploy this version to production?"
- Normal development commit subjects include `[skip netlify]`. Never add `[deploy netlify]` without explicit approval for that specific production version. `scripts/netlify-ignore.mjs` cancels Git builds unless the current production/main commit subject has the approved marker. `prebuild` rechecks hosted builds because Netlify build hooks bypass ignore commands. Do not create another deployment path.
- A local build is authorized and does not authorize publication. Run `npm ci`, `npm run test:email`, `npm run build`, `npm run test:sites`, and `npm run test:client-secrets`. Preserve all existing Sites packaging files.
- Retain the four existing views and accessibility behavior. The pending mobile/copy improvements from earlier instructions may remain; do not introduce a new visual redesign as part of email integration.

- The current selected visual direction is the high-octane carbon-fiber identity from the brother-provided HTML: #0B0D10 background, #13161C cards, #232834 borders, #FF2A3B red and #00F0FF cyan, Teko 600/700 display titles and Inter body text. Use real channel thumbnails for vehicle cards and keep verified YouTube links. This supersedes the earlier orange/Anton/Barlow concept.
- The brother-provided merch HTML is a source reference for the future shop. Current merch is a preview only; do not enable live checkout until products, prices, shipping, tax, fulfillment, and policies are confirmed.
- Stripe must remain test mode during development. Keep the browser publishable key in a local environment file only; never commit a secret `sk_` key.
- Merch is an editorial Drop 01 preview, labeled Coming soon: E92 Coupe Line-Art Tee (`/assets/IMG_5076.jpg`), E90 Sedan Front-Clip Crewneck (`/assets/IMG_5077.jpg`), and SV1000S Silhouette Crewneck (`/assets/IMG_5078.jpg`). Use the supplied mockups without invented material specifications, prices, stock, or checkout controls. The user has now authorized a real Netlify Forms Drop 01 waitlist. Collect only name, email, style, size, and explicit email consent. Never simulate signup success.
- Netlify builds the application root (`site/` locally) with `npm run build` and publishes `dist/client`. Keep `public/_redirects` as the SPA fallback.


- Navigation uses four hash-addressable, keyboard-accessible tabs: Garage Builds, Video Vault, Garage Merch (Drop 01), and About / Pit Crew. Preserve legacy films/shop/about hash aliases. Arrow keys and Home/End move and activate tabs.
- Merch Quick Views show supplied artwork, design notes, and a clearly provisional S–2XL size guide. Do not invent garment measurements or material weights. Get Drop Alert uses Netlify Forms, with validation, a honeypot, and success only after an accepted submission. No payment collection.
- Public production is approved; keep non-production previews private. Keep static response security headers in public/_headers.


- Resend email must run server-side only. Never expose `RESEND_API_KEY` through a `VITE_` variable or client bundle. Netlify Forms remains the source of truth for accepted Drop 01 signups; Resend may send confirmations/notifications after Netlify verifies a form submission.
