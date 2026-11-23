# 2026-11-23 — Optional Admin text recovery, with owner/version isolation

The previous development patch `984a211` protected unsaved catalog edits during ordinary navigation but could not rescue text after a tab crash or unexpected reload. This patch supports **optional, explicit restoration of only the product/setup name and description** in the same browser tab, for the same authenticated owner and the same server record version. It never autosaves to the server.

## Design choices
- Data lives in browser `sessionStorage`, not `localStorage`. It has a 12-hour expiry, fixed field/length validation, an opaque authenticated user-ID namespace, separate Merchandise/MX Bikes keys, and version binding. Missing, corrupted, inaccessible or obsolete storage is ignored safely.
- No STP bytes, filenames, file hashes, bike compatibility claims, image URLs, customer data, prices, stock, SKUs, passwords, tokens or cookies are persisted. The original server snapshot remains unchanged until a real authorized save succeeds.
- When an editor is opened with a recoverable text draft, the owner must explicitly select **Restore unsaved text** or **Discard local text**. Restore marks the form unsaved again; it does not authorize publication or an upload.
- After successful server write, a confirmed Catalog/sidebar discard, or a **confirmed WorkOS logout**, remove the associated recovery text. Beforeunload warnings remain. Browser crashes, disabled storage and forced terminations can still lose non-text draft fields, by design.
- A stale record version will not restore over newer server data; preserving optimistic locking matters more than maximizing recovery.
- Do not insert sensitive or confidential information into product descriptions. This is a usability fallback, not secure private storage.

## Files and tests
`src/operations/draft-recovery.js` is the narrowly scoped, testable storage module. `src/operations/Products.jsx`, `MxBikes.jsx` and `WorkosOperations.jsx` handle restore/discard/confirmed logout. Node regressions cover bounds, malformed storage, expiry, version mismatch and cross-owner isolation. Synthetic browser regressions cover opt-in restore, discard, MX setup metadata recovery and cross-owner denial.

No provider settings, payment flags, private setup bytes, live database, credentials or production deployment may change. This is [skip netlify] development work. Run the full six CI jobs and obtain separate approval for any future release.

## Rollback
Revert this development-only patch (or fix forward after review), leaving the earlier `984a211` dirty-draft navigation guard intact. Do not restore the production database or modify customer data. Browser tab storage is intentionally ephemeral; a rollback simply removes the recovery UI.
