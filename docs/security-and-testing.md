# NOEMA hardening: development security contract

## Release gate
NOEMA is **not yet a production messenger**. Anonymous invite delivery, identity proof, receipt queue, consented reception mode and audited E2EE require a separate authenticated transport. Never equate the local `/invite/demo` preview with a delivered message.

This branch locks down the existing development backend, without adding a new server-owned paid OpenAI account.

## Browser vault
On first use, provide a unique passphrase (at least 12 characters). PBKDF2-HMAC-SHA-256 (310,000 rounds; 128-bit random salt) derives a non-extractable AES-256-GCM key. Each saved API secret gets its own 96-bit random nonce; ciphertext plus encrypted vault verifier are in localStorage. The derived CryptoKey is memory-only and is discarded by **Lock now** and page reload. Legacy v1 plaintext records are migrated after successful unlock and the insecure record is then deleted. If migration fails, it is not silently discarded.

The vault protects secrets **at rest only**. It cannot resist XSS, malware or compromised same-origin scripts/browser extensions. The passphrase is not backed up, and losing it means re-entering API keys. Do not export keys in logs, URLs or analytics.

## Responses API
OpenAI is the sole supported live agent adapter in this milestone. Real Responses SSE events supply text deltas; REST output extraction reads actual `output[].content[]` items. `store:false`, output caps, strict endpoint allowlisting, bounded history and abort-on-disconnect for streams are enforced. There is no silent fallback to mock. The mock adapter must be explicitly chosen in a development environment; the public API proxy rejects it.

No MCP tools are active in this branch. The budget helpers cap retained history and define per-tool caps for the upcoming authorization-aware dispatcher, but **no working Google Drive/MCP retrieval is claimed**. Before enabling tools, enforce: metadata-first discovery, bounded search results and excerpts, maximum six tool calls, 18k total tool-result characters, and stop after two unsuccessful fuzzy lookups. Do not bulk-import a Drive folder tree into the model.

## Gateway controls
Both `/api/agent` and `/api/stt/transcribe` are **disabled** unless `NOEMA_ENABLE_BYOK_AGENT_PROXY=true` is explicitly set. Use this only on a trusted local developer instance, never on a public deployment: this switch is not authentication. No server environment OpenAI key may be spent. Clients must unlock the vault and explicitly present their BYOK credential to the same-origin development gateway, which accepts only official OpenAI endpoints.

Any public messaging/AI receptionist requires real device authentication, abuse-rate limits, per-host budgets, consent, opt-in reception, a visible OFF/ON/PAUSED header toggle and auditable tool grants. A guest link open never triggers AI charges.

## Local checks
Run `npm ci`, `npm run typecheck`, `npm run typecheck:hardening`, `npm run lint`, `npm run security:gates`, `npm run test:unit`, `npm run build`, and `npm audit --omit=dev --audit-level=high`. No live OpenAI charges are incurred by CI. For manual testing only, enable the gateway locally, configure the vault and select an OpenAI model; verify a streamed response, an intentionally wrong key, a wrong vault passphrase, locked-mode errors and an interrupted stream. Never put a real key in repository fixtures.

## Phone-free device identity foundation

Device identity is generated from an unextractable P-256 private key kept in browser IndexedDB via structured cloning. Display aliases are independent from its public-key fingerprint. Browser code can produce signed audience-scoped challenges; this alone is NOT authenticated messaging. The server must still issue random short-lived nonce challenges, enforce single-use replay protection, verify device signatures and identity fingerprints, implement recovery/revocation, and bind every action to a permitted conversation before any real invite is enabled.
