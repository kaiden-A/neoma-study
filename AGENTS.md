# Neoma — repo rules for agents

Study OS: group projects (task boards), study groups (shared notes), personal
notes, one calendar. Built from `master-plan.md`; read it before changing the
core. `prototype/` is the frontend-only reference for behaviour and design —
read it, don't edit it (source of truth for the look).

## Commands

```bash
npm run start                 # installs client + server deps
npm run dev                   # both dev servers (api :8000, web :3000)
uv run --directory server pytest                    # live Neon, throwaway schema
uv run --directory server pytest tests/test_auth.py -q
uv run --directory server ruff check .
uv run --directory server ruff format .
uv run --directory server pyright
npm --prefix client run typecheck
npm --prefix client run lint
npm --prefix client run build
uv run --directory server alembic revision --autogenerate -m "..."
uv run --directory server alembic upgrade head
uv run --directory server python scripts/send_reminders.py --dry-run
uv run --directory server python scripts/smoke_session.py mint|clean   # dev session for curl checks
```

Server runs on Python 3.13 (`.python-version`, uv-managed). The Dockerfile
builds on 3.12; `uv.lock` is universal, so keep both working.

## Server invariants

- Sync SQLAlchemy 2 + pg8000 only. Never asyncpg/psycopg; never `SET search_path`.
- Every table is schema-qualified (`Base.metadata = MetaData(schema=settings.db_schema)`).
- Timestamps are tz-aware UTC in the DB; API payloads use integer milliseconds.
- snake_case columns, camelCase Pydantic fields (no alias generator).
- Errors are `{"error": "sentence"}`. Services raise `app/services/errors.py`
  exceptions (`NotFoundError`, `ForbiddenError`, …); `main.py` maps them. You do
  not need HTTPException in a service.
- Routers stay thin: validate shape, enforce ownership, call `app/services/*`,
  return a schema. No route handlers under `client/app/api/`.
- Ownership scoping: personal rows by `owner_id`; group rows by membership
  (`services/access.py:require_group`, 404 for non-members). Never trust an id
  from the payload.
- Alembic migrations are hand-reviewed; deploys never run them. Autogenerate
  always wants to churn schema-qualified FKs — ignore that, but drop the
  generated no-op directives by hand.
- `users.settings` is a JSONB bag validated by `schemas/settings.py` on every
  read/write; adding a preference does not need a migration.
- `app/templates/emails/*` (Jinja2) must stay inside `app/` so the Docker build
  bakes them into the venv.
- `server/.env` is never committed; `server/.env.example` documents every setting.

## Auth invariants

- Zitadel OIDC PKCE public client, code exchange server-side; no client secret.
- The verifier lives only in the signed, HttpOnly, 10-minute `app_oauth` cookie.
- Sessions are DB rows; the cookie carries a random token, the DB stores its sha256.
- `next` redirects always go through `app/utils.py:local_path()` — same-site only.
- Logout returns the Zitadel `end_session` URL; the client must navigate to it.
- Sign-in is branded **Elysiaa SSO**; the login page sends `login_hint` (and
  `prompt=create` from signup) to the hosted page.
- Invited people get a placeholder `users` row (`zitadel_sub IS NULL`); first
  sign-in adopts it by email so group memberships survive.
- Guests are not implemented (master-plan §7); do not half-build them.

## Client invariants

- Next.js 16 App Router. Read `client/AGENTS.md` and `node_modules/next/dist/docs/`
  before writing Next code — this version differs from training data.
- `proxy.ts` is the route guard (NOT `middleware.ts`); it only checks the session
  cookie exists. Real authorization is server-side.
- `/api/*` is always the FastAPI rewrite in `next.config.ts` (afterFiles).
- Session-bearing fetches go through `lib/api-client.ts` (`apiFetch`/`apiGet`/
  `apiPost`/…); 401 → `/login?next=`.
- `lib/store.tsx` is the single client store (the prototype's store, re-shaped):
  `GET /api/bootstrap` loads everything and actions patch local state. Add a
  slice + actions there rather than fetching in pages.
- `app/globals.css` is the prototype's design layer copied verbatim, plus Tailwind
  `@theme` tokens and next/font wiring. Keep the look identical to `prototype/`;
  port component classes rather than inventing new ones.
- React Compiler lint is on: no `Date.now()` in render (use `lib/useNow.ts`), no
  synchronous `setState` in effects (lazy initializers or event handlers).
- Uploads compress in the browser (`lib/files.ts`) and then POST to `/api/files`;
  previews use short-lived presigned URLs resolved per render. Three limits must
  stay ordered: client `MAX_FILE_BYTES` (15MB) ≤ server `MAX_UPLOAD_BYTES`
  (15MB) < `experimental.proxyClientMaxBodySize` in `next.config.ts` (20MB).
  Next buffers proxied bodies at 10MB by default and silently truncates larger
  ones, so lowering that buffer below the file cap corrupts uploads.

## Features and seams

- Groups: `services/group_services.py` (members, topics, links, invites).
  Invite emails go out through `services/email_services.py` (Resend).
- Tasks: `services/task_services.py`. Personal to-dos are `group_id IS NULL`.
- Notes/files: `services/note_services.py` + `services/storage_services.py` (R2).
  Files are personal (owner) or group-scoped (`files.group_id`): group files are
  readable by members, attachments are copied on share (`Storage.copy`) so each
  copy is independent, and deleting a note/group purges its blobs. Access rules
  live in `services/file_services.py`. Sharing copies text into a group note.
- Calendar: `services/event_services.py`; `.ics` + Google links in `ics_services.py`.
  Google Calendar sync lives in `services/google_services.py` (`google_accounts`,
  `events.google_event_id`, `tasks.google_event_id`/`google_account_id`): OAuth
  connect, best-effort invite-free push (no attendees, `sendUpdates=none`; tasks
  use `tasks.reminder_minutes`), incremental pull via `syncToken` that skips
  hand-added copies carrying a `Neoma id:` marker; driven by
  `scripts/sync_google.py` / `POST /api/maintenance/sync-google`. The client
  auto-syncs once a day (`?auto=true`); tokens are encrypted with a key derived
  from `APP_SECRET`, so rotating it forces reconnects. Assignments, due-date
  moves and group sessions notify by Neoma's own email (`.ics` attached +
  Add-to-Google button) instead of Google invitations — see
  `email_services.send_task_*` / `send_session_notice`.
- Notifications are derived, never stored: `services/notification_services.py`
  (keys like `overdue:{task}`, `due:{task}:{lead}`); only read/snooze state persists.
- Email: one digest per user per day (`reminder_services.send_reminders`,
  deduped via `email_log`), driven by the CLI or
  `POST /api/maintenance/send-reminders` with the `X-Cleanup-Secret` header.
- Data: `GET /api/export`, `POST /api/import`, `POST /api/demo` (sample semester),
  `DELETE /api/demo` (deletes everything the caller owns).
- MCP: `app/mcp_server.py` + `app/mcp_tools.py`, mounted last; `GET /mcp` is 405.
  Every tool result ends with a `Now: ...` line (TimeContextMiddleware in
  `mcp_server.py`, driven by `DEFAULT_TIMEZONE`; tzdata is a dependency) and
  `neoma.now` reports the clock on demand.

## Deploy notes

Cloud Run (`server/Dockerfile`, context `./server`, image
`kaiden122/elysiaa-neoma-server`) serves the API at
`https://neoma-api.web.app` and `/api/**` through the client host (Vercel).
Firebase Hosting (`firebase.json`, `.firebaserc`; project `elysiaa-api`, site
`neoma-api`) proxies `/api/**`, `/mcp`, `/docs`, `/docs/**`, `/redoc`,
`/openapi.json` and `/.well-known/**` to the `neoma` service in
`asia-southeast1`. `MCP_ALLOWED_HOSTS` must include every public hostname.

If the client is ever moved onto Firebase Hosting itself, the cookie caveat
applies: Hosting strips every cookie except `__session` on Cloud Run rewrites,
so production would need `SESSION_COOKIE_NAME=__session` and
`COOKIE_SECURE=true`. `docs/google-calendar.md` has the GCP walkthrough for
two-way sync.
