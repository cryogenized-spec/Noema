# Noema (Vertical Slice v1)

Noema is a calm, local-first communication and intelligence app for power users.

This repository contains the **first foundational vertical slice**: a mobile-first PWA shell with one functional tab (**Chat**) and clean extension points for future capabilities.

## What this slice does

- Next.js App Router + TypeScript + Tailwind architecture
- Mobile-first dark glassmorphism shell
- Top bar + bottom tab navigation
- Functional Chat tab
  - message list + composer
  - long-press multi-select mode + bulk actions
  - bottom-sheet message actions (via message action button / desktop context menu)
  - markdown rendering with highlighted fenced code blocks
- Local-first persistence using Dexie (IndexedDB) + Zustand
- `/api/agent` route with provider adapter
  - deterministic `mock` provider by default
  - optional server-side OpenAI provider when configured
- Installable PWA baseline via `src/app/manifest.ts`

## Intentionally deferred (not in this slice)

- Auth and multi-user features
- Server-side database
- OCR/media upload pipeline
- Real translation implementation
- Advanced offline/service-worker strategy
- Scheduler/autonomous agent orchestration

## Project structure

```text
src/
  app/
    api/agent/route.ts      # server route for agent calls
    globals.css             # global styles/theme baseline
    layout.tsx              # metadata/icons/viewport
    manifest.ts             # App Router manifest
    page.tsx                # app shell + tab routing
  components/
    chat/
    layout/
    ui/
  lib/
    ai/
      providers/
    db/
  store/
  types/
public/
  icons/                    # PWA icons (SVG placeholders)
```

## Environment variables

See `.env.example`.

- `AGENT_PROVIDER` (`mock` or `openai`)  
  - **Recommended first deployment:** `mock`
- `OPENAI_API_KEY` (required only when `AGENT_PROVIDER=openai`)
- `OPENAI_MODEL` (optional model override)

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm run start
```

## Vercel deployment (standard Next.js)

This repository is deployable as a **standard Next.js project from repo root**.

Use these settings in Vercel:

- **Framework Preset:** Next.js
- **Root Directory:** `/` (repo root)
- **Build Command:** `next build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

Then set environment variables:

- `AGENT_PROVIDER=mock` (recommended for first deploy)
- optionally `OPENAI_API_KEY` and `OPENAI_MODEL` if/when you switch provider to OpenAI

## PWA / manifest notes

- Primary manifest source is `src/app/manifest.ts` (App Router idiomatic).
- PWA icons/static assets are in `public/icons`.
- This deployment-rescue pass intentionally uses **text-safe SVG assets** to avoid binary-file PR issues.


### 404 troubleshooting checklist (Vercel)

If `your-project.vercel.app` shows `404: NOT_FOUND`, verify in Vercel dashboard:

1. **Project -> Settings -> General -> Root Directory** is `/` (repo root).
2. **Project -> Settings -> Git -> Production Branch** matches your pushed branch (usually `main`).
3. The latest deployment was created from the correct repository and commit SHA.
4. Build logs show Next.js routes generated (for this app, `/`, `/api/agent`, `/manifest.webmanifest`).

This repo also includes `vercel.json` with `framework: "nextjs"` to remove framework detection ambiguity.


## API Lockbox (Settings subsystem)

Noema now includes an **API Lockbox** screen under **Settings** for BYOK provider management.

Included providers in this pass (with 5 representative models each):
- OpenAI
- Google Gemini
- Anthropic
- xAI
- DeepSeek
- Moonshot / Kimi
- Qwen
- Mistral

Details:
- model and pricing metadata is locally curated from official provider documentation links in `src/lib/providers/catalog.ts`
- pricing is read-only in UI and may be `N/A` where official docs vary by region/tier
- BYOK secrets are stored locally on-device in this phase via a lockbox abstraction (encryption hook prepared for later hardening)
- Gemini safety filters expose all four harm categories with default `BLOCK_NONE`, plus user-selectable filter level toggles


## Markdown foundation (Stage 1)

Noema now treats **raw markdown strings** as the canonical text format for displayable text surfaces.

- shared renderer: `src/components/markdown/markdown-renderer.tsx`
- canonical storage contract helpers: `src/lib/markdown/contract.ts`
- current syntax support: headings, emphasis, strikethrough, blockquotes, ordered/unordered/task lists, links, tables, inline code, fenced code blocks, and horizontal rules
- raw HTML rendering is disabled
- Obsidian-style `[[wikilink]]` and `![[embed]]` tokens are transformed to safe internal link tokens for forward compatibility


## Interaction model (stabilization pass)

- **Long-press** enters multi-select mode on chat messages.
- While multi-select is active:
  - tap messages to toggle selection
  - use the selection action bar for copy/delete/convert-to-note
- Message-specific action sheet is available from the message actions button (`...`) and desktop right-click, avoiding long-press gesture conflicts on mobile.

## Markdown + notes architecture

- Markdown is the canonical content format across chat and note conversion flows.
- Supported markdown in renderer includes headings, quotes, lists, links, tables, inline/fenced code, and horizontal rules.
- Note conversion utilities now produce canonical markdown notes with frontmatter prep (`title`, `created`, `updated`, `tags`) for Obsidian-friendly export preparation.
- Export is currently an architecture layer (planned files/paths in `Notes/` + `Assets/`), not a full vault filesystem writer yet.

## Deferred in current pass

- Real translation for single/bulk actions
- Full notes UI/editor and vault file writer
- Attachment binary export pipeline (only naming/embed conventions are prepared)

## Organizer Documents (stabilization pass)

- Documents are **markdown-native** and store source content as raw `bodyMarkdown`.
- Organizer currently contains:
  - **Documents** (functional list + editor + preview),
  - **Tasks** (placeholder),
  - **Calendar** (placeholder).
- Current document capabilities:
  - create/open/edit documents with debounced autosave
  - edit metadata (folder, tags, pin, archive)
  - filter by all/pinned/archived + optional folder chips
  - document long-press selection mode and bulk actions
  - attachment/link relationship groundwork
  - OCR/import/export groundwork placeholders and utilities
- Deferred:
  - full OCR capture pipeline
  - full export/import file picker + vault packaging flow
  - Tasks/Calendar implementation


## Agent Studio (Stage 8 foundation)

Noema now includes a functional **Agents** tab for local agent profile management.

- create, edit, duplicate, and delete agent profiles
- local persistence via Dexie/IndexedDB (`agents` table)
- structured agent schema (identity, typography, model binding, behavior, generation settings, metadata)
- provider/model selectors use the shared provider catalog
- lockbox configuration status is shown per provider (selectable even if not configured)
- generation controls are filtered to provider/model-supported settings
- curated self-hosted font set via `next/font/google`: Inter, Manrope, IBM Plex Sans, Space Grotesk, Merriweather, JetBrains Mono
- roleplay is structured (toggle + 0-5 intensity) and prompt composition uses reusable utilities
- live preview uses deterministic local template output (no live API call)

Deferred in this stage:
- autonomous behavior/scheduling/tool execution
- agent-to-agent orchestration
- marketplace/public publishing
- memory retrieval engine


### Lockbox ↔ Agent Studio integration

- Agent Studio provider/model selectors read directly from the shared provider catalog (single source of truth).
- Provider options display configured/not-configured state from Lockbox records.
- Unconfigured providers are still selectable for profile design, but editor warns runtime calls are unavailable until configured.
- Generation controls are filtered to provider/model-supported settings and incompatible values are sanitized when provider/model changes.


## Agent Runtime Core (Stage 9 foundation)

- `src/lib/runtime/types.ts` introduces typed runtime contracts for invocation modes, streaming modes, execution requests/results, provider payloads, and structured error codes.
- `src/lib/runtime/prompt-pipeline.ts` composes final runtime system prompts from structured agent fields + invocation mode policy.
- `src/lib/runtime/payload-builder.ts` builds provider-ready payloads from agent profile + provider/model metadata + lockbox status + conversation context and validates compatibility.
- `src/lib/runtime/execute-agent.ts` executes provider payloads through provider adapters and returns structured results.
- `src/lib/runtime/agent-runtime-core.ts` provides an end-to-end build+execute entrypoint for future chat/runtime integration.

Current deferments:
- full streaming transport plumbing in chat UI
- complete UI wiring for every invocation mode
- autonomous/scheduled/background agent execution


## Direct agent messaging (Stage 10)

- Chat composer can select/clear an active agent per thread (stored locally for the default thread).
- Sending a message with an active agent builds runtime payloads from agent profile + provider/model metadata + lockbox config.
- Agent responses are inserted as styled agent messages with agent identity metadata (avatar shape/image, font, accent, provider/model info).
- Streaming behavior currently supports one-shot and simulated chunked/stream display while preserving runtime streaming mode contracts.
- If provider is not configured (or adapter is unavailable), chat inserts clear system status messages instead of failing silently.


## Long-press agent invocation (Stage 11)

- Message long-press sheet includes an **Agent** action group: ask selected agent, ask different agent, summarize (private), rewrite, explain, and convert to note.
- Invocation actions pass selected message content into Agent Runtime Core payload building with invocation mode metadata.
- Output visibility now distinguishes `public` vs `ghost` (private) result metadata; private results are visually tagged in-thread.
- If no active agent exists, long-press invocation can prompt user to pick an agent and continue the action.

## License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`). See [`LICENSE`](./LICENSE).
