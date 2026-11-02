# Public-first Video Vault and shareable pages

Current status: development branch only; no provider configuration or deployment authorization.

## What the development implementation does

- The read-only Netlify function at /api/video-vault serves a sanitized cached snapshot when YOUTUBE_SYNC_ENABLED=true. Only the gated scheduled refresh uses the server-only YOUTUBE_API_KEY to call the official YouTube Data API, resolve @DualBoreMedia and retrieve up to 50 public videos. Titles, thumbnail URLs, channel IDs and ISO 8601 durations are verified and bounded before returning a JSON feed.
- The Video Vault and Garage homepage can consume that feed. The existing five curated videos remain available when the key is absent, Google errors, responses are malformed, or the channel cannot be independently confirmed.
- Successful responses use a Netlify CDN freshness policy of 24 hours and stale-while-revalidate for up to seven days. A separate scheduled Netlify Function now refreshes a last-successful JSON snapshot once daily at 10:00 UTC using Netlify's Cache API, with a 90-day snapshot TTL. When YouTube fails, the function does not overwrite the prior successful snapshot. The public endpoint only reads that snapshot and never fetches from Google or writes the cache, including on HEAD requests. Cache misses or storage failures return curated videos until a successful scheduled refresh. This prevents anonymous requests from spending provider quota. A fresh deployment or cache expiry can still remove cached data; the original five curated videos remain the ultimate fallback. This is production-code capability, not hosted verification.
- The four known builds and five curated videos have individual generated static HTML pages, titles, meta descriptions, canonical paths, social-image metadata, WebPage structured data and sitemap entries. The original app keeps its in-page quick views and has visible links to shareable paths.
- Additional synchronized videos have valid /videos/VIDEO_ID/ client-side routes. **Their metadata is currently client-rendered and their static sitemap entries are not generated yet**, so social unfurls and complete indexing for newly added videos are not guaranteed. Do not describe this as fully solved.
- Existing original merchandise images are unchanged. Do not generate synthetic product photos.

## Owner configuration required before activating YouTube

1. Approve a Google Cloud project and YouTube Data API key with the intended API restrictions and usage quota. Set YOUTUBE_SYNC_ENABLED=true only after approval and verify the Functions-scoped private YOUTUBE_API_KEY. Never place it in chat, GitHub, VITE_* variables or repository source.
2. Verify correct @DualBoreMedia channel ownership and compare returned video IDs/titles/durations with the actual public channel. Confirm Shorts versus long-form display and any editorial exclusions with the owners.
3. Test a real fetch, CDN hit and next-day refresh on an approved protected deployment, along with provider failure and quota exhaustion. The static fallback must remain available.
4. Verify the daily scheduled function and its cache on a published deployment; Netlify does not fire schedules on unpublished branches. The Cache API snapshot is per-region and time-limited, not an off-platform permanent archive. Confirm quota/compute impact and evaluate Netlify Blobs only if longer-lived, deploy-independent persistence is needed. Never enable a paid service without approval.
5. Complete searchable URL and social-share validation for dynamically discovered videos, then conduct a final independent security and SEO review.

Netlify staff Admin, payments, refunds, transactional emails and signup collection remain disabled. Main and production remain untouched.

Documentation: https://developers.google.com/youtube/v3/docs/channels/list , https://developers.google.com/youtube/v3/docs/playlistItems/list , https://developers.google.com/youtube/v3/docs/videos/list , https://docs.netlify.com/build/caching/caching-overview/ , https://docs.netlify.com/build/functions/scheduled-functions/ .
