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

## Organizer Tasks (foundation)

- Added a canonical local-first **TaskRecord** model with:
  - status workflow: `inbox | todo | doing | done | archived`
  - priority: `low | normal | high | urgent`
  - markdown-native description (`descriptionMarkdown`)
  - due/completion/tags/folder/pin metadata
  - intake/source fields for manual/voice/AI/message/document conversion paths
- Added subtask-ready structure (`subtasks`) as a clean extension point without introducing dependency graphs yet.
- Persistence is now prepared via Dexie `tasks` table and Zustand `useTaskStore` for hydration + CRUD/status updates.
- Task markdown uses the same shared markdown storage contract as chat/documents (`TASK_MARKDOWN_CONTRACT` aliases the app markdown contract).
- Organizer now includes a functional mobile Tasks list with quick filters (`Today`, `Upcoming`, `All`, `Done`, `Archived`), metadata-rich rows, and a floating create-action button.
- Tasks FAB now opens a capture launcher with:
  - input method choice: **Type task** or **Speak task**
  - intake mode choice: **Guided form** or **Conversational**
  - persisted default-mode preference (`guided_form` by default) and optional “remember last used mode”
- Guided intake mode now runs an AI-assisted structuring step (runtime-backed with local heuristics fallback), then opens an editable structured draft (title, description, due, duration, priority, status, optional subtasks) before save/discard.
- Conversational intake mode now provides a compact task-focused Q&A flow that progressively resolves clarifications, shows draft summary, and can switch into manual structured edit before final save.
- Tasks now include a dedicated detail/edit screen with markdown description edit/preview, status/priority/due/duration controls, subtasks editor, tags, pin/archive controls, and debounced autosave.
- Tasks list now supports long-press action sheet + multi-select mode with bulk complete/archive/pin/delete actions for mobile workflows.
- Tasks now support a view switcher with **List** (default) and a compact **Board** view grouped by status (`Inbox`, `Todo`, `Doing`, `Done`; archived-focused lane when filtered to archived).
- Tasks now include reminder groundwork (`reminderEnabled`, `reminderAt`, `reminderState`, optional reminder note/attempt metadata) with editor controls and utility hooks for future in-app/local/push reminder integrations.
- Tasks remain **user-owned and markdown-friendly**: descriptions are markdown-native and editable in-place with preview.
- Intake modes are intentionally split:
  - **Guided form** for structured fields and edits
  - **Conversational** for compact Q&A clarification flow
- Calendar foundation now includes a canonical local-first event model (`CalendarEventRecord`), Dexie persistence + Zustand store, shared markdown contract reuse, and task-bridge-ready fields (`linkedTaskId`, `sourceType: task_projection`).
- Organizer Calendar now has a functional mobile home screen with date context, `Agenda | Day | Month` view selector (Agenda default), today jump, directional date navigation, empty states, and event-create FAB.
- Agenda now groups events by day with practical metadata chips (all-day, location, linked-task, reminder, color-tag), and Day now uses a compact time-aware timeline layout optimized for phones.
- Month view now uses a mobile-friendly grid with current-day and selected-day highlighting, subtle event density indicators, and a linked selected-day event panel below the grid.
- Deferred in this phase: full Calendar scheduling, always-on background reminder automation, and autonomous task agents.
- Deferred:
  - deeper project/task views beyond single-task edit surface
  - Calendar implementation
  - autonomous agent task workflows

## Voice-to-Text foundation (manual record → stop → transcribe)

- Added reusable manual recording/transcription button (`VoiceCaptureButton`) for input surfaces.
- Recording behavior is tap-on/tap-off with no automatic speech cutoff:
  - tap once to start recording
  - speak as long as needed
  - tap again to stop and transcribe
  - transcript is inserted into the invoking input field
- Added STT provider abstraction under `src/lib/stt` and server route `POST /api/stt/transcribe`.
- Providers in this phase:
  - `openai` (implemented)
  - `google_cloud` (adapter placeholder)
  - `android_native` (future-native placeholder)
- OpenAI STT models exposed exactly as:
  - `gpt-4o-mini-transcribe` (default)
  - `gpt-4o-transcribe`
- Added STT preferences in Settings:
  - provider selection
  - OpenAI transcription model
  - optional preferred language code
  - remember-last-provider toggle
- Deferred:
  - realtime streaming speech recognition
  - TTS / voice playback
  - Android native SpeechRecognizer runtime integration


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
