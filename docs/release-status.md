# NOEMA — integration status (18 November 2026)

This is the current technical and release reference. The repository's older vertical-slice notes are retained as development history. For an actual live-traffic claim, check the environment and smoke-test results, not just the source code.

## Integrated source

`main` contains merged PRs [#38](https://github.com/cryogenized-spec/Noema/pull/38) (responsive shell, AI Studio, model catalogue, local Workshop and Signals), [#42](https://github.com/cryogenized-spec/Noema/pull/42) (encrypted Contact, signed device sessions, one-use invites, explicit opt-in AI Reception, and guest interface), [#43](https://github.com/cryogenized-spec/Noema/pull/43) (identity/account pairing prototypes disabled by default), and [#30](https://github.com/cryogenized-spec/Noema/pull/30) (local conversation isolation, request cancellation, vault and microphone lifecycle, Markdown and export safety). PR #45's public guest and chat-first work was merged into #42 before #42 merged into main.

The Contact UI prioritizes the conversation timeline and composer. It has a responsive Contacts list, edge-aware message menus, global unread indicator, and browser-local display sizing controls. Owner invitations and AI Reception are subordinate to the chat. This is distinct from the local AI Chat workspace.

## Stable application URLs and isolation

- **Owner/contact staging:** https://noema-contact-staging.vercel.app/connect — Vercel Authentication remains enabled. The owner device is defined by the existing Cloudflare `OWNER_DEVICE_ID` binding, not inferred from a new URL or another browser.
- **Public guest-only PWA:** https://noema-guest.vercel.app/ — dedicated Vercel project without Vercel SSO; a guest needs a private owner-issued single-use link to join a conversation. The link carries its capability and secret in the URL fragment. Do not publish complete invite URLs in logs or issues.
- **Cloudflare:** `noema-contact-relay-staging`, `https://noema-contact-relay-staging.cryogenized.workers.dev`. Exact `APP_ORIGIN` and `GUEST_ORIGIN` are configured, and the original owner fingerprint is preserved. Guest-origin browser calls are restricted to signing in, redeeming invitations and accessing their own ciphertext conversations. Signed session and membership checks remain essential; CORS is not an authentication mechanism.
- **Production/main:** `main` is connected to Vercel, but `NEXT_PUBLIC_NOEMA_RELAY_URL` and `NEXT_PUBLIC_NOEMA_GUEST_ORIGIN` are scoped to the *protected staging branch* `feature/noema-e2ee-contact-reception`, which has been fast-forwarded to the integrated main commit. Do **not** reassign the protected owner hostname to an unrelated preview or an unconfigured production bundle; origin-bound IndexedDB keys must remain intact.

## Security boundaries

The pilot encrypts messages in the browser using an invitation-derived AES-256-GCM key. The Worker stores ciphertext and delivery metadata; it is not a Signal-style audited E2EE system (no forward secrecy, group key recovery or transparency). Cloudflare does not hold model API keys. The red AI Reception agent is OFF globally and OFF per conversation until the owner opts in; model calls occur in the visible owner's browser with BYOK, without MCP tools. Merely opening a guest invite does not redeem it or send a message.

Independent account enrollment, mailbox and multi-device key recovery remain **disabled/not deployed**. Do not enable `ACCOUNT_REGISTRATION_ENABLED`, `ACCOUNT_MAILBOX_ENABLED`, `NEXT_PUBLIC_NOEMA_ACCOUNTS_ENABLED`, or `NEXT_PUBLIC_NOEMA_ACCOUNT_MAIL_ENABLED` without completing their threat model, key distribution, revocation, recovery and live isolation acceptance.

## Verified checks and remaining acceptance

- GitHub strict pipelines on the integrated `main` changes: TypeScript, hardening, lint, unit/security suites, Next.js build and high/critical production audit have passed.
- Live protocol smoke tests can confirm the public guest site, preflight restrictions, signed guest authentication, forbidden owner routes, unauthenticated denial and stable owner origin. Run `node relay/smoke-public-guest.mjs` and `node relay/smoke-staging.mjs` after changes to the Worker, staging app or public guest app.
- **Human acceptance remains:** with the original signed owner browser, generate one private invite; redeem it on a different device without Vercel SSO; exchange encrypted messages in both directions; verify an unrelated device cannot read either thread; reload/reconnect; check narrow 320, 360 and 393 CSS-pixel viewports and virtual-keyboard scroll behaviour.
- Keep AI Reception off during basic messaging acceptance. Separately test opted-in Reception with an explicitly authorized API key/budget; automated CI must not incur paid model calls.
- Do not claim general public registrations, always-on Android agent wake, true unread counters, push delivery, encrypted cross-device account recovery or full security audit.

## Remaining roadmap

1. Complete real phone/laptop messaging and narrow-viewport acceptance, and verify stable staging reflects the current integrated branch.
2. Strengthen abuse controls, encrypted history retention/recovery and the protocol threat model before broader public alpha.
3. Validate account ownership, independent device enrollment, rotation/revocation and account-scoped ciphertext key envelopes before enabling enrollment flags.
4. Resume Android Capacitor debug APK work from [draft #37](https://github.com/cryogenized-spec/Noema/pull/37) after the PWA-first messaging gates; that branch was deliberately not merged.
5. Continue to subordinate configuration and notices to the conversation; use dropdowns/settings instead of permanent banners.

## 19 November — Web Push implementation gate

PR #53 (feature branch) adds device-authenticated Web Push subscriptions, a
WebCrypto/VAPID encrypted sender, origin-scoped service workers for both owner
and guest, and user-initiated enable/disable controls. The transport payload is
always `{"title":"New NOEMA message"}`, with no message plaintext or IDs.
The Cloudflare Worker must be deployed separately, have VAPID keys configured
server-side and explicitly set `PUSH_ENABLED=true`. A merged PWA alone does
**not** mean background push is operational. A real owner/guest mobile test
remains mandatory before marking Web Push live or promising device delivery.


## 19 November — historical message recovery

The Contact relay now supports bounded `before=<sequence>` pagination, in addition
to the existing current-message endpoint. Both owner and guest interfaces offer
**Load older messages** when more ciphertext exists on the relay. A 60-message
response remains the maximum per request, while loaded pages are merged in
server sequence order with concurrent foreground polling and the scroll
position is preserved. Signed conversation membership still applies to every
page; no plaintext or decryption keys are stored in Cloudflare.

This restores access to older *server-retained ciphertext* from the same
authenticated browser with its original contact key. It is **not** offline
message storage, key backup, forward secrecy, or cross-device recovery.
Keep the original browser origin and its IndexedDB contact keys intact.


## Owner Contact signed-session renewal

The owner browser now attempts **one signed reauthentication** if an
authenticated relay request receives HTTP 401. Concurrent requests share the
same challenge exchange. The renewed token can only replace a previous session
for the **same non-extractable device identity**, and unrelated-device tokens,
permission denials, already-retried calls and aborted requests do not trigger
further automatic retries. The owner key itself is never rotated by this
recovery path, and no message plaintext enters session storage. A lost or
damaged private device key still requires an explicit recovery design; it
cannot be silently recreated.
