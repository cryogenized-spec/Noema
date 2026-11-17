## Private staging resources — 17 November 2026

**Provisioned, intentionally owner-locked:**
- Staging PWA: `https://noema-contact-staging.vercel.app/connect`, Vercel project `noema`, linked to branch `feature/noema-e2ee-contact-reception`. Vercel Authentication is enforced for **all** NOEMA deployments, including custom domains. This is a private QA URL, not an anonymous public guest launch.
- Separate Cloudflare Worker: `noema-contact-relay-staging` at `https://noema-contact-relay-staging.cryogenized.workers.dev`. Live same-script SQLite Durable Object namespace is `noema-contact-relay-staging_NoemaRelayRoom`, bound as `NOEMA_ROOM`.
- Worker `APP_ORIGIN` is exactly `https://noema-contact-staging.vercel.app`; `OWNER_DEVICE_ID` is **empty**. The Worker rejects all message and auth requests with HTTP 503 *before* allocating Durable Object activity while not owner-bound. No invitation can be issued, and AI Reception remains off.
- The Vercel Preview environment variable `NEXT_PUBLIC_NOEMA_RELAY_URL` is scoped only to the messaging feature branch. Production is not connected to this Worker.
- A new deployment is needed after changing the Vercel preview environment variable; do not assume previously built Next.js `NEXT_PUBLIC_*` bundles will pick up a later change.

**Next owner action:** open the protected stable staging /connect URL in the browser that will own NOEMA, copy the displayed public **device identifier**, and supply it for `OWNER_DEVICE_ID` registration. Avoid clearing IndexedDB, switching origins or using private/incognito browsing afterward. The ID is not a secret or password. We will update the Worker to accept this exact owner device, keep AI Reception disabled, and test guest exchange under controlled access. Do not turn off Vercel Authentication or publicly expose guest invitation browsing without explicit security review.

# NOEMA encrypted contact bridge — staging

This branch replaces the older plaintext RADIX/NOEMA Cloudflare relay pilot. It is a **self-hosted Cloudflare Worker + SQLite Durable Object**, not deployed automatically. UI route: `/connect` for the owner and `/invite/[token]` for a guest. Existing `/invite/demo` remains inert.

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
