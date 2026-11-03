# Private live Admin and bike-library candidate

## Current scope

The existing Product Manager edits product drafts, categories and audience classifications. Saving a draft is private; publishing an approved physical listing updates the public catalog only after production authentication and persistent storage work. It is not a general source-code editor. Fixing arbitrary layout or application errors still requires reviewed code changes.

The new Bike library is a separate view on `/setups`, containing 53 reference placeholders, manufacturer filtering and compact model search. A desktop filter sidebar stacks above results on phones. Existing previews remain the default view. Neither view enables payments, email collection or file delivery.

## Roster provenance and limits

Owner confirmed the [OEM pack download page](https://mxb-mods.com/oem-bike-pack/), currently describing MX OEM v0.19.1. Reference release: [Project OEM MX v0.19.1](https://oem.mxb-mods.com/mx-oem-v0-19-1-update/). The Fantic XXF 250/450 year follows the explicit 2025 model-change entry rather than the stale 2023 entries in that page's roster. Cross-checks: [official TGA reference](https://oem.mxb-mods.com/tga-list/) and [official GFX reference](https://oem.mxb-mods.com/official-gfx/). Other model labels retain the release roster's spelling; they are not claimed to be authoritative in-game identifiers. No setup images, compatibility or completed files are fabricated.

The owner requests real stock photos. Initial image searches found model/year mismatches and third-party dealer photos without verified reuse terms. Commons research encountered HTTP 429 and was stopped; search results are not treated as approved assets. All cards remain explicit empty setup slots until suitable photos are sourced. A labeled same-model-family fallback has been asked about but is not yet approved. Do not silently fill 53 cards with unrelated bike photos.

## Fresh production observations

- Public non-selling release `2628f1fc8ff9c6d84551f1b89a2570d3e1fe88cf` is live. Staff-only server/build settings are present. No new production deployment was made during this candidate's preparation.
- Read-only site environment inventory has no ordinary configured WorkOS provider/key/client/cookie/organization settings, application DATABASE_URL or Sentry DSN. Managed database bindings may be separate; this observation does not establish database contents or migration state.
- Authenticated WorkOS dashboard remains on staging. Selecting Production opens “Add billing information to enable Production.” The dialog says charges start only after enabling a paid production feature. No billing information or paid feature was submitted, and staging secrets were not copied.
- The strict local Admin checker remains NO-GO in an unconfigured shell. Its 43 diagnostics are not a claim that 43 independent provider settings are absent. Do not mark evidence flags true without actual verification.

## Required before live editing

1. Owner unlocks WorkOS production and confirms the individual owner accounts. Review the free allowance and avoid paid/custom-domain features.
2. Explicitly approve private production memberships/roles and callback configuration; enforce Google plus TOTP, current server authorization, revocation and fresh verification for sensitive writes. Never grant roles from client input.
3. Verify the actual production database, TLS, restricted application role and current backups. Approve exact additive migrations and an isolated restore rehearsal separately. Do not seed synthetic orders or use a migration owner as the application login.
4. Complete production monitoring, safe correlation/logging, original-source stack verification and approved synthetic event/alert testing.
5. Resolve the previously documented malformed environment labels through approved provider revocation/cleanup. Do not display credential-shaped names or treat a publishable Stripe key as a secret-key compromise.
6. Rerun the strict Admin gate with independently verified evidence, then obtain exact-release approval and test real owner sign-in and metadata changes. All commerce/sending/signup/download switches remain off.

The public placeholder UI can be reviewed separately. It must not be described as working production Admin access.
