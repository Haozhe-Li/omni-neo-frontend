# Omni Knows Neo

Advanced AI-powered research agent with a beautiful, Perplexity-inspired interface.

## Features

- **Clean, Minimal Design**: Inspired by Perplexity's invisible design philosophy
- **Real-time Thinking Process**: Watch the AI agent think, search, and reason
- **Canvas Interface**: Immersive full-screen experience for research
- **Todo Tracking**: Visual progress tracking for research tasks
- **Source Citations**: Collapsible source references for all answers
- **SSE Streaming**: Real-time updates via Server-Sent Events

## Getting Started

### Quick Start (Mock Mode)

1. Install dependencies:
```bash
npm install
# or
pnpm install
```

2. Run the development server:
```bash
npm run dev
# or
pnpm dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

The app is pre-configured to use mock data for testing the interface. Try asking any question!

### Production Setup

To connect to your real backend:

1. Create `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local`:
```
BACKEND_URL=http://your-backend-url.com/chat
NEXT_PUBLIC_USE_MOCK=false
```

3. Restart the development server.

## Backend Integration

The app expects a backend endpoint at `/chat` that:
- Accepts POST requests with `{ "query": "user question" }`
- Returns SSE (Server-Sent Events) stream
- Follows the message format specified in the API documentation

## Design Philosophy

This application follows a "invisible design" approach inspired by Perplexity:
- Information-first interface
- Neutral color palette with paper-like background (#f3f3ee)
- Clean typography with generous spacing
- Smooth, subtle animations (200-300ms transitions)
- Focus on readability and content hierarchy

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Styling**: Tailwind CSS with custom design tokens
- **UI Components**: Shadcn/ui + Radix UI
- **Markdown**: react-markdown for answer rendering
- **Icons**: Lucide React

## Collector (training-data collection)

`/collect` is a password-protected tool for producing SFT candidates by hand: pick the
time, location, answer language and memory Omni is told about (each has a shuffle and a
lock), generate with the real agent over as many turns as you like, edit the answer in
the markdown editor, and submit it as a training example. It is not linked from the
product and is disallowed in `robots.ts`.

Server-side env:

```
COLLECTOR_PASSWORD=...           # shared login password
COLLECTOR_SESSION_SECRET=...     # >= 32 chars; changing it signs everyone out
COLLECTOR_API_KEY=...            # same value as the backend's; never sent to the browser
BACKEND_URL=https://...          # backend base URL (as for /api/chat)
UPSTASH_REDIS_REST_URL / _TOKEN  # login attempts are throttled per IP (8 per 15 min)
```

`proxy.ts` bounces any `/collect` or `/api/collect` request without a valid signed
session cookie; the API routes check it again. The browser only talks to `/api/collect/*`,
which forwards an allowlist of backend routes. Formats of the four fields live in
`lib/collector/fields.ts` and mirror production's; the backend rejects anything else. See
`doc/collector.md` in the backend repo for how the data is kept identical to production.
