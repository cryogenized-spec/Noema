# NOEMA relay pilot

This is a small-scale, self-hosted Cloudflare Durable Object messenger relay. The deployer supplies their **own** Cloudflare account; do not use the author's worker or account for other people's data.

For development, install Wrangler and deploy the configuration in relay/wrangler.jsonc, after setting APP_ORIGIN to the exact web app HTTPS origin. Then set NEXT_PUBLIC_NOEMA_RELAY_URL on the web app to the resulting Worker HTTPS endpoint.

**Security model:** P-256 signed device challenges; 24-hour bearer sessions hashed in storage; single-use 24-hour invitation tokens, hashed at rest; explicit authenticated POST redemption (GET previews are inert); append-only messages with idempotent client IDs; per-conversation owner-controlled reception mode; one-time prebilling agent claims and 20 OpenAI calls/day per owner (fixed model-output cap and no tools).

**Reality check:** This is not audited, not E2EE, not automatically backed up, and not ready for broad public registration. Presence is polled, so the owner must have a browser tab open and the local API vault unlocked for automatic reception. API keys are sent from the unlocked browser only to the authenticated relay, and from there to OpenAI. There is no server-stored key. Real high-volume protection, per-IP reputation, device/key recovery, storage retention, proof revocation, and scale-out remain to be addressed.

The Worker is deliberately not deployed by CI. The repository includes protocol unit checks and manual two-device test instructions in the integration issue.
