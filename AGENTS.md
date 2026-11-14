# NOEMA engineering and review rules

NOEMA is a local-first, phone-number-free messaging and opt-in AI platform. The user prefers technical review and CI-led merge decisions; do not ask the user to judge code.

## Code Review Rules

### Identity, BYOK, and monetary authorization
Flag any path where a public, unauthenticated request can spend a provider API key, where a user's BYOK key leaks to an untrusted endpoint/log, or where a display alias is treated as verified identity. Changes to device identity, encrypted credentials, and invite redemption must fail closed and have negative tests. A development-only proxy feature flag is NOT production authentication.

### Messaging semantics and consent
Opening or previewing an invitation must not redeem it, notify a recipient, send a message, or call a model. Incoming messages can wake an agent only when the recipient enables Agent Reception, with cost caps, visible AI disclosure, and tool permissions. Review for replay, cross-thread access, broken recovery, delivery duplication, and race conditions.

### Context, token, and tool-call budgets
No tool response may inject an entire repository/folder into model context. Prefer metadata-first queries, bounded snippets, limited retries for misspelled file names, per-turn max tool calls and cumulative token/cost caps. Never silently fall back from a failed live OpenAI provider to mock output. Verify Responses API SSE event handling and cancellation.

### Release decision
Treat clean typecheck/lint/build as necessary but insufficient. Prioritize real security vulnerabilities, hidden billable calls, secret exposure, irrecoverable user data loss, and misleading claims of production readiness. Request changes on these even if CI passes.
