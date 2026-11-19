# NOEMA Contact relay — current status (18 November 2026)

The secure Contact relay is provisioned and owner-bound on Cloudflare staging. The separate public guest PWA is deployed at `https://noema-guest.vercel.app/`, with exact `GUEST_ORIGIN` configured and guest API routes restricted; the original `APP_ORIGIN` and `OWNER_DEVICE_ID` are preserved. The integrated source is on `main`; the protected staging branch is fast-forwarded to the same integrated source without changing its hostname or preview-only relay configuration. Signed guest and browser-origin smoke checks passed in CI; human two-device encrypted exchange and UI acceptance are still required.

See [current release status](../docs/release-status.md). Older staging setup notes below are historical and should not be treated as today's deployment state. In particular, do not replace the registered owner browser/device fingerprint, disable protected owner access, enable experimental account flags or activate model reception automatically.

---

## Private staging resources — 17 November 2026

**Provisioned, owner-bound private staging:**
- Staging PWA: `https://noema-contact-staging.vercel.app/connect`, Vercel project `noema`, linked to branch `feature/noema-e2ee-contact-reception`. Vercel Authentication is enforced for **all** NOEMA deployments, including custom domains. This is a private QA URL, not an anonymous public guest launch.
- Separate Cloudflare Worker: `noema-contact-relay-staging` at `https://noema-contact-relay-staging.cryogenized.workers.dev`. Live same-script SQLite Durable Object namespace is `noema-contact-relay-staging_NoemaRelayRoom`, bound as `NOEMA_ROOM`.
- Worker `APP_ORIGIN` is exactly `https://noema-contact-staging.vercel.app`; `OWNER_DEVICE_ID` is now bound to the user-supplied P-256 device fingerprint (ending `lHYUwY`). The full device fingerprint is held in the Cloudflare runtime binding, not committed in source. Anonymous requests must return HTTP 401, untrusted origins HTTP 403, and only the registered owner may issue invitations. AI Reception remains off.
- The Vercel Preview environment variable `NEXT_PUBLIC_NOEMA_RELAY_URL` is scoped only to the messaging feature branch. Production is not connected to this Worker.
- A new deployment is needed after changing the Vercel preview environment variable; do not assume previously built Next.js `NEXT_PUBLIC_*` bundles will pick up a later change.

**Next owner action:** return to the protected stable staging `/connect` URL in the same browser that supplied the fingerprint (ending `lHYUwY`) and verify it says **Owner** after signing in. Do not clear IndexedDB, change origins, or switch to a private/incognito browser; the signing key remains on the originating device. Test creating a single-use invitation and manually sharing it with a second Vercel-authorised browser. Keep global and per-thread AI Reception disabled. Do not turn off Vercel Authentication or publicly expose guest invitation browsing without explicit security review.

# NOEMA encrypted contact bridge — staging

This branch replaces the older plaintext RADIX/NOEMA Cloudflare relay pilot. It is a **self-hosted Cloudflare Worker + SQLite Durable Object**, deployed only to private Cloudflare staging; there is no production/public rollout. UI route: `/connect` for the owner and `/invite/[token]` for a guest. Existing `/invite/demo` remains inert.

## Security design
- A browser generates a signed P-256 non-extractable device identity in IndexedDB; Cloudflare issues a 24-hour scoped bearer session after verifying a one-time signed challenge.
- The Worker must be configured with `OWNER_DEVICE_ID` (the owner browser's public device fingerprint) and exact `APP_ORIGIN`. Without the owner fingerprint it **cannot issue invitations**.
- Owner generates a random 256-bit invitation secret, stores it as a non-extractable HKDF CryptoKey in local IndexedDB, sends only a random `keyId` to Cloudflare, and shares a single-use URL with the encryption secret in `#k=` (fragment). Cloudflare does not receive URL fragments. Guest imports the secret after explicit invite redemption and both parties derive a per-thread AES-256-GCM key with HKDF-SHA256.
- All guest/owner/agent messages are encrypted client-side with new random 96-bit nonces and authenticated additional data bound to `[protocol, threadId, clientMessageId]`; Worker accepts only `enc1.<nonce>.<ciphertext>`. It stores encrypted envelopes and delivery metadata, never plaintext, decryption keys or model provider keys.
- **Invitation channel trust matters:** whoever receives the complete URL (including the fragment) can derive the thread key. Do not post invitations publicly; WhatsApp or another link transport sees what you share there. This is an invitation-key encrypted pilot, **not an independently audited Signal-style E2EE protocol**, with no forward secrecy, multidevice key recovery or key transparency yet.
- Guest opening a URL or link preview is inert. Only pressing Continue redeems the one-use token; only explicit Send transmits ciphertext. The owner can revoke unredeemed invitations.
- Cloudflare allows a maximum of 20 owner invitations/day, 45 requests/min/IP, 8 agent claims per UTC day and 3 per thread/day; owner chooses a stricter daily/per-thread ceiling. Agent attempts are counted atomically **before** direct OpenAI inference; a failed attempt is still spent. A claimed message cannot silently trigger a second paid call.
- AI Reception defaults **OFF globally and OFF per conversation**. Activating both is required, and only guest messages arriving *after* activation are eligible. An agent assigned the RED Reception role, marked `Invited`, using OpenAI and a locally unlocked owner lockbox, must exist. Every response visibly discloses AI identity. No MCP tools, file access, server-held API keys or generic agent gateway are enabled.
- **Model calls happen directly from the owner PWA** to `https://api.openai.com/v1/responses`, using the locally unlocked BYOK secret with `store:false`, `tools:[]`, six bounded encrypted turns and <=384 output tokens. Cloudflare does not run OpenAI or handle the key. A browser/CORS/provider failure leaves the message unanswered and the reserved attempt counted. Conversation content **does leave the E2EE channel when deliberately shared with OpenAI for AI reception**.
- 5-second foreground polling while the owner page is visible. This is *not an always-awake mobile agent*. Force-stop, Android background suspension, offline devices and closed tabs may delay responses.

## Staging configuration (no public deploy by CI)

1. Use a **stable** HTTPS PWA origin. Preview URLs that change every build have different IndexedDB identities. Open `/connect` and copy the signed device ID.
2. Configure the Worker using `relay/wrangler.jsonc`: `APP_ORIGIN` is the exact PWA origin, `OWNER_DEVICE_ID` is the device ID obtained in step 1. Both are required; never use somebody else's owner fingerprint.
3. Provision the Cloudflare Durable Object SQLite migration and deploy using Wrangler **only after explicit owner approval**. Do not create paid Cloudflare resources without authorisation.
4. Configure the Next.js PWA public environment `NEXT_PUBLIC_NOEMA_RELAY_URL` with that Worker's HTTPS origin, then redeploy the PWA to the **same** stable hostname. The relay is otherwise deliberately disabled.
5. From owner `/connect`, issue an invitation, copy/QR-share it to another browser, accept anonymously, and explicitly send a test message.
6. Verify ciphertext-only Durable Object records, reply manually, then unlock the owner's API Lockbox and choose a red Reception agent with `Invited` permission. Enable global and individual thread reception and verify a new message invokes at most one bounded OpenAI response, with AI disclosure.
7. Run `node --test relay/tests/*.test.mjs`, `npm run typecheck`, `npm run typecheck:hardening`, `npm run lint`, `npm run security:gates`, `npm run test:unit`, `npm run build`.

## Release gates

Do not public-launch yet. Threat-model owner identity key loss, phishing/fake invite links, fragment exfiltration, cross-origin XSS, encrypted backup recovery, zero-knowledge message retention, credential compromise, abuse denial-of-service, mailbox garbage collection, Cloudflare costs, quota fairness, external-model consent, per-message spend accounting, and device-level tests for cross-browser decryption and auto reception. Cloudflare cost/usage quotas and app-layer abuse protection must be configured before public access. This is a private development slice; no formal security audit has been performed.

## Optional Web Push pilot (disabled until accepted)

This is an **opt-in** notification channel, not message delivery or a read receipt.
The Worker sends a single generic encrypted wake string. It never sends a
sender name, conversation identifier, message text, invitation token or key.

The implementation uses only Cloudflare WebCrypto and `fetch`, with VAPID
(RFC 8292) and `aes128gcm` (RFC 8291). A private VAPID key must be stored as
the Worker secret `VAPID_PRIVATE_KEY`, never in Git, a Vercel public variable
or a browser. The matching `VAPID_PUBLIC_KEY` is a Worker plain-text binding.
`VAPID_SUBJECT` must be a stable `mailto:` or `https://` contact. The Worker
returns `available:false` until **all** of these are present and the explicit
`PUSH_ENABLED=true` switch is set. The repository configuration leaves
`PUSH_ENABLED=false` intentionally.

The two PWAs each install only their own scoped `/noema-push-sw.js` after the
user taps Enable. Permission is never prompted automatically. A signed
device can register at most one current subscription and revoke it from
Settings / the guest bell. An uninvited guest cannot register. Subscription
endpoints must use exact known Google, Mozilla or Apple push-service hosts,
preventing arbitrary Worker network requests.

For staging release: run `node --test relay/tests/*.test.mjs`, verify signed
owner/guest CORS and permission smoke, test two-device subscribe/send/reply,
verify notifications with the PWA closed and click navigation, verify revoke
and 404/410 cleanup. Do not interpret an accepted push-service HTTP response
as verified delivery to a handset. Keep account and mailbox flags disabled.
