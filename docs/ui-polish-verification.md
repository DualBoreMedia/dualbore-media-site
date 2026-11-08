# UI release checkpoint: November 8, 2026

Development only. No main merge, deployment or commerce activation is authorized.
Base: `1edf999a5d060242871127333f3f10bc24b242bb`.

## Implemented

- Shared spacing, typography, containers and 48px controls, preserving real artwork and the black/red garage identity.
- Five named primary destinations on home, policies, build/video pages and the standalone shop. Tablet labels must be visibly painted, not merely present in accessible names.
- Compact manufacturer-to-motorcycle setup selection, general and track groups, honest availability and sample compatibility labels; all 53 reference bikes preserved.
- Loading/retry recovery, ignored stale responses, search clearing stale bike selection and keyboard focus after replacing a selection control.
- Consistent merchandise rows using shared grid tracks rather than fixed title heights, with existing catalog/filter/sorting behavior preserved.
- Admin form padding, non-stretched empty lists, saved/unsaved/public snapshot status, inventory reason-field layout and search-empty feedback, active Staff navigation and cleared successful upload selection.
- CodeRabbit's minor empty-live-region issue corrected: status nodes stay mounted and visually collapse while empty. Regression coverage verifies the nodes remain available for later announcements.

## Evidence and limits

The full unit/component coverage suite and the three-browser interaction suite are recorded under ignored `test-results/ui-polish`. Real PostgreSQL checks use only the isolated loopback sandbox and disposable schemas. These do not prove production WorkOS, production storage or hosted monitoring.

The rendered matrix covered 320, 360, 375, 390, 414, 768, 1024, 1280, 1440 and 1920 widths in Chromium, Firefox and WebKit: 756 initial states, with focused follow-up captures for corrected merchandise, setup and inventory layouts. No document overflow, clipped controls, broken visible images, blank pages or framework overlays were observed. Actual optional YouTube frames produced Google-owned warnings in Firefox and headless GPU warnings in Chromium; WebKit's matrix was clean. These are retained separately from first-party errors.

Before/after screenshots and computed measurements remain in ignored `test-results/ui-polish/before`, `after` and `after-final`. Initial home/merch baseline captures used local commerce mode; they must not be presented as production or as proof of public email/signup behavior. After captures used the built non-selling frontend, read-only localhost catalog API and explicitly synthetic Admin practice data.

Genuine 125%, 150% and 200% browser zoom remains unverified. Native Chrome window binding failed and the Computer Use tool stopped native Firefox control because URL-policy enforcement was unsupported. Viewport resizing was not substituted for browser zoom.

All six purchase/refund/transactional-email/marketing/waitlist/digital-delivery switches stay false. Private STP bytes and credentials are excluded from Git and public assets. Secure live Admin still requires the independent production evidence in `admin-only-release.md` and `phase3-admin-remediation.md`.
