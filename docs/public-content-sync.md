# Public-first Video Vault and shareable pages

Current status: development branch only; no provider configuration or deployment authorization.

## What the development implementation does

- A read-only Netlify function at /api/video-vault calls the official YouTube Data API with a server-only YOUTUBE_API_KEY, resolving @DualBoreMedia to its official uploads playlist and retrieving up to 50 public videos. Titles, thumbnail URLs, channel IDs and ISO 8601 durations are verified and bounded before returning a JSON feed.
- The Video Vault and Garage homepage can consume that feed. The existing five curated videos remain available when the key is absent, Google errors, responses are malformed, or the channel cannot be independently confirmed.
- Successful responses have a Netlify CDN freshness policy of 24 hours and stale-while-revalidate for up to seven days. This is **request-driven caching, not an independent scheduled daily job or durable last-known-good JSON snapshot**. It refreshes when a request reaches the cache after expiry. Failures after the stale window may show the packaged curated five; this behavior must be improved before claiming permanent preservation.
- The four known builds and five curated videos have individual generated static HTML pages, titles, meta descriptions, canonical paths, social-image metadata, WebPage structured data and sitemap entries. The original app keeps its in-page quick views and has visible links to shareable paths.
- Additional synchronized videos have valid /videos/VIDEO_ID/ client-side routes. **Their metadata is currently client-rendered and their static sitemap entries are not generated yet**, so social unfurls and complete indexing for newly added videos are not guaranteed. Do not describe this as fully solved.
- Existing original merchandise images are unchanged. Do not generate synthetic product photos.

## Owner configuration required before activating YouTube

1. Approve a Google Cloud project and YouTube Data API key with the intended API restrictions and usage quota. Provide the key privately via Netlify Functions secret environment configuration, never in chat, GitHub, VITE_* variables or repository source.
2. Verify correct @DualBoreMedia channel ownership and compare returned video IDs/titles/durations with the actual public channel. Confirm Shorts versus long-form display and any editorial exclusions with the owners.
3. Test a real fetch, CDN hit and next-day refresh on an approved protected deployment, along with provider failure and quota exhaustion. The static fallback must remain available.
4. For the owner's requested true daily scheduled and persistent latest-successful JSON cache, add and test a publisher-owned durable store (e.g. Netlify Blobs) and Scheduled Function on the published site with explicit usage review. Scheduled Functions do not run automatically on unlaunched branch builds. Do not enable a paid service without approval.
5. Complete searchable URL and social-share validation for dynamically discovered videos, then conduct a final independent security and SEO review.

Netlify staff Admin, payments, refunds, transactional emails and signup collection remain disabled. Main and production remain untouched.

Documentation: https://developers.google.com/youtube/v3/docs/channels/list , https://developers.google.com/youtube/v3/docs/playlistItems/list , https://developers.google.com/youtube/v3/docs/videos/list , https://docs.netlify.com/build/caching/caching-overview/ , https://docs.netlify.com/build/functions/scheduled-functions/ .
