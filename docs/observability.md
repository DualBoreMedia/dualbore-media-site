# Observability verification and operating procedure

## Current status

The local code includes a Sentry SDK adapter, strict event-data allowlists, correlation IDs, structured JSON logs and a frontend recovery boundary. Provider delivery, source-map resolution, production Function logs and real alert delivery are **not verified**. Do not activate payments or mark the monitoring launch gate complete based on an SDK unit test or successful build.

Sentry Developer is the proposed $0 plan. The provider confirms the Developer plan remains free and does not permit a pay-as-you-go budget. No account, paid upgrade, alert recipient or production key is created by this code. Exact current quota, error retention and alert capabilities must be recorded from the chosen account before activation. Never silently upgrade when the quota is exhausted.

Official sources checked October 15, 2026:

- https://www.sentry.help/en/articles/16738709-changes-to-legacy-developer-plans-september-2026
- https://www.sentry.help/en/articles/13965037-can-i-set-up-an-on-demand-pay-as-you-go-budget-for-my-free-developer-plan
- https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/
- https://docs.netlify.com/build/functions/logs/
- https://docs.netlify.com/manage/monitoring/observability/overview/

## Private configuration and source maps

Server configuration: `SENTRY_DSN`, `ERROR_MONITORING_ENABLED=true`; otherwise reporting stays disabled. Browser configuration uses a public ingestion DSN and explicit enable switch only. An ingestion DSN is not an account-management token. Never expose `SENTRY_AUTH_TOKEN` to browser code or a `VITE_` variable.

The build embeds only release SHA and environment. It produces hidden maps with no sourceMappingURL link. `protect-source-maps.mjs` removes all maps from public output and stores them under ignored `.tools/private-sourcemaps/<release>/`. Build evidence explicitly records provider delivery and resolved source maps as false. These artifacts contain source code: keep them private, never Git-commit them or upload them as public GitHub artifacts.

Private source-map upload requires `SENTRY_UPLOAD_SOURCEMAPS=true`, a real `COMMIT_REF`/`RELEASE_SHA`, and server/build-only `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. No upload occurs without that explicit configuration. The Sentry plugin attaches debug IDs; SDK events preserve debug ID/code-file associations and frame coordinates while stripping source context and locals. A real controlled provider event must still demonstrate a resolved original source line. Do not make hidden maps publicly accessible to compensate for an upload problem.

## Logging and privacy

JSON records include timestamp, severity, environment, release, request ID, scope, event/category and bounded allowlisted diagnostic values. AsyncLocalStorage preserves request identity across service/database/provider awaits without adding customer data to payloads. HTTP responses carry `X-Request-ID`; unexpected failures return that same safe support reference. Platform request IDs are accepted only in Netlify mode; arbitrary client request-ID headers are ignored.

Do not pass customer names, emails, addresses, IP addresses, provider responses, request bodies, headers, cookies or tokens to logging. Provider error text is never logged. Monitoring events are reconstructed from an allowlist: no user, request, body, authorization, breadcrumbs, replay, source context, local variables or arbitrary extra fields. Exception messages are replaced by safe fixed text; source file/line/column and safe category/context remain for debugging. Tracing, replay, ambient SDK integrations and automatic session collection are disabled. Handle ordinary validation/access/decline errors without exception alerts.

Functions must explicitly report caught unexpected failures as well as uncaught ones; a wrapper cannot see an exception already turned into a response. Monitoring failure must not fail an order, retry a payment, prevent a verified webhook from committing, or send duplicate email. SDK flush is bounded. Keep provider delivery-failure counters visible separately from application payment status.

## Needs Attention and alerts

The existing admin queue remains the fulfillment operator's primary recovery surface: recorded email failures, failed webhook reconciliation, pending/failed refunds, stale reservations, missing tracking, stale fulfillment and account-deletion review. Employees must not need Sentry access to pack and ship. Generic provider outages that occur before an order exists are monitoring signals; they must not fabricate orders or failed payment records.

Before activation, configure and actually test available free-plan alerts for new unhandled exceptions, repeated checkout/5xx failures, database outages, refund failures, webhook processing/signature failures and transactional email spikes. Select only an owner-approved recipient. Group by safe exception category and source location, use a cooldown/dedupe window, and avoid alerts for normal customer validation. Alert rules/destinations are presently **not configured or verified**.

## Controlled verification before launch

1. Use a non-customer, non-payment test process against the intended monitoring project. No public artificial-error endpoint.
2. Generate an exception with a known source line and synthetic redaction canaries. Tag the exact release/environment and safe correlation ID.
3. Inspect the received provider event, confirm the original source line resolves, and verify no canary, request token, user data or source-local value appears.
4. Confirm the alert reaches its approved destination without duplicate spam. Record the event ID and screenshot privately.
5. Disable/remove the test trigger. Repeat in the actual deployment only after explicit deployment authorization. No live customer order is needed.

## Retention and support lookup

Netlify: project Deploys contains build logs; Functions contains invocation logs; Analytics & metrics > Observability contains request/compute data. Official credit-plan Observability windows are Free/Personal 24 hours and Pro 7 days; these are not a promise about Function-log retention. Record actual Function-log retention from the account. Do not use these short-lived platform views as the only exception record.

Sentry: record the chosen free account's actual error retention and quota before activation; not verified here. GitHub Actions artifacts expire at the workflow's configured retention and may be deleted earlier; do not assume permanent evidence. Private source maps currently remain on the local build host until its operator removes them; establish restricted artifact retention before CI source-map upload.
