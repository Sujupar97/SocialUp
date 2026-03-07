# SocialUp (ContentHub) - Project Rules

## Objective

SocialUp is a massive content distribution platform. One video gets published simultaneously across 150 accounts: 50 TikTok + 50 Instagram + 50 YouTube Shorts. Each account has unique AI-generated descriptions. The goal is statistical virality through volume.

**Current phase:** TikTok only (1 account → 50).

## Architecture

```
Frontend (React/Vite/TS) ─── Netlify (socialfullup.netlify.app)
     │
     ├── Supabase (PostgreSQL + Storage + Auth + Edge Functions)
     │     └── Edge Functions: tiktok-auth, tiktok-refresh
     │
     ├── N8N Workflows (webhooks for orchestration)
     │
     └── Automation Server (Express + Playwright + FFmpeg)
           ├── TikTok API Publisher (Content Posting API v2)
           ├── Video Processor (FFmpeg duplication)
           ├── Description Generator (Gemini AI)
           ├── Warmup Agent (Playwright + stealth)
           └── Cloud Browser Server (WebSocket + Puppeteer CDP)
```

## Tech Stack

- **Frontend:** React 19, Vite 7, TypeScript 5.9, React Router 7, Framer Motion
- **Backend:** Supabase (PostgreSQL), Edge Functions (Deno)
- **Automation:** Playwright + stealth plugin, Puppeteer, FFmpeg
- **AI:** Google Gemini API (description + comment generation)
- **Workflows:** N8N (webhook-based orchestration)
- **Deployment:** Netlify (frontend), VPS (automation server), Supabase Cloud (DB)

## Directory Structure

```
contenthub/
├── src/                        # React frontend
│   ├── pages/                  # Route pages (Dashboard, Accounts, Upload, Distribution, Analytics)
│   ├── components/             # Reusable UI components
│   │   ├── layout/             # Layout shell (sidebar nav)
│   │   ├── accounts/           # ConnectionWizard, CloudBrowser
│   │   └── ui/                 # Button, Card
│   ├── services/               # API/DB service layer
│   │   ├── supabase.ts         # Supabase client init
│   │   ├── accounts.ts         # Account CRUD
│   │   ├── content.ts          # Video & copy management
│   │   ├── analytics.ts        # Dashboard stats queries
│   │   ├── automation.ts       # Distribution orchestration
│   │   ├── n8n.ts              # N8N webhook triggers
│   │   └── tiktokAuth.ts       # TikTok OAuth 2.0 + PKCE
│   ├── types/                  # TypeScript interfaces
│   ├── utils/                  # Constants, helpers
│   └── styles/                 # CSS variables, animations
├── scripts/                    # Backend automation (Node.js)
│   ├── tiktok-api-publisher.ts # TikTok Content Posting API v2
│   ├── tiktok-publisher.ts     # Legacy browser automation (deprecated)
│   ├── video-processor.ts      # FFmpeg video duplication
│   ├── description-generator.ts# Gemini AI descriptions
│   ├── orchestrator.ts         # Main distribution pipeline
│   ├── browser-server.ts       # WebSocket cloud browser
│   ├── warmup-agent.ts         # Account interaction bot
│   ├── warmup-scheduler.ts     # Cron for warmup sessions
│   ├── job-queue.ts            # p-queue for parallel publishing
│   ├── server.ts               # Express API server
│   └── config.ts               # Environment config (NO hardcoded creds)
├── supabase/
│   ├── migrations/             # SQL migrations (sequential)
│   └── functions/              # Edge Functions (Deno)
│       ├── tiktok-auth/        # OAuth token exchange
│       └── tiktok-refresh/     # Token refresh
├── .env                        # Environment variables (never commit secrets)
└── package.json
```

## Database Schema (Supabase PostgreSQL)

**Core tables:**
- `accounts` — TikTok/Instagram accounts with OAuth tokens, proxy config, user_id (multi-tenant)
- `videos` — Original uploaded videos with description template and CTA config
- `video_copies` — One per video×account. Status: pending → publishing → published/failed
- `analytics` — Performance metrics per copy (views, likes, comments, shares)
- `auto_comments` — First comments posted automatically
- `keyword_responses` — Auto-replies to keyword triggers
- `video_processing_jobs` — Batch job tracking
- `warmup_sessions` — Account interaction session logs

**Views:** `dashboard_stats`, `account_stats`

## Environment Variables

All configuration via environment variables. Never hardcode URLs, keys, or credentials.

```
# Supabase
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# TikTok (client key goes in env, secret in Edge Function secrets only)
VITE_TIKTOK_CLIENT_KEY=

# Gemini AI
VITE_GEMINI_API_KEY=

# N8N Webhooks (production URLs)
VITE_N8N_WEBHOOK_BASE=
VITE_N8N_GENERATE_DESCRIPTIONS=
VITE_N8N_UPDATE_STATUS=
VITE_N8N_SAVE_COMMENT=
VITE_N8N_PROCESS_VIDEO=
VITE_N8N_PUBLISH_TIKTOK=

# Automation Server
VITE_AUTOMATION_SERVER=
VITE_BROWSER_SERVER_WS=
```

## Development Rules

1. **No test data.** Never use seed data, mock accounts, fake credentials, or placeholder responses. All data comes from Supabase or real API calls.
2. **No hardcoded URLs.** All service URLs (N8N, automation server, WebSocket) must read from environment variables. No `localhost:*` in source code.
3. **No exposed credentials.** API keys, passwords, tokens, and secrets must never appear in source code. Use .env files and Supabase Edge Function secrets.
4. **TypeScript strict.** All code must be typed. Use interfaces from `src/types/`.
5. **Environment-aware constants.** `src/utils/constants.ts` reads from `import.meta.env.VITE_*`. Scripts read from `process.env.*`.
6. **Supabase as single source of truth.** Accounts, videos, copies, jobs, analytics — all in Supabase. No local state for persistent data.
7. **TikTok Content Posting API v2** is the primary publishing method. Browser automation (Playwright) is only for warmup/interaction, not publishing.
8. **Each account = 1 static residential proxy IP.** Proxy config stored per account in DB.
9. **Spanish language.** UI and generated content in Spanish. Code comments in English or Spanish are both acceptable.
10. **Existing patterns first.** Before creating new utilities, check if `src/services/`, `src/utils/`, or `scripts/` already has what you need.

## Key Limits

- MAX_ACCOUNTS = 50 (per platform)
- Publishing concurrency = 3-5 simultaneous
- Warmup sessions = 3 per day per account
- Description max = 2200 characters (TikTok limit)
- Video max size = 500MB
- Inter-publish delay = 30-60 seconds (randomized)
