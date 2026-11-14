# NOEMA — Obsidian theme and anonymous invitation contract

This change implements the first UI slice of [roadmap #22](https://github.com/cryogenized-spec/Noema/issues/22), without claiming backend features that do not yet exist.

## Visual specification

- Canvas: neutral black `#070707`, panels `#111113`, white system sans-serif font and thin off-white borders.
- Lime `#b9ff66`: primary actions, active state, online indication.
- Violet `#a78bfa`: AI/agent identity and secondary controls.
- Burgundy `#70243d`: discreet contextual/private surfaces, not alerts.
- Gold `#d9b16b`: rare highlights, important context.
- Primary shell: responsive left rail and workspace on desktop, single-column on mobile. Compact bottom navigation on all sizes for now. Support keyboard focus and reduced motion.
- This is an original aesthetic direction with high-contrast minimalist inspiration, not a clone of Vercel branding.

## Preview now available

Run `npm install && npm run dev`, then open `http://localhost:3000/invite/demo`. The home screen also exposes **Try invitation**.

The preview:
- allows an optional typed pseudonym;
- generates a random neutral persona on request or if a guest skips the field;
- opens the illustrative intended recipient's conversation surface;
- offers four editable suggested first messages;
- uses **Preview send** to display a local-only outgoing bubble with explicit non-delivery status;
- includes a copyable **demo link**, which is not an actual invitation credential.

It intentionally **does not** register an identity, send a WhatsApp message, connect to a remote contact, ping the recipient, call an AI model, issue invite tokens, or expose customer data. Nothing from the demo is saved to the production conversation DB.

## Production invitation protocol — design, not shipped

1. The invite owner authenticates to NOEMA by a device key (no required phone or email) and creates a random, high-entropy, scoped invitation. Persist only a hash of the bearer token. Invitation metadata includes inviter, intended thread, expiry, usage count, revocation state, policy and anti-abuse limits.
2. The URL is passed via WhatsApp or any messenger. No user data is embedded in URLs, tracking parameters or link previews. Link reads are safe to prefetch and **do not redeem tokens or ping**. Only a user-triggered `POST /invite/redeem` after landing/profile choice may redeem a token.
3. The guest client makes a device key, displays a generated or typed pseudonym (never their stable ID), and redeems atomically. Session is bound to key proof; token is not the session credential.
4. Recipient presence ping is a rate-limited, opt-in event after successful redemption, not a message and not sent on GET/link unfurl. Recipient can mute invites; audit the event.
5. The client opens that exact thread with suggested editable prompts and **Send** as a separate affirmative action. Queue and receipt semantics require idempotent message IDs, replay rejection, stored+delivered acknowledgements and offline reconciliation.
6. If the host has consented to assistant answering for that conversation, a **disclosed** agent may respond. Tool calls run through MCP with per-action permission scopes. Side-effecting operations require a human confirmation unless explicitly granted narrowly in advance; record visible action receipts. A guest has controls to decline AI or request a human. No model is triggered by viewing/redeeming an invite alone.
7. Clear expiring/revoked/exhausted invite errors. Cap guest requests by origin, device, token, host and reputation; block abuse; prefer proof-of-work/CAPTCHA only under risk. Guard identity recovery, invite leakage in referrers, mixed-content requests, malicious URLs and social engineering.
8. Design E2EE later with a standard audited implementation. It cannot transparently decrypt to a server-run AI. Agent participants are explicit endpoints, or user-controlled local execution; communicate privacy implications clearly.

## Acceptance gates

- One device can open the demo on mobile/desktop without any account details.
- Random persona button replaces the alias; alias has a maximum length and is safely rendered as plain React text.
- Selecting prompt updates an editable draft; `Preview send` never sends a network message.
- Production invite route must not be treated as functional before M2's integration tests.
- Two-device delivery (including offline retry/replay) required before public release.
