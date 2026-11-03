# Conditional non-selling release: deployment blocked

The owner authorized one production release only after the stated checks pass.
The newer local branch retains disabled commerce and the existing work from
`1d90713`; it was not reset to that older remote checkpoint.

## Changes

- Admin Making, Packing and carrier-handoff worklists now come from all matching
  eligible paid orders, independently of search, filters and the 25-row table.
  Worklist projections exclude customer contact, address and payment details.
- The table remains paginated. Opening an off-page worklist item uses the existing
  authorized detail request and preserves table pagination and close-focus behavior.
- Ordinary dashboard, queue, order-view and read-time session events no longer
  append immutable audit rows. Existing history is not edited or deleted. Operational
  mutations, guest-order claims and denied access retain their existing audit paths.
- Regression checks cover thirty orders per worklist, off-page access, filtered
  pagination, ineligible payments/refunds, customer/staff isolation, repeated reads,
  operational actor attribution and immutable audit behavior.
- Browser checks explicitly exercise the MX Bikes preview and reject checkout,
  email-collection and setup-download actions.

The repository still uses its existing low-volume full-state transaction model.
This change removes view-driven audit growth; it does not claim a database-query
architecture rewrite or a production load test.

## Actual production configuration check

All five safety flags were read back as the exact string `false` in all contexts:
`PAYMENTS_ENABLED`, `REFUNDS_ENABLED`, `TRANSACTIONAL_EMAILS_ENABLED`,
`MARKETING_EMAILS_ENABLED`, `DROP_WAITLIST_ENABLED`.

Only `REFUNDS_ENABLED` was missing and was created as `false`, as explicitly
authorized. No other variable was changed. YouTube sync is not enabled in site
or team configuration.

`AUTH_ACCESS_MODE` is absent from both site and team variables. Therefore the
owner's condition, "If staff-only cannot be confirmed, stop before deploy", is met.
`VITE_AUTH_ACCESS_MODE` is also absent from the site build variables; local browser
checks use an explicit staff-only build profile, not proof of hosted configuration.

**NO-GO for deployment under the current authorization.** No main merge, production
build trigger or publication was performed. No secrets, provider credentials,
production migrations, purchases, refunds, automated emails, signup collection or
setup downloads were activated.

Changing `AUTH_ACCESS_MODE` or its frontend counterpart falls outside the permitted
five-variable edits and needs a new explicit owner instruction. Publishing staff
screens is separate from verifying real production WorkOS accounts and access.
