# Noema

Noema is a calm, local-first, mobile-first communication and intelligence workspace for power users.

This repository contains the **first foundational vertical slice**: a production-lean launchpad proving UI direction, local persistence, and an extensible agent architecture.

## Stack

- Next.js (App Router) + TypeScript + React
- Tailwind CSS
- Zustand (client state)
- Dexie.js (IndexedDB persistence)
- react-markdown + rehype-highlight (markdown + code rendering)
- @iconify/react (icon system)

## Current scope (this first slice)

✅ Included now:
- Mobile-first glassmorphism app shell with tabs
- Functional Chat screen
- Local-first message persistence via IndexedDB (Dexie)
- Long-press message menu (Copy / Ask Agent / Translate placeholder)
- `/api/agent` route with provider adapter architecture
- Deterministic `mock` provider fallback (works with no API key)
- Markdown rendering with syntax-highlighted fenced code blocks + language label
- Basic installable PWA metadata + manifest + icons

🚫 Intentionally deferred:
- Auth and accounts
- Multi-user sync
- Media uploads
- OCR
- Real-time comms (WebRTC/P2P)
- Agent autonomy/tool execution
- Channel ingestion and organizer systems
- Server-side databases
- Advanced service-worker/offline caching strategies

## Project structure

```text
src/
  app/
    api/agent/route.ts
    globals.css
    layout.tsx
    manifest.ts
    page.tsx
  components/
    chat/
      chat-screen.tsx
      markdown-message.tsx
      message-bubble.tsx
      message-menu.tsx
    layout/
      app-shell.tsx
  lib/
    ai/providers.ts
    db/client.ts
  store/
    chat-store.ts
  types/
    message.ts
public/
  icons/
```

## Run locally

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Build for production

```bash
npm run build
npm start
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repository in Vercel.
3. Configure environment variables (optional for this slice):
   - `AGENT_PROVIDER` (`mock` by default)
   - `OPENAI_API_KEY` (only for future provider implementation)
4. Deploy.

## Environment variables

See `.env.example` for defaults and optional keys.

## License

Licensed under **GNU AGPLv3**. See [`LICENSE`](./LICENSE).
