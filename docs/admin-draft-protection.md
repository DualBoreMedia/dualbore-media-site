# Admin draft protection and private file preflight — November 22, 2026

Status: development-only fix; no Netlify deployment, production database mutation, WorkOS role grant or file upload.

## User-visible problem
Previously, changing the Unified Catalog's product-type filter or clicking the Admin left rail while editing an unsaved merchandise or MX Bikes draft could unmount the editor and silently discard changes. Switching products inside a single editor already asked for confirmation, but the shared navigation did not. Direct page reload likewise had no protection. This could cost real editing work; never invent saved drafts in the database to compensate.

The private .stp uploader already checked filenames and 48-byte to 2-MiB size limits in src/operations/client.js before sending and on the server. It did not show an immediate error when a file was selected; users learned it was invalid only after pressing Save.

## Implemented, without changing the authenticated server API
- src/operations/Products.jsx and MxBikes.jsx report whether a draft differs from its loaded snapshot or a mutation is in progress.
- src/operations/CatalogManager.jsx asks before dropping unsaved edits when switching Merchandise ↔ MX Bikes, blocks switching during saves, and adds a standard beforeunload browser prompt for unsaved edits or ongoing writes.
- src/operations/OperationsApp.jsx protects left rail navigation and sign-out from silently dropping an unsaved Catalog draft. An in-flight mutation cannot be navigated away from; it reports that the current save must finish.
- src/operations/setup-file-validation.js keeps client preflight rules in one readable function and named constants, reusing them in src/operations/client.js and SetupFile.jsx. Invalid user-selected files show an error immediately, clear selection and never start an upload. The server still independently verifies the exact filename, size, file signature, embedded bike identity, authorization, MFA, optimistic version and private storage.
- Browser tests cover declining/accepting type changes, preventing rail navigation and sign-out, browser beforeunload behavior and invalid upload feedback. Node tests cover exact size edges, safe names and malformed file objects.

## Important constraints
Unsaved draft fields are NOT persisted in localStorage, browser storage, telemetry, Git or an email. A user's canceled navigation preserves the in-memory draft only in that session. Browser beforeunload UI wording depends on the browser. JavaScript cannot guarantee a prompt on every crash, forced kill or power loss; only a successful server response counts as saved.

Do not weaken server-side checks or allow private .stp public download. Sensitive publication, file upload and role changes still require separately verified authorization and MFA. Payment/refund/email/waitlist/digital-delivery production switches remain false.

## Verification and rollback
Verify with `npm run test`, `npm run test:coverage`, `npm run test:e2e` on Chromium, Firefox and WebKit, `npm run test:postgres` using an ISOLATED test database, `npm audit --audit-level=high`, and the normal six GitHub CI jobs on the exact development commit. Record actual results in the associated tracker and Google Drive report. The browser tests use synthetic identities and data; hosted Admin still requires real owner verification.

If a regression is discovered, revert only this new development commit (or fix forward after review) while preserving preceding successful code, production DB state, role grants, audit logs and already published snapshots. No current production deployment changes are required to undo development-only edits.

Reference production release remains `201f963e380b5cf99b1db2fbdd7cd33e71b571a0`; do not treat development as live.
