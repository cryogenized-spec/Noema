# Noema (Vertical Slice v1)

Noema is a calm, local-first communication and intelligence app for power users.

This repository contains the **first foundational vertical slice**: a mobile-first PWA shell with one functional tab (**Chat**) and clean extension points for future capabilities.

## What this slice does

- Next.js App Router + TypeScript + Tailwind architecture
- Mobile-first dark glassmorphism shell
- Top bar + bottom tab navigation
- Functional Chat tab
  - message list + composer
  - long-press context menu (Copy, Ask Agent, Translate placeholder)
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

## License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`). See [`LICENSE`](./LICENSE).
