# GitHub-only source backup

This development branch contains the tested application, tests, migrations, configuration and documentation from local implementation commit 6f345816848c9086759379e91cc28d35f33c4ebf. Local checkpoint commits remain preserved locally. QA artifacts/screenshots and unused full-resolution image duplicates are excluded. Existing website assets remain available from main.

Submission is authorized for GitHub only. Production/main and Netlify deployment are not authorized to change. The backup commit uses [skip netlify] and retains the mechanically tested Netlify ignore/prebuild gate.

Fresh verification: 86 automated tests passed, normal build passed, Sites outputs and client-secret checks passed. Launch check correctly reports 16 production blockers, including test-only catalog, draft policies, missing production provider/database configuration, legal business details, approved shipping/tax and verified sender. Real Stripe sandbox checkout, PostgreSQL cross-process advisory locking and real email delivery remain external setup checks. README.md contains setup instructions and architecture details.

Shipment emails are included: fulfillment records trigger a separate durable customer shipment notice with tracking information, safe retries and duplicate suppression. Actual delivery requires verified Resend configuration; mock orders never send real email.
