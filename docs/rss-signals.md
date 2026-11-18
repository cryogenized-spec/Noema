# NOEMA Signals — RSS/Atom port from Project RADIX

Source implementation reviewed:
- `cryogenized-spec/Project-Radix/src/components/Channels.tsx` — folder/channel selection, `/api/rss` fetch, browser `DOMParser` XML parsing, article previews, manual refresh, optional separate Channeler analysis.
- `cryogenized-spec/Project-Radix/server.ts` and `api/index.ts` — server-side proxy and RSSHub/Nitter fallbacks.
- `cryogenized-spec/Project-Radix/src/lib/db.ts` — persistent Dexie channels, folders and feeds.

## What has been ported

- Real RSS 2.0, Atom and RDF XML reading via `/api/rss`, with publisher link/summary/date, source grouping, read state and saved state.
- Local Dexie v11: `rssSubscriptions`, `rssFolders`, `rssArticles`. Reads and stars persist, subscriptions remain in the same browser profile.
- A compact Signals workspace with **Articles / Saved / Sources** tabs, folder assignment, search, unread filter and explicit refresh.
- On-entry and on-visibility refresh when entries are older than 15 minutes, plus manual refresh. The PWA will not pretend to keep synchronising while Android has suspended its browser.
- Concurrency capped at three source requests at a time; 35 feeds per browser, 35 entries accepted per fetch, and up to 80 non-starred entries kept per feed.
- Known public sources as optional one-tap starters (Hacker News, BBC Technology, NASA). These are examples, not automatic subscriptions or automatic tracking.
- All source markup is converted to **plain text** and escaped by React. External article links must be HTTPS and use `rel="noopener noreferrer"`; no arbitrary HTML, iframe or embedded third-party images are rendered.
- DNS-pinned, Node HTTPS server endpoint with public-IPv4 resolution, no raw-IP/local/private targets, no custom ports or credentials, explicit redirect validation, 9-second request timeout, 900 KB output cap, XML-type check, entity/DOCTYPE rejection. Reject non-XML responses and do not publish feed data to shared caches.

## Important differences from RADIX

- RADIX currently generates **three fake Nitter/X articles**. NOEMA does not adopt fake feed entries or present X/Telegram bridges as live.
- RADIX exposes an unrestricted URL-fetching proxy. NOEMA validates destinations and binds the DNS-validated address to the actual network connection, reducing SSRF risks.
- RADIX's `Channeler` optionally analyses content through external models. NOEMA does **not** automatically forward RSS text to an AI model. Feed analysis requires a separate opt-in, permission-scoped feature tied to the green AI Studio role.
- Avoided RADIX's heavy media/3D/Exa/gopher dependencies and its broader discovery UI; no new npm package was required.

## Security and deployment gates

The feed endpoint is server-side and runs on Next.js Node runtime, so a **standalone static PWA** without this same-origin endpoint cannot fetch most CORS-restricted feeds. For Cloudflare migration, move the same validated transport semantics to an appropriate Worker. If deploying the route publicly, add owner-authenticated quotas / edge rate limits / abuse monitoring before lifting Vercel Authentication: bounded fetching alone cannot prevent resource exhaustion on a publicly accessible endpoint. User-supplied feed URLs are sent to the NOEMA host and upstream publisher; users should avoid putting private tokens in RSS URL query strings.

No AI keys, consumer messages or private workshop profile information are accessed by this feed endpoint. Articles are not verified facts. Treat headlines, descriptions and future model context as untrusted source content, not system instructions.

## Manual acceptance

- Open private PWA at 360×640, select **Signals > Sources**, subscribe to `https://news.ycombinator.com/rss`.
- Confirm HTTP 200 `/api/rss?url=...` with actual XML, articles render with real titles, original HTTPS links and dates.
- Add BBC Technology and NASA; use folder assignment, search, unread, Save, refresh and remove. Verify refresh preserves read/star state.
- Refresh browser and confirm cached articles and sources remain available. Disconnect network: existing titles/excerpts remain; full external articles do not.
- Verify invalid, huge, non-XML, local-address, HTTP, and unavailable feeds show an error rather than simulated content. Verify URLs containing credentials and redirects to private addresses are refused.
- Confirm no accidental horizontal scroll and all controls remain visible at widths 320, 360, and 393 CSS px.
