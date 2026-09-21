# Neoma — repo rules for agents

Study OS: group projects (task boards), study groups (shared notes), personal
notes, one calendar. This repo is built from `master-plan.md`; read it before
changing the core. `prototype/` is the frontend-only reference for behaviour
and design — read it, don't edit it (source of truth for the look).

## Commands

```bash
npm run start                 # installs client + server deps
npm run dev                   # both dev servers (api :8000, web :3000)
uv run --directory server pytest               # tests (live Neon, throwaway schema)
uv run --directory server pytest tests/test_auth.py -q
uv run --directory server ruff check .
uv run --directory server ruff format .
uv run --directory server pyright
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
uv run --directory server alembic revision --autogenerate -m "..."
uv run --directory server alembic upgrade head
```

Server runs on Python 3.13 (`.python-version`, uv-managed). The Dockerfile
builds on 3.12; `uv.lock` is universal, so keep both working.

## Server invariants

- Sync SQLAlchemy 2 + pg8000 only. Never asyncpg/psycopg; never `SET search_path`.
- Every table is schema-qualified (`Base.metadata = MetaData(schema=settings.db_schema)`).
- Timestamps are tz-aware UTC in the DB; API payloads use integer milliseconds.
- snake_case columns, camelCase Pydantic fields (no alias generator).
- Errors are `{"error": "sentence"}`; 422 adds `details`. The client reads `.error`.
- Routers stay thin: validate shape, enforce ownership (`WHERE owner_id = user.id`),
  call `app/services/*`, return a schema. No route handlers under `client/app/api/`.
- Alembic migrations are hand-reviewed; deploys never run them.
- `server/.env` is never committed; `server/.env.example` documents every setting.

## Auth invariants

- Zitadel OIDC PKCE public client, code exchange server-side; no client secret.
- The verifier lives only in the signed, HttpOnly, 10-minute `app_oauth` cookie payload.
- Sessions are DB rows; the cookie carries a random token, the DB stores its sha256.
- `next` redirects always go through `app/utils.py:local_path()` — same-site only.
- Logout must return the Zitadel `end_session` URL and the client must navigate to it.
- Sign-in is branded **Elysiaa SSO** in UI copy (the issuer is `elysiaa-*.zitadel.cloud`).
- Guests are not implemented yet (master-plan §7); do not half-build them.

## Client invariants

- Next.js 16 App Router. Read `client/AGENTS.md` and `node_modules/next/dist/docs/`
  before writing Next code — this version differs from training data.
- `proxy.ts` is the route guard (NOT `middleware.ts`); it only checks the session
  cookie exists. Real authorization is server-side.
- `/api/*` is always the FastAPI rewrite in `next.config.ts` (afterFiles).
- Session-bearing fetches go through `lib/api-client.ts:apiFetch` (401 → /login?next=).
- `app/globals.css` is the prototype's design layer copied verbatim, plus Tailwind
  `@theme` tokens and next/font wiring. Keep the look identical to `prototype/`;
  port component classes rather than inventing new ones. Markers: amber, mint,
  sky, coral, violet, pink. Signature elements: the moon-phase deadline dial and
  the highlighter strike.
- Icons are Font Awesome 6.7.2 via CDN in the root layout; fonts are Fraunces +
  IBM Plex Sans/Mono self-hosted by next/font.

## Deploy notes (not wired yet)

Cloud Run (`server/Dockerfile`, context `./server`) + Firebase Hosting rewrites
for `/api/**`, `/mcp`, `/docs`, `/.well-known/**`. Production must set
`SESSION_COOKIE_NAME=__session` (Firebase strips other cookies) and
`COOKIE_SECURE=true`. `MCP_ALLOWED_HOSTS` must include the public hostname.
