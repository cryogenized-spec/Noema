# NOEMA Identity & Device Management — design and staging implementation

**Status:** UI and local domain foundations implemented, *no Cloudflare account registry or real device pairing is activated*. This branch is stacked on `feature/noema-e2ee-contact-reception` / PR #42 and must remain a **draft**, not merged to production before independent approval.

## Distinguish the three identities

**Local Workshop profile:** `db.profiles.get("self")` is a single, browser-local profile. It contains the alias, handle, bio, banner/avatar, projects, skills and media. It is not a published account or a verified username. Other devices do not see it unless the owner explicitly exports/uploads it.

**Signed device:** `src/lib/security/device-identity.ts` creates a device-specific, non-extractable P-256 ECDSA private key in browser IndexedDB. Cloudflare verifies the public-key challenge/response and provides a short-lived bearer session. This proves control of **that** browser key only, not account ownership. The current private relay has a single `OWNER_DEVICE_ID` account-less allowlist and all other authenticated identities are guests.

**Future NOEMA account:** A server-registered, independent identity with a stable account ID, a handle registry, one or more explicitly approved devices, per-account inbox/routing/agent permissions, and recovery. The current code **does not create one**. `identityDrafts` (Dexie v13) holds only a local preference and suggested handle and MUST NOT be interpreted as registration.

## Implemented UI, safe while user authorisation is delayed

- `/identity` uses Account / Devices / Security tabs inside a single scrollable phone-sized pane.
- Account: select **Create my own account** vs **Join an existing account** as registration *intent*, save local display name/handle/device label in Dexie v13, or edit the private Workshop profile. No network write, handle reservation, automatic publishing, or account creation.
- Devices: show and copy the **public** current browser device fingerprint, show QR encoding `noema-device:<deviceId>` explicitly labelled as a locator **not** a pairing token, and optionally verify the existing signed staging role on direct user action. The verification can create a guest session but never account membership.
- Security: explain account ownership, approval, revocation and limits honestly. Account owner has not been copied from the current staging Worker to the phone.
- Existing mobile/desktop navigation and Workshop page link to Identity & Devices; no second sidebar or npm dependencies.

## Phase 1 server-side implementation (code only; not deployed)

The next layer is now implemented **behind two separate switches**:
- Cloudflare `ACCOUNT_REGISTRATION_ENABLED` must equal the literal string `"true"`. The Worker returns HTTP 503 for all `/v1/accounts` requests otherwise. Wrangler's checked-in example keeps it `"false"`. The deployed staging Worker has NOT been updated with account routes.
- The PWA exposes the network registration panel only if `NEXT_PUBLIC_NOEMA_ACCOUNTS_ENABLED === "true"` **and** the configured relay is available. This public environment variable is **not** set on Vercel staging. Its absence means no registration buttons, pairing secrets or account calls run.

**Implemented but inactive backend:** `relay/src/account-registry.mjs` handles signed-device account creation with server-issued opaque IDs, case-folded handle uniqueness, owner membership, and per-device membership discovery. Owners can issue one-use hashed pairing offers (5 minutes, capped at 6 per account/day); a second authenticated device can redeem the offer into a 10-minute pending request. Its six-digit out-of-band verification code is returned only to that candidate, not the owner's pending-request list. The owner gets a separate short-lived challenge (2 minutes), signs it with the existing non-extractable P-256 identity key, and must submit both the correct verification code and signature for atomic approval as **member**, never owner. The server checks the authenticated owner's active membership, registered public key, account ID, candidate device, challenge, time and one-time request state. Repeated approvals and unauthorized access are rejected. Owner revocation is reflected in account membership checks even when an old browser session token is still valid; it does **not** automatically erase copies of old ciphertext.

**Implemented but inactive frontend:** `src/lib/network/account-client.ts` exposes typed registration, account listing, pairing-offer, request, approval, device listing and revocation calls with explicit feature gating; `src/lib/identity/pairing-link.ts` keeps one-use offer secrets solely in the URL fragment (never query strings). `AccountEnrollmentPanel` supports these operations only when both flags are enabled. Pairing URLs are stripped from the browser address after import into page memory. The Account tab continues to save registration drafts locally when enrollment is off.

**Automated negative tests:** `relay/tests/account-registry.test.mjs` verifies default-off routes, strict handle rules, account separation, hashed offers, one-time redemption, candidate-exclusive code delivery, signed owner approval, replay rejection, role limitations and revocation on existing sessions. `tests/identity-pairing-link.test.mjs` validates HTTPS fragment-only capabilities and rejects insecure/malformed links.

**Production limitations:** This code is not an independently audited multi-user identity service. It uses the staging Durable Object storage abstraction for policy tests; full production deployment requires account-specific Durable Object routing, cross-instance unique handle reservation, challenge expiry/garbage collection, audit trails, rate limiting that cannot be bypassed by rotating device keys, secure backups, independent encryption key transfer, revocation key rotation, and a stable non-Vercel-authenticated user onboarding domain. Neither switch should be enabled before those are addressed and physical two-device acceptance tests are performed.

## Proposed server identity schema (not deployed)

```ts
type Account = {
  id: string; // opaque server-issued account ID, never a browser device ID
  handleCanonical: string; // reserved by server with case-folded uniqueness
  alias: string; createdAt: string;
  status: "active" | "suspended" | "recovering";
  recoveryPolicyVersion: number;
};
type Device = {
  id: string; publicJwk: JsonWebKey; createdAt: string; lastSeenAt: string;
};
type Membership = {
  accountId: string; deviceId: string; role: "owner" | "member";
  status: "pending" | "active" | "revoked"; approvedAt: string | null;
  approvedBy: string | null; revokedAt: string | null;
};
type PairingRequest = {
  accountId: string; candidateDeviceId: string; nonceHash: string;
  expiresAt: string; status: "pending" | "approved" | "rejected" | "expired";
  challengeSignature: string; // verified cryptographically, never a plain checkbox
};
```

## Pairing protocol (must happen server-side before button activation)

1. A signed new device makes a request to pair into an existing account. The relay issues a **short-lived single-use challenge** tied to exact account ID, device ID, public key, nonce, server origin and expiry; stores only hashed challenge identifiers. No arbitrary account ownership from QR contents.
2. The account owner signs in from an **already active owner device**, explicitly verifies the joining device's public fingerprint through an out-of-band comparison (QR plus readable short authentication code); sees the requested scope and grants only `member` permissions by default. The server verifies the owner's signed, fresh authorisation **and** joining device proof, atomically consumes the request and creates membership.
3. Server authorisation is checked on every account-scoped read/write (account ID + session device ID + active membership + permitted role); unapproved/pending/revoked devices receive denial. Never use client-declared `owner` as authority. Rate limit both sides and audit link/revoke events without logging content.
4. For E2EE multi-device, establish an authenticated encrypted recipient-key envelope per device. Existing per-thread single invitation secret must **not** be copied into a generic QR or synced unencrypted. Encryption keys need rotation on membership revocation and device loss. Avoid implying old ciphertext can be made unreadable retroactively.
5. Add safe backup/recovery before presenting account pairing as resilient: local key loss currently loses access; passkeys are authentication (not automatically an E2EE backup). An encrypted recovery key or explicitly verified second owner device must exist to avoid permanent lockout.
6. Each independent account receives its own routing namespace (account-scoped Durable Object / database partition and quotas). The existing single-worker `OWNER_DEVICE_ID` is an isolated **pilot** and must not be replaced with a simple list of owner IDs without data/routing segregation.
7. Registration needs anti-abuse, user controls (block/report/revoke/account deletion), consented profile publishing, device/session management, data export and retention. Cloudflare billing/rate caps apply **per account**, not per IP or one global owner.

## Automated policy invariants

`src/lib/identity/account-policy.ts` is a pure, testable domain layer with strict local input normalization and representative future membership guards. Tests reject cross-account access, pending/revoked members, forged owner claims, duplicate self-pairing, attempts by non-owner devices to approve pairing, and a pairing request granting `owner` by default. These helpers are for staging; they DO NOT replace enforcement in a deployed Worker.

## Acceptance gates before user enrolment

- The existing laptop stays the configured **staging owner** without migration, key reset, session invalidation or Cloudflare Worker changes.
- Browser-local identity draft persists after reload and does not modify Workshop profile or handle registry.
- Phone identity is distinct from laptop, and the optional relay status is `Guest` until owner-authorised membership.
- A signed pair request + signed approval is replay-proof and bound to the account/device/origin, survives reconnection and does not inherit owner/API/MCP permissions.
- Two independent accounts can communicate without one seeing the other's private contacts, agents, profile or crypto keys.
- Device revocation is enforced on old bearer sessions (not merely new logins), and key rotation and audit are tested.
- End-to-end messaging and recovery are validated on two physical devices and a 360×640 viewport before public release.

### Important limitations

This branch **does not** deploy a new account service or allow publicly accessible signup; it builds the user experience and policy foundation while owner device approval is deferred. Live Cloudflare staging remains owner-bound and consent-gated. Do not turn on registration or account sync through a feature flag alone.
