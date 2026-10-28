# Neoma — repo rules for agents

Study OS: group projects (task boards), study groups (shared notes), personal
notes, one calendar. Built from `master-plan.md`; read it before changing the
core. `todo.md` tracks the agreed roadmap and shipped work. The UI's design
language is `app/globals.css` (tokens + `nm-*` component classes) — reuse it
rather than inventing patterns; the notes home (folder grid,
`components/notes/VaultHome.tsx`) is an intentional evolution past it.

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

UI phases get a real-browser check; `todo.md` §7 documents the headless-Chrome
harness (spare ports, `smoke_session`, `POST /api/demo`). Never kill a dev
server you did not start.

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
- `lib/store.tsx` is the single client store: `GET /api/bootstrap` loads
  everything and actions patch local state. Add a slice + actions there rather
  than fetching in pages.
- `app/globals.css` carries the design layer (tokens + `nm-*` component classes)
  plus Tailwind `@theme` tokens and next/font wiring. Reuse those classes rather
  than inventing new ones; the notes home's folder grid is the intentional
  exception.
- React Compiler lint is on: no `Date.now()` in render (use `lib/useNow.ts`), no
  synchronous `setState` in effects (lazy initializers or event handlers).
- Store mutations are optimistic: `updateTask`/`deleteTask`/`postponeTask` and
  the note/event/notification patches apply locally first, roll back and toast
  on failure (`beginMutation`/`finishMutation` in `lib/store.tsx`). Keep new
  mutations on that path; `create*` stays server-first (ids come from the API).
- Uploads compress in the browser (`lib/files.ts`) and then PUT straight to R2
  with a presigned URL from `POST /api/files/presign`; `POST /api/files/{id}/confirm`
  checks the object landed and records its real size. The API never sees the
  bytes, so the Vercel 4.5MB body cap does not apply. The R2 bucket needs a CORS
  rule allowing `PUT` from the app origins **and `GET`/`HEAD`** — pdf.js and the
  previews fetch presigned GETs from the browser, so a GET-less rule breaks the
  PDF reader with a bare CORS console error. The legacy multipart `POST /api/files`
  still exists for tests; its three limits must stay ordered: client
  `MAX_FILE_BYTES` (15MB) ≤ server `MAX_UPLOAD_BYTES` (15MB) <
  `experimental.proxyClientMaxBodySize` in `next.config.ts` (20MB).
  Previews use short-lived presigned GETs resolved per render.
- `RichTextEditor.tsx` supports inline pictures (drag/drop, paste, `/image`)
  through an `uploadImage` prop that `NoteEditor` wires to `compressImage` +
  `store.uploadFile` (group-scoped in group notes). Gotcha: with
  `immediatelyRender: false` the editor is created after mount and extension
  options freeze first — extension callbacks must receive the live editor
  (the slash image picker does) instead of capturing the component's binding.
- Previews: `lib/links.ts` recognises YouTube/Vimeo URLs and `LinkPreview.tsx`
  owns link rendering (click-to-play facade; the provider is only contacted on
  play; respects the `linkEmbeds` setting). `FilePreview.tsx` picks the pane:
  `PdfViewer.tsx` (pdfjs-dist, the one client dependency, lazy + module worker)
  for PDFs, the Office web viewer for decks/docs (`officePreview` setting),
  `GET /api/files/{id}/text` for text, images inline, otherwise a card.
- Study state lives in `notes.study` (JSONB, validated by
  `schemas.notes.NoteStudy`): reader position, PDF highlight rects and video
  resume marks. `PdfViewer` reports position and runs the selection→highlight
  flow; the note page renders marks/excerpts and the flashcard card. Focus view
  (material | split | write) is `lib/studyView.ts` + `.nm-study*` CSS.
- The vault is folder-first: `/vault` is a home of folder tiles + a capped
  "Suggested" list (no inner sidebar); `?subject=<id>` and `?subject=unsorted`
  open a folder, `?view=all` is the flat list, and the folder breadcrumb doubles
  as the switcher. Home search is global, folder search stays scoped. Personal
  notes say "folder"; group panels keep saying "subject".
- Vault search is local for titles/body/tags; "Search inside files" asks the
  server (`store.searchNotes` → `GET /api/notes?q=`) so hits inside extracted
  file text (with "found in file · page N" snippets) and in group notes appear.

## Features and seams

- Groups: `services/group_services.py` (members, topics, links, invites).
  Invite emails go out through `services/email_services.py` (Resend).
- Tasks: `services/task_services.py`. Personal to-dos are `group_id IS NULL`.
- Notes/files: `services/note_services.py` + `services/storage_services.py` (R2).
  Files are personal (owner) or group-scoped (`files.group_id`): group files are
  readable by members, attachments are copied on share (`Storage.copy`) so each
  copy is independent, and deleting a note/group purges its blobs. Access rules
  live in `services/file_services.py`. Sharing copies text into a group note.
  Object keys carry a sanitized extension (`file_services.file_key`) so the
  Office viewer can detect the type; `scripts/migrate_file_keys.py` backfills
  old keys. `import_account`/`clear_demo` purge blobs before their rows;
  `purge_orphan_files` (via `POST /api/maintenance/cleanup`) sweeps reserved rows
  that never became a note; `scripts/reconcile_files.py` reconciles R2 against
  the `files` table. Inline note images live in the body as
  `![alt](/api/files/<id>/raw)`; that path 307s to a fresh presigned GET (a
  body must never store a presigned URL). Public shares rewrite it to
  `/api/shares/{token}/files/{id}/raw` for ids the shared note embeds. Bodies
  are the only reference store: `file_services.body_file_ids` /
  `referenced_file_ids` feed `purge_orphan_files`, deleting a note purges inline
  files nothing else embeds, and `share_to_group` copies each blob to the group
  and rewrites the ids. `Storage.delete` is best-effort but logs failures - a
  rejected delete would otherwise leave the blob in R2 with no recovery path.
- File text: `services/extract_services.py` extracts on upload (pypdf /
  python-docx / python-pptx / plain; ≤5MB, never fails the upload) into
  `files.extracted_text` with `--- page N ---` markers; `GET /api/files/{id}/text`
  serves the first 256KB; `GET /api/notes?q=` searches it (SQL ILIKE across
  title/body/url/tags + file text) and returns a `matchSnippet`. Backfill with
  `scripts/reindex_text.py`.
- Links: `services/link_services.py` + `POST /api/links/preview` — a host
  allowlist calls the provider's public oEmbed with the URL only as a parameter
  (never fetched), 3s timeout, nulls on any failure. The client caches nothing;
  `AddItemModal` uses it to name video links.
- Study: `notes.study` JSONB holds position/highlights/video marks.
  `services/flashcard_services.py` + `services/srs.py` (SM-2: Again/Hard/Good/Easy
  update ease/interval; failed cards return in 10 minutes) drive `/review` and the
  nav badge; `services/study_services.py` derives the dashboard, weekly minutes,
  streak and "Continue studying" (`/api/study/*`, included in bootstrap). The
  derived `review_due:{user}` notification feeds the digest too.
- Settings: `linkEmbeds`/`officePreview` (and notification `kinds.review`) are in
  the `users.settings` JSONB bag — validated in `schemas/settings.py`, no migration.
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
- iTa'leem (IIUM Moodle): `services/moodle_services.py` mirrors the user's own
  courses, assignment/quiz deadlines and a lazily cached outline. The mobile
  web-service token is obtained by pasting a `neoma://token=...` link from
  `admin/tool/mobile/launch.php`; it lives encrypted in `moodle_accounts`
  (`services/crypto.py`, purpose `moodle`) and never reaches the client.
  Imported tasks use `tasks.external_uid` (`assign:`/`italeem-event:`) and
  `tasks.course_id`; editing or deleting detaches the row and records the UID in
  `moodle_accounts.ignored_uids` so a sync cannot resurrect it. Course files are
  copied into R2/vault on demand (`POST /api/moodle/courses/{id}/save`), then the
  normal note/extraction/search/viewer path applies. `mcp_italeem.py` adds the
  `italeem_*` MCP tools. Read-only: never submit, post or message.
- Notifications are derived, never stored: `services/notification_services.py`
  (keys like `overdue:{task}`, `due:{task}:{lead}`); only read/snooze state persists.
- Email: one digest per user per day (`reminder_services.send_reminders`,
  deduped via `email_log`), driven by the CLI or
  `POST /api/maintenance/send-reminders` with the `X-Cleanup-Secret` header.
- Data: `GET /api/export`, `POST /api/import`, `POST /api/demo` (sample semester),
  `DELETE /api/demo` (deletes everything the caller owns).
- MCP: `app/mcp_server.py` + `app/mcp_tools.py` + `app/mcp_italeem.py`, mounted
  last; `GET /mcp` is 405.
  Every tool result ends with a `Now: ...` line (TimeContextMiddleware in
  `mcp_server.py`, driven by `DEFAULT_TIMEZONE`; tzdata is a dependency) and
  `neoma.now` reports the clock on demand. Flashcard tools: `list_due_cards`,
  `create_card`, `grade_card`; iTa'leem tools: `italeem_*`.

## Deploy notes

Cloud Run (`server/Dockerfile`, context `./server`, image
`kaiden122/elysiaa-neoma-server`) serves the API at
`https://neoma-api.web.app` and `/api/**` through the client host (Vercel).
Firebase Hosting (`firebase.json`, `.firebaserc`; project `elysiaa-api`, site
`neoma-api`) proxies `/api/**`, `/mcp`, `/docs`, `/docs/**`, `/redoc`,
`/openapi.json` and `/.well-known/**` to the `neoma` service in
`asia-southeast1`. `MCP_ALLOWED_HOSTS` must include every public hostname.
`client/vercel.json` pins the Vercel functions to `sin1` (Singapore, next to
Neon and Cloud Run); without it they default to `iad1` and every API call
crosses the Pacific twice.

If the client is ever moved onto Firebase Hosting itself, the cookie caveat
applies: Hosting strips every cookie except `__session` on Cloud Run rewrites,
so production would need `SESSION_COOKIE_NAME=__session` and
`COOKIE_SECURE=true`. `docs/google-calendar.md` has the GCP walkthrough for
two-way sync.
