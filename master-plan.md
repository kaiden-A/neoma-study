# master-plan.md — Bootstrap blueprint: Zitadel + FastAPI + Next.js + Neon + MCP

This file is written for a coding agent starting a **new application** that must
have the same working core as `solace-garden`. Feed it to the agent before the
first line of code is written. The reference implementation lives in this repo:
`server/` (FastAPI), `client/` (Next.js 16), `docs/` (deep-dives on MCP and
guests), `AGENTS.md` (per-repo operating rules).

The core this document reproduces:

- **Identity**: Zitadel OIDC (PKCE public client, server-side code exchange),
  server-side sessions in Postgres, HttpOnly cookie.
- **Persistence**: Neon Postgres through SQLAlchemy 2 (sync) + pg8000, explicit
  schema, Alembic migrations.
- **Client**: Next.js 16 App Router that never owns an API; `/api/*` is proxied
  to FastAPI by a rewrite, and a `proxy.ts` guard bounces anonymous users to
  `/login`.
- **MCP**: a streamable-HTTP Model Context Protocol server at `/mcp` on the
  same FastAPI app, stateless, JSON, bearer-authenticated, exposing services as
  tools.

App-specific things (this repo's plants/gifts/music, or your email/object
storage/whatever) are **extensions**. They plug into fixed seams; they never
change the core.

---

## 0. How the agent must use this document

### 0.1 Read first, build in order

1. Read this whole file once before writing code.
2. Collect the facts in §0.2 from the user. Do not invent them.
3. Build §3's phases **in order**. Each phase ends with a verification step;
   do not start the next phase until the current one passes.
4. Keep every rule in §4. If a requirement seems to conflict with an
   invariant, stop and ask the user instead of breaking the invariant.
5. App-specific features are built with the §6 playbook, after phase 6.

### 0.2 Facts to collect from the user before phase 1

| Fact | Used for |
| --- | --- |
| App name and one-line purpose | package names, FastAPI title, MCP server name, UI copy |
| Production domain (client + API) | `API_BASE_URL`, `PUBLIC_BASE_URL`, `MCP_ALLOWED_HOSTS`, Zitadel URIs |
| Zitadel instance URL (`https://<instance>.zitadel.cloud`) | `ZITADEL_ISSUER`, JWKS |
| Zitadel OIDC application `client_id` (PKCE public client, no secret) | token exchange + `aud` |
| Redirect URI and post-logout URI registered in Zitadel | `ZITADEL_REDIRECT_URI`, `ZITADEL_POST_LOGOUT_URI` |
| Neon `DATABASE_URL` | server `.env` only, never committed |
| The member email that the MCP static key acts as | `MCP_OWNER_EMAIL` |
| Whether anonymous/guest entry is wanted | §7 optional module |
| Any app-specific extras (email, storage, paid APIs) | §6 extension playbook |

### 0.3 Scope discipline

- **Core files** (this document's appendix) are copied, renamed to the app, and
  then left alone except for deliberate decisions. Do not "improve" them
  opportunistically.
- **A new dependency** not listed in §1 requires asking the user. The stack is
  deliberately small.
- Every new setting goes into `server/.env.example` **and** `server/.env`
  (documented, never committed with real values).
- Prefer boring, explicit code over abstraction. There is no service layer
  framework, no repository pattern, no DI container.

---

## 1. Stack and why

| Layer | Choice | Why (do not substitute casually) |
| --- | --- | --- |
| Client | Next.js 16 App Router, TypeScript strict, `@/*` path alias | Read `client/AGENTS.md` first: this Next version differs from training data. Route handlers under `client/app/api/` do not exist by design. |
| Client→API | `rewrites()` in `next.config.ts`: `/api/:path*` → `API_ORIGIN` | Same-origin for the browser, so the session cookie "just works" and CORS stays off. |
| Route guard | `client/proxy.ts` (Next 16's replacement for `middleware.ts`) | Cookie-presence check only; real authorization is always server-side. |
| Server | FastAPI + Pydantic v2 + `pydantic-settings` | Thin routers, camelCase schemas, one error shape. |
| DB driver | **Sync** SQLAlchemy 2 + **pg8000** | Neon's pooler is a trap for asyncpg prepared statements; pg8000 is pure Python (no libpq DLL needed on locked-down machines). Do not switch to asyncpg/psycopg. |
| Schema | Explicit `public` on every table (`MetaData(schema=...)`) | Transaction-mode pooling can reassign connections between statements, so `search_path` cannot be trusted. Never rely on session state. |
| Migrations | Alembic (`env.py` reads app settings) | Autogenerate falsely wants to drop/recreate schema-qualified FKs — review every migration by hand. Deploys do not run migrations. |
| Auth | Zitadel OIDC, **PKCE public client**, code exchange on the server | The verifier never leaves the server. No client secret exists. |
| Sessions | Server-side rows; cookie carries a random token; DB stores sha256 | Revocable, rolling, and clamps to guest/account expiry. No JWTs in cookies. |
| MCP | `mcp` Python SDK v2 (`MCPServer`), Streamable HTTP, stateless + JSON, mounted at `/` behind the API | One request = one independent POST; Cloud Run friendly; same services as the HTTP API. |
| Hosting (reference) | Cloud Run (`asia-southeast1`) for the API, Firebase Hosting static shell + rewrites for the edge | The cookie caveat in phase 8, step 4 is why the session cookie is named `__session` in production. |
| Tests | pytest against the **live Neon DB** in a throwaway schema | No offline mode; a pg8000 `ConnectionResetError` is a flaky failure, rerun it. |

---

## 2. Target repo layout

```
<app>/
├── package.json                  # orchestration only: install + run both dev servers
├── .gitignore                    # node_modules/, .next/, .env, .env.*, logs
├── AGENTS.md                     # per-repo agent rules (write one; see §9.12)
├── master-plan.md                # this file
├── docs/
│   ├── mcp.md                    # deep-dive: transports, auth phases, client setup
│   └── guests-and-cleanup.md     # only if guest mode (§7)
├── client/                       # Next.js 16 app
│   ├── AGENTS.md                 # regenerated by `next dev`; never delete
│   ├── next.config.ts            # /api rewrite to FastAPI
│   ├── proxy.ts                  # Next 16 route guard (NOT middleware.ts)
│   ├── app/
│   │   ├── layout.tsx            # fonts, metadata, providers
│   │   ├── page.tsx              # public landing
│   │   ├── login/page.tsx        # SSO entry + (optional) guest entry
│   │   ├── signup/page.tsx       # links into the same SSO flow
│   │   └── (app)/                # authed area behind proxy.ts
│   │       ├── layout.tsx        # AppShell (user chip, nav)
│   │       └── <routes>/page.tsx
│   ├── components/               # AppShell, feature views
│   └── lib/
│       ├── api-client.ts         # apiFetch: 401 → /login?next=...
│       └── types.ts              # camelCase mirrors of server schemas
└── server/
    ├── pyproject.toml            # uv project; ruff + pyright + pytest config
    ├── .env / .env.example       # real file local; example documents every setting
    ├── Dockerfile                # uv two-stage, Cloud Run (context ./server)
    ├── alembic/env.py            # imports app.models; URL from settings
    ├── app/
    │   ├── main.py               # app, lifespan, error handlers, mount order
    │   ├── config.py             # pydantic-settings; URL normalization; MCP props
    │   ├── database.py           # engine, SessionLocal, Base(metadata schema)
    │   ├── dependencies.py       # current_user / require_user / client factories
    │   ├── utils.py              # local_path(), to_ms/from_ms
    │   ├── mcp_server.py         # MCPServer + verifier + stable mount proxy
    │   ├── mcp_tools.py          # thin tool wrappers over app/services/*
    │   ├── models/               # SQLAlchemy: users, sessions, <domain>...
    │   ├── schemas/              # Pydantic in/out, camelCase field names
    │   ├── routers/              # auth, health, maintenance, <domain>...
    │   └── services/             # business logic; the only layer MCP imports
    ├── scripts/                  # e.g. cleanup_guests.py
    └── tests/
        ├── conftest.py           # throwaway schema + fakes + fixtures
        ├── test_auth.py          # idp_client fixture
        └── test_mcp.py           # mcp_client fixture
```

Authoritative-file map: cookie/signing rules → `services/security.py`; OIDC
protocol → `services/zitadel.py`; identity/session rules →
`services/auth_services.py`; error shape/mount order → `main.py`; MCP identity
mapping → `mcp_server.py`; test isolation → `tests/conftest.py`.

---

## 3. Build order

### Phase 1 — Monorepo scaffold

Root `package.json` (orchestration only; the two halves do **not** share JS
workspaces):

```json
{
  "name": "<app>",
  "private": true,
  "scripts": {
    "start": "npm --prefix client install && uv sync --directory server",
    "dev": "concurrently --kill-others --names api,web --prefix-colors cyan,magenta \"npm run dev:api\" \"npm run dev:web\"",
    "dev:api": "uv run --directory server uvicorn app.main:app --reload --port 8000",
    "dev:web": "npm --prefix client run dev"
  },
  "devDependencies": { "concurrently": "^9.2.1" }
}
```

Root `.gitignore` must include `node_modules/`, `.next/`, `*.log`, `.env`,
`.env.*` (see §9.7 about the example file), plus app-generated data.

Server `pyproject.toml` core dependencies (pin nothing tighter than this):

```toml
[project]
name = "<app>-server"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0.36",
    "pg8000>=1.31",
    "alembic>=1.14",
    "pydantic-settings>=2.6",
    "pyjwt[crypto]>=2.10",
    "httpx>=0.28",
    "mcp>=2.2,<3",
]

[dependency-groups]
dev = ["pytest>=8.3", "ruff>=0.8", "pyright>=1.1.400"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-q"

[tool.ruff]
line-length = 110
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
ignore = ["B008"]   # FastAPI's dependency system lives in argument defaults
```

Track a lockfile (`uv.lock`). `mypy` is unusable on some locked-down Windows
machines (librt blocked); use `pyright` instead — it is Node-based.

Verify: `npm install`, `uv sync --directory server`, then `uv run --directory
server ruff check .` and `npx tsc --noEmit` from `client/` (after phase 4).

### Phase 2 — Server skeleton

Build, in this order: `app/config.py` → `app/database.py` → `app/main.py` →
`app/routers/health_router.py`.

- `config.py` (appendix A.1): `Settings(BaseSettings)` with
  `env_file=<server>/.env`, `extra="ignore"`; `@lru_cache get_settings()`.
  Critical helpers: `sqlalchemy_url` (rewrite `postgres://` →
  `postgresql+pg8000://`, strip libpq-only query params like `sslmode=`),
  `ssl_required`, `mcp_resource_url`, `mcp_jwks_endpoint`,
  `_with_port_patterns()` for MCP allowlists.
- `database.py` (appendix A.2): `create_engine(..., pool_pre_ping=True,
  pool_recycle=300)`, `ssl_context` only when `ssl_required`, `SessionLocal`,
  `Base(DeclarativeBase)` with `metadata = MetaData(schema=settings.db_schema)`,
  `get_db()` dependency.
- `main.py` (appendix A.7): FastAPI title/version, the MCP lifespan, the two
  exception handlers (`{"error": "..."}` for string details, `{"error",
  "details"}` 422), then routers, then **mount MCP last**.
- Health route: `GET /api/health` executes `select 1` and returns
  `{"status": "ok"}`.

Verify: `uv run --directory server uvicorn app.main:app --port 8000`, then
`curl http://localhost:8000/api/health`.

### Phase 3 — Identity core (Zitadel + sessions)

1. **Models**: `models/enums.py` (`UserKind` with `member`/`guest`),
   `models/users.py`, `models/sessions.py` (appendix A.11). Conventions:
   `Uuid` primary key with `default=uuid.uuid4`; `DateTime(timezone=True)`
   everywhere; `utcnow()` helper; `UniqueConstraint("idp_issuer",
   "zitadel_sub")` on users; `deleted_at` soft-delete marker. Sessions key on
   `token_hash` (sha256 hex, `String(64)` PK), FK `ondelete="CASCADE"`,
   `expires_at`, `revoked_at`, truncated `user_agent`/`ip`.
2. **`services/security.py`** (appendix A.3): token hashing + generation,
   HMAC-signed payloads (`sign_payload`/`unsign_payload`, base64url body +
   signature, `iat` max-age check), PKCE S256 pair, state/nonce generator,
   cookie setters (HttpOnly, SameSite=Lax, `secure` from settings).
3. **`services/zitadel.py`** (appendix A.4): a deliberately plain OIDC client —
   discovery document, `authorize_url`, `exchange_code`, `verify_id_token`
   (JWKS by `kid`, `iss`, `aud=client_id`, `nonce`, 60s leeway), and
   `end_session_url`. Raise `ZitadelError`; the router turns it into a friendly
   failure.
4. **`services/auth_services.py`** (appendix A.5): `create_session`,
   `session_user` (rolling refresh at half-TTL, throttled `last_seen_at`,
   refuse deleted/expired users), `revoke_session`, `find_member`,
   `find_or_create_member` (JIT provisioning; local row is a projection of the
   IdP user), `public_user`.
5. **`dependencies.py`** (appendix A.6): `current_user` (reads session cookie →
   `session_user`), `require_user` (401 `{"error": "Not signed in."}`),
   `get_zitadel` factory returning a client with `httpx.Client(timeout=10.0)`.
6. **`routers/auth_router.py`** (appendix A.8): `GET/POST /api/auth/login`,
   `POST /api/auth/signup` (same flow), `GET /api/auth/callback`,
   `GET /api/auth/me`, `POST /api/auth/logout`.
7. **Migration**: `uv run --directory server alembic revision --autogenerate -m
   "users and sessions"`, then read the generated file and fix schema-qualified
   FK churn by hand. `alembic/env.py` must `from app import models` so metadata
   is complete, and set the URL from settings with `%` escaped.
8. **Tests**: `tests/conftest.py` (appendix A.10) + `tests/test_auth.py`
   covering: `/api/auth/login` sets the signed cookie and redirects to the IdP;
   callback with wrong state → 400; callback round-trip provisions a member and
   sets the session cookie; `/api/auth/me` 401 vs 200; logout returns
   `logoutUrl` and clears the cookie; redirect `next` stays same-site.

Verify: `uv run --directory server pytest tests/test_auth.py -q`.

### Phase 4 — Client shell

1. Scaffold Next 16 (TypeScript, App Router, `@/*` path alias). Read
   `client/AGENTS.md` and the docs it points to in
   `node_modules/next/dist/docs/` before writing Next code.
2. `next.config.ts` — same-origin API (appendix A.9, top). `API_ORIGIN` env
   overrides the default `http://localhost:8000`.
3. `proxy.ts` — the route guard. In Next 16 this file replaces
   `middleware.ts`. Keep the `matcher` exclusion of `api|_next|assets|<static
   files>`; update `PROTECTED` to the app's authed routes. It checks only that
   the session cookie exists, then redirects to `/login?next=<pathname>`.
4. `lib/api-client.ts` — `apiFetch` wraps `fetch`; on 401 in the browser it
   redirects to `/login?next=<current path>`. All authed calls go through it.
5. `app/login/page.tsx` — a plain `<a href="/api/auth/login?next=...">` to the
   server (never a client-side fetch), so the browser follows the 302 to
   Zitadel with cookies intact. Render `?error=` from the callback.
6. `app/signup/page.tsx` — links into the same login flow; signup happens
   inside the hosted Zitadel page.
7. `app/(app)/layout.tsx` + `components/AppShell.tsx` — fetch
   `/api/auth/me` on mount for the user chip; call `POST /api/auth/logout`,
   then `window.location.href = logoutUrl` when present (otherwise the IdP
   cookie survives and the next SSO click silently signs the user back in).
8. `lib/types.ts` — hand-written camelCase interfaces mirroring the server
   schemas; timestamps are **numbers** (ms since epoch).

Verify: both dev servers up (`npm run dev`), landing loads, `/garden` (or any
protected route) redirects to `/login`, SSO round-trip lands signed in,
`/api/auth/me` shows the member, logout ends both sessions.

### Phase 5 — Domain resources

Every resource follows the same five-file shape. Use this as the template for
anything app-specific:

| Step | File | Rules |
| --- | --- | --- |
| 1. Model | `app/models/<resource>.py` | UUID pk, `owner_id` FK `ondelete="CASCADE"` + index, `created_at`/`updated_at` tz-aware, relationships with `cascade="all, delete-orphan"`. Register in `app/models/__init__.py`. |
| 2. Schemas | `app/schemas/<resource>.py` | Pydantic models with **camelCase field names** (`forWhom`, `giveOn`, `ownerId`) so no alias generator is needed; separate `*In` (request) and `*Public`/`*Out` (response) models. |
| 3. Service | `app/services/<resource>_services.py` | Takes `db: Session` + ids; owns validation that isn't request-shape; commits; returns ORM objects; has a `<resource>_public()` projection to the response schema. Domain rule violations raise small custom exceptions (e.g. `PlaylistLimitError`) that routers/tools translate. |
| 4. Router | `app/routers/<resource>_router.py` | `APIRouter(prefix="/api/<resource>", tags=[...])`; every route `Depends(require_user)` + `Depends(get_db)`; `response_model` set; `201` on create; `404 {"error": "Not found."}` for missing/not-owned; ownership checks live here (`_owned(db, id, user)` helper). |
| 5. Client types | `client/lib/types.ts` | Mirror of the `*Public` schemas. |

Then: Alembic revision (review by hand), pytest coverage for ownership and
validation, and an MCP tool per sensible operation (phase 6). Ownership
scoping is always `WHERE owner_id = user.id`; never trust an id from the
payload.

### Phase 6 — MCP endpoint

`app/mcp_server.py` (appendix A.12) and `app/mcp_tools.py` (appendix A.13),
wired from `main.py`'s lifespan. The subtle parts, in order of how easily they
break:

1. **Mount last.** `app.mount("/", mcp_mount)` is added after every
   `include_router` call. Starlette matches in order, so `/api/*` wins and the
   MCP app only sees the rest (`/mcp`, the RFC 9728 `.well-known` route).
2. **Stable mount proxy.** `mcp.streamable_http_app()` builds a session manager
   that can `run()` only once per instance. `MCPMount` is a stable ASGI target;
   `start()` builds a fresh app each lifespan, `stop()` clears it. The FastAPI
   lifespan owns `async with mcp.session_manager.run()`. Without this, the
   second uvicorn start (or second `TestClient`) fails.
3. **Stateless + JSON.**
   `stateless_http=True, json_response=True` — no session id, no SSE stream.
   Every POST carries its own `Authorization` header.
4. **Reject `GET /mcp` with 405** before CORS in the middleware stack
   (`RejectMCPGet`), so clients don't hold idle SSE streams open and pin a
   Cloud Run instance.
5. **Transport security.** `TransportSecuritySettings` with DNS-rebinding
   protection and `MCP_ALLOWED_HOSTS` (`_with_port_patterns` also matches
   `host:port`). Forgetting the deployed hostname produces a bare
   `421 Misdirected Request` with no hint in the MCP layer. `testserver` must
   stay in the list for tests.
6. **Identity.** `SolaceTokenVerifier` accepts either the static
   `MCP_API_KEY` (via `secrets.compare_digest`) acting as the member with
   `MCP_OWNER_EMAIL`, or a Zitadel access token: verify signature through
   `PyJWKClient` (`MCP_JWKS_URL`, default `{issuer}/oauth/v2/keys`), require
   `exp`/`sub`, check `iss`, optionally require `aud` (`MCP_AUDIENCE`), then map
   `sub` → `users.(idp_issuer, zitadel_sub)` where `kind=member` and not
   deleted. Fail closed: anything else → 401 with the
   `WWW-Authenticate` + `resource_metadata` challenge the SDK emits.
7. **Caller resolution per tool.** `current_user(db)` reads the verified
   access token's subject (a user UUID) and loads the row; every tool call is
   scoped to that user. Guests can never pass (they have no Zitadel identity),
   and the static key needs a member owner.
8. **Tools are thin.** Sync `def` tools run on a worker thread in mcp v2, so
   they call `app/services/*` directly — no HTTP hop, no FastAPI dependency
   layer. Each tool opens `with get_session() as db:`, resolves
   `current_user(db)`, calls services, and returns
   `.model_dump(mode="json")` so structured content matches the web API.
9. **Tool error contract.** User-recoverable problems raise `ToolError` with a
   sentence the model can read ("Plant not found.", "Write something first.").
   Declare `ToolAnnotations` (`READ_ONLY`, `MUTATING`, `DESTRUCTIVE`) so hosts
   can ask for confirmation before irreversible operations. Docstrings are the
   tool descriptions — write them for an LLM.

Config block (all in `server/.env`, documented in `.env.example`):

```dotenv
MCP_ENABLED=true
MCP_API_KEY=            # generate: python -c "import secrets; print(secrets.token_urlsafe(32))"
MCP_OWNER_EMAIL=
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1],testserver
MCP_ALLOWED_ORIGINS=
MCP_AUDIENCE=
MCP_JWKS_URL=
```

Tests: `tests/test_mcp.py` through the mounted route with the `mcp_client`
fixture — 401 challenge + metadata URL, wrong token, `initialize`,
`tools/list`, owner-scoped `tools/call`, and both verifier paths (static key
and a faked Zitadel subject).

Verify:

```bash
curl -sS http://localhost:8000/mcp \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

…and an MCP Inspector session (`npx @modelcontextprotocol/inspector`,
transport Streamable HTTP).

### Phase 7 — Tests

`tests/conftest.py` (appendix A.10) is the whole strategy:

- One throwaway schema per test run: `solace_test_<hex>` created with
  `CREATE SCHEMA`, tables created via `Base.metadata.create_all(test_engine)`,
  dropped `CASCADE` at the end.
- `schema_translate_map={settings.db_schema: TEST_SCHEMA}` on the engine —
  **not** `SET search_path`, which leaks through Neon's transaction pooler.
- Truncate every table after each test (`TRUNCATE ... CASCADE`).
- `app.dependency_overrides[get_db]` swaps in a session bound to the test
  engine; `TestClient(app, follow_redirects=False)` because the auth flow is
  all 302s.
- `FakeZitadel` impersonates the protocol methods (records calls, returns
  canned claims) and is injected via `dependency_overrides[get_zitadel]`. Any
  external API gets the same treatment: a service class + a FastAPI dependency
  + a fake fixture (the music tests' `FakeYouTube` is the pattern).
- `mcp_env` points `mcp_server._session_factory` at the test session and sets
  a test key/owner; `mcp_client` is the resulting client.

Commands (also the CI/lint gates):

```bash
uv run --directory server pytest                 # all tests
uv run --directory server pytest tests/test_auth.py::test_name -q
uv run --directory server ruff check .
uv run --directory server pyright
npx tsc --noEmit                                 # from client/
npm --prefix client test                         # node --test, no framework
```

A `pg8000`/SQLAlchemy `ConnectionResetError` is a flaky Neon failure — rerun,
do not "fix" code for it.

### Phase 8 — Deploy (reference shape)

1. **Dockerfile** (appendix A.14): uv builder stage resolves `uv.lock` into
   `/app/.venv`, then `uv sync --frozen --no-dev --no-editable` bakes `app/`
   (including `app/data/*.json`) into the venv; runtime stage on
   `python:3.12-slim`, non-root user, `EXPOSE 8080`,
   `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}`. Build with
   context `./server`.
2. **CI/CD** (appendix A.15): GitHub Actions on push to the default branch with
   `paths: server/**` — build/push a commit-SHA-tagged image to Docker Hub,
   authenticate to GCP, `deploy-cloudrun` to the region of choice. (In this
   repo `cd.yml` currently fires on `main`; if you copy the file, verify the
   `branches` filter rather than trusting older notes.)
3. **Reverse proxy / hosting**: Firebase Hosting rewrites `/api/**`, `/mcp`,
   `/docs`, `/docs/**`, `/redoc`, `/openapi.json`, `/.well-known/**` to the
   Cloud Run service. `MCP_ALLOWED_HOSTS` must include the public hostname.
4. **The cookie caveat that dictates a default**: Firebase Hosting strips every
   cookie except `__session` on Cloud Run rewrites. Set
   `SESSION_COOKIE_NAME=__session` and `COOKIE_SECURE=true` in production, and
   keep `SESSION_COOKIE_NAME` configurable for local dev.
5. **Migrations are manual**: `alembic upgrade head` against `DATABASE_URL`
   (e.g. `docker run --rm -e DATABASE_URL=... <image> alembic upgrade head`).
   Deploys never run migrations.
6. **Zitadel**: whitelist `ZITADEL_REDIRECT_URI` and `ZITADEL_POST_LOGOUT_URI`
   for the deployed domain. If the API and client are different origins, also
   set `CORS_ORIGINS` and `COOKIE_SECURE=true`.
7. **Scheduled jobs** (optional module §7 and any future cron): a
   secret-header endpoint + CLI sharing one service function, driven by Cloud
   Scheduler (or any cron) — never expose an unauthenticated maintenance route.

---

## 4. Hard invariants

**Auth / OIDC**

1. PKCE is generated **and redeemed server-side**. The code verifier never
   reaches the browser; only `state`, `nonce`, and the challenge go in the URL.
   The signed, HttpOnly, 10-minute `app_oauth` cookie carries
   `{state, nonce, code_verifier, next, iat}` between login and callback.
2. The callback verifies the signed cookie, compares `state` with
   `hmac.compare_digest`, exchanges the code server-side, and verifies the ID
   token against the JWKS with `iss`, `aud=client_id`, `nonce`, and 60s clock
   leeway.
3. `next` redirect targets always go through `local_path()` from
   `app/utils.py` — same-site paths only (`/...`, never `//...`).
4. `(idp_issuer, zitadel_sub)` is unique. Members are provisioned
   just-in-time from verified claims (`email`, `name` refreshed on each
   login); the local user row is a projection of the IdP user, never an
   independent credential store. There is no password anywhere.
5. Member logout revokes the DB session **and** returns the Zitadel
   `end_session` URL; the client must navigate to it, or the IdP cookie
   survives and the next login is silent. If discovery is down, logout still
   succeeds locally (`logoutUrl: null`).
6. Zitadel must have `ZITADEL_REDIRECT_URI` and `ZITADEL_POST_LOGOUT_URI`
   whitelisted exactly; a mismatch is an IdP-side error page, not an app bug.

**Sessions / cookies**

7. The cookie carries a random token; the DB stores only its sha256 hash. The
   cookie is HttpOnly, SameSite=Lax, `secure` per config, path `/`.
8. Sessions roll: refresh when less than half the TTL remains; `last_seen_at`
   updates at most every 5 minutes; revoked/expired/deleted-user sessions
   resolve to `None` (→ 401). Never trust a cookie locally; every request goes
   through `session_user`.
9. Guest sessions can never outlive the guest row (`expires_at =
   min(ttl, guest_expires_at)`).

**Database**

10. Sync SQLAlchemy + pg8000; `pool_pre_ping=True`, `pool_recycle=300`.
11. Every table is schema-qualified: `Base.metadata = MetaData(schema=...)`.
    Never `SET search_path`, never unqualified raw SQL, never asyncpg.
12. Timezone-aware UTC timestamps in the DB; API timestamps are integer
    **milliseconds** (`to_ms`/`from_ms` in `utils.py`).
13. snake_case DB columns; camelCase API fields (`users.display_name` →
    `{"name": ...}` as in `PublicUser`). Keep the mapping in the schema layer.
14. Alembic migrations are reviewed by hand; deploys do not apply them.

**API**

15. Errors are `{"error": "sentence"}` (Starlette handler); 422s add
    `details`. The client reads `.error`.
16. Routers are thin: validate request shape, enforce ownership, call a
    service, return a schema. Business logic and commits live in
    `app/services/*`.
17. Auth is opt-in per route via `Depends(require_user)`; there is no global
    auth middleware. Ownership is checked against the authenticated user on
    every read/write, including "not found" for other users' rows.
18. No route handler for the API lives in the Next app. `/api/*` is always the
    FastAPI rewrite.

**MCP**

19. Mounted at `/` **after** all API routers; the mount proxy rebuilds the
    streamable app per lifespan; `GET /mcp` is answered with 405.
20. Stateless + JSON transport; every request authenticates independently.
21. The verifier fails closed and only ever maps to an active member; the
    caller is resolved fresh per tool call; tools call services directly, in
    the worker thread, scoped to that member.
22. `MCP_ALLOWED_HOSTS` contains localhost, loopback, `testserver`, and every
    deployed hostname. `MCP_API_KEY` behaves like a password: never in client
    code, never committed.

**Client / secrets**

23. Session-bearing fetches go through `apiFetch`; the 401 redirect is the
    only "authorization" the client does. `proxy.ts` is UX, not security.
24. `client/AGENTS.md` (regenerated by `next dev`) stays in the repo; read it
    before writing Next code. `proxy.ts`, not `middleware.ts`.
25. `server/.env` is never committed; `server/.env.example` documents every
    setting with purpose and generation command. Secrets are server-side only.

---

## 5. Environment variables (master table)

Server (`server/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Neon connection string; `sslmode`/libpq params are stripped by `sqlalchemy_url`. |
| `DB_SCHEMA` | `public` | Schema on every table; tests translate it to a throwaway name. |
| `APP_SECRET` | dev placeholder | HMAC key for the short-lived OAuth cookie. Generate `secrets.token_urlsafe(48)`. |
| `CLEANUP_SECRET` | empty | Header secret for `POST /api/maintenance/cleanup-guests`; empty disables it. |
| `API_BASE_URL` | `http://localhost:8000` | This API's public origin; also the MCP RFC 8707 resource id (`<API_BASE_URL>/mcp`). |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Client origin for failure redirects. |
| `ZITADEL_ISSUER` | — | Instance URL, no trailing slash. |
| `ZITADEL_CLIENT_ID` | empty | PKCE public client id. |
| `ZITADEL_REDIRECT_URI` | client origin + `/api/auth/callback` | Must match Zitadel's whitelist. |
| `ZITADEL_POST_LOGOUT_URI` | `/login` | Must match Zitadel's whitelist. |
| `SESSION_COOKIE_NAME` | `app_session` | Production on Firebase Hosting: `__session` (phase 8, step 4). |
| `SESSION_TTL_DAYS` | `30` | Rolling session lifetime. |
| `GUEST_TTL_DAYS` | `7` | Optional guest mode. |
| `COOKIE_SECURE` | `false` | `true` in any HTTPS deployment. |
| `CORS_ORIGINS` | empty | Only if client and API are different origins. |
| `MCP_ENABLED` | `true` | Mount `/mcp`; false → route absent. |
| `MCP_API_KEY` | empty | Static bearer key; empty disables key auth (fail closed). |
| `MCP_OWNER_EMAIL` | empty | Member the static key acts as. |
| `MCP_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1],testserver` | Host allowlist (+ any-port patterns), DNS-rebinding protection. |
| `MCP_ALLOWED_ORIGINS` | empty | Browser Origin allowlist; empty rejects browser origins. |
| `MCP_AUDIENCE` | empty | Required `aud` on Zitadel access tokens. |
| `MCP_JWKS_URL` | `{issuer}/oauth/v2/keys` | Override JWKS endpoint. |

Client: `API_ORIGIN` (default `http://localhost:8000`) for the rewrite target.
Do not put secrets in client env vars; there are none.

---

## 6. Extension playbook (app-specific features)

**A new domain resource** — follow the five-file table in phase 5, then:

- add an MCP tool per sensible operation (read tools first, destructive last,
  with annotations),
- add the type to `client/lib/types.ts`,
- add tests for ownership, validation, and the happy path,
- update `AGENTS.md` with anything surprising about this resource.

**External API integration** (this repo's YouTube music is the model):

1. Wrap the API in a small class in `app/services/<vendor>.py` with a
   `configured` flag (empty key disables it), typed results, and vendor errors
   translated to one `*Error`.
2. Expose it as a FastAPI dependency in `dependencies.py` (`get_<vendor>`),
   so tests can override it.
3. Add a `Fake<Vendor>` to `conftest.py` that records calls and serves canned
   results; add a `<vendor>_client` fixture.
4. Cache quota-expensive responses in a table with TTLs (see
   `music_services.search_tracks`); respect vendor terms (e.g. YouTube caps
   cached data at 30 days) and keep a soft daily cap below the real quota.
5. Keep the key server-side; MCP tools construct the same client and reuse the
   same service functions.

**Email**: a `services/email.py` with a `configured` flag and a `send()`
that logs in dev, plus a fake in tests. Outbound sends triggered by requests
are still best-effort: never let a failed email fail the user's request unless
the user asked for exactly that.

**Object storage**: same shape — one service module, one dependency, one fake.
Never hand a browser a long-lived credential; issue short-lived signed URLs
through an authed route. Store only the object key in the DB.

**Scheduled/background work**: one service function (`purge_expired` is the
pattern), exposed twice — a CLI under `server/scripts/` and a secret-header
endpoint under `/api/maintenance/` — with idempotent behavior, dry-run support,
and counts in the response.

**A second front end / mobile app**: reuse `/api/*` as-is; the session cookie
model assumes same-origin, so other clients should use the MCP endpoint or a
purpose-built token flow rather than reinventing cookie auth.

---

## 7. Optional module: guest mode

Only build this if the user wants anonymous entry. It is self-contained.

- `POST /api/auth/guest` creates a `users` row with `kind=guest`, a random
  display name, `guest_expires_at = now + GUEST_TTL_DAYS`, seeds demo data,
  then creates a session and sets the cookie. No IdP involved.
- Sessions clamp to `guest_expires_at` (invariant 9) and `session_user`
  refuses an expired guest even before cleanup runs.
- **Signing in discards the guest**: in the callback, before JIT-provisioning
  the member, delete the guest row if the caller was a guest. The DB cascades
  its data (plants/posts/events/gifts/sessions). Guest data is never linked to
  an account. The exact core-callback insertion:

  ```python
  guest: User | None = Depends(current_user),   # add to the callback signature
  ...
  if guest is not None and guest.kind is UserKind.guest:
      # Throwaway, never an account: drop the row; the database cascades.
      db.delete(guest)
      db.flush()
  ```

- Seed data: a JSON file under `app/data/` plus a `clone_seed_garden(db, user)`
  service, so every guest immediately has plausible content.
- Cleanup: `maintenance_services.purge_expired(db, dry_run=...)` deletes
  expired guests and dead sessions, shared by
  `scripts/cleanup_guests.py` (CLI, `--dry-run`) and
  `POST /api/maintenance/cleanup-guests` (`hmac.compare_digest` against
  `X-Cleanup-Secret`; 403 when unset/wrong). Schedule it with Cloud Scheduler
  or any cron. Idempotent; returns counts.
- Client: a secondary "Enter as guest" button on `/login` that POSTs
  `/api/auth/guest`, then `router.push` + `router.refresh()`.

Full details live in `docs/guests-and-cleanup.md` in the reference repo.

---

## 8. Definition of done

A new app built from this document is done when all of these pass:

1. `npm run start` installs both halves; `npm run dev` runs both servers.
2. `uv run --directory server pytest` is green (with the occasional Neon
   flake rerun); `ruff check .` and `pyright` are clean.
3. `npx tsc --noEmit` in `client/` is clean.
4. In the browser: landing loads, protected route redirects to `/login` with
   `next`, SSO login provisions a member, `/api/auth/me` returns it, logout
   hits Zitadel's `end_session` and returns to `/login` signed out.
5. `curl /api/health` → `{"status": "ok"}`; a bad login callback → 400 with
   `{"error": ...}`; an authed call without a cookie → 401 `{"error": "Not
   signed in."}`.
6. `tools/list` over `POST /mcp` with the bearer key lists the tools; an
   unauthenticated call gets the 401 + `WWW-Authenticate` challenge; a
   `tools/call` mutates only the owner's data.
7. `alembic upgrade head` brings a fresh Neon database to the current schema,
   and the reviewed migration contains no spurious
   drop/recreate of schema-qualified FKs.
8. Secrets exist only in `server/.env` / the deploy environment;
   `.env.example` documents every one.

---

## 9. Footguns and anti-patterns

| Symptom | Cause | Fix |
| --- | --- | --- |
| `421 Misdirected Request`, no app logs | Deployed hostname missing from `MCP_ALLOWED_HOSTS` | Add it (any-port patterns are automatic); keep `testserver` for tests. |
| Second `uvicorn --reload` start crashes the MCP app | Session manager `run()` called twice on one instance | Keep the `MCPMount` proxy + per-lifespan `start()`/`stop()`; never mount `mcp.streamable_http_app()` directly. |
| API routes 404 / MCP swallows them | MCP mounted before routers | Mount at `/` last; all `/api` routes must win first. |
| Idle SSE connections pin Cloud Run instances | MCP client opened the standalone GET stream | `RejectMCPGet` returns 405 for `GET /mcp`; SDKs fall back to POST. |
| SQLAlchemy/Alembic "relation does not exist" after deploy | Session `search_path` assumption or unqualified table | Explicit `MetaData(schema=...)`; no `SET search_path`; review migrations. |
| Random DB disconnects/resets | asyncpg through the Neon transaction pooler, or a stale pooled connection | Stay on sync SQLAlchemy + pg8000 with `pool_pre_ping`/`pool_recycle` (test flakiness aside). |
| Test run wipes real data | Tests pointed at the live schema | `schema_translate_map` to a throwaway `*_test_*` schema, `TRUNCATE` after each test, assert schema != prod schema. |
| Migration drops/recreates FKs it shouldn't | Alembic autogenerate + schema-qualified FKs | Read every generated migration; hand-fix before applying. |
| Cookie disappears only in production | Firebase Hosting strips all cookies except `__session` on Cloud Run rewrites | `SESSION_COOKIE_NAME=__session` (and `COOKIE_SECURE=true`). |
| Login silently re-signs-in right after logout | Client never navigated to `logoutUrl` | `POST /api/auth/logout` → then `window.location.href = logoutUrl`. |
| 400 on callback, browser back-loop | Lost/replayed OAuth cookie, state mismatch, or blocking the cookie through a different origin | Keep the login handshake same-origin (rewrite), 302 (not fetch) to the API, `SameSite=Lax`. |
| Open redirect via `next` | Trusting a user-supplied redirect | Always `local_path()`; same-site only. |
| `app/api` route handlers appear under `client/` | Habit from other Next projects | Delete them; `/api` is the FastAPI rewrite (`afterFiles`, so a handler would silently shadow the API). |
| Guard doesn't run on some paths | Next 16 uses `proxy.ts`; a leftover `middleware.ts` does nothing | Use `proxy.ts` and keep the `matcher` static exclusions. |
| IdP error page on login | Redirect/post-logout URI not whitelisted exactly | Update the Zitadel app registration to match `.env`. |
| `mypy` crashes / psycopg import errors on locked-down Windows | Application Control blocks native DLLs | Use `pyright`; keep pg8000 (pure Python). |
| A tool mutates the wrong user's data | Tool trusted an id from arguments | Resolve `current_user(db)` per call and re-scope via services (same as routers). |
| Unauthenticated maintenance endpoint | Forgot the header check | `hmac.compare_digest` against `CLEANUP_SECRET`, 403 when unset/wrong. |

### 9.12 Write an `AGENTS.md` for the new repo

Copy the shape of this repo's root `AGENTS.md`: commands (setup, both dev
servers, tests, lint, typecheck, migrations), server invariants (driver,
schema, error shape, MCP), auth invariants (PKCE, guests, logout URL,
redirect rules, cleanup secret), client invariants (proxy rewrite, `apiFetch`,
Next 16 agent-rules file), and deploy notes. Keep it short and factual; it is
the first thing the next agent reads.

---

## Appendix A — Key code (near-verbatim reference skeletons)

Adapt names (`<app>`, table names, env values). Do not restructure the parts
that look unusual: each oddity exists for a documented reason.

### A.1 `server/app/config.py` (core properties)

```python
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str
    # Neon's pooler runs in transaction mode, so session state (search_path)
    # cannot be trusted: every table is addressed with an explicit schema.
    db_schema: str = "public"

    app_secret: str = "dev-only-insecure-secret"
    cleanup_secret: str = ""
    api_base_url: str = "http://localhost:8000"
    public_base_url: str = "http://localhost:3000"

    zitadel_issuer: str = "https://<instance>.zitadel.cloud"
    zitadel_client_id: str = ""
    zitadel_redirect_uri: str = "http://localhost:3000/api/auth/callback"
    zitadel_post_logout_uri: str = "http://localhost:3000/login"

    session_cookie_name: str = "app_session"
    session_ttl_days: int = 30
    guest_ttl_days: int = 7
    cookie_secure: bool = False

    mcp_enabled: bool = True
    mcp_api_key: str = ""
    mcp_owner_email: str = ""
    mcp_allowed_hosts: str = "localhost,127.0.0.1,[::1],testserver"
    mcp_allowed_origins: str = ""
    mcp_audience: str = ""
    mcp_jwks_url: str = ""

    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def mcp_resource_url(self) -> str:
        """The RFC 8707 resource identifier clients request tokens for."""
        return f"{self.api_base_url.rstrip('/')}/mcp"

    @property
    def mcp_allowed_host_list(self) -> list[str]:
        return _with_port_patterns(self.mcp_allowed_hosts)

    @property
    def mcp_allowed_origin_list(self) -> list[str]:
        return _with_port_patterns(self.mcp_allowed_origins)

    @property
    def mcp_jwks_endpoint(self) -> str:
        return self.mcp_jwks_url.strip() or f"{self.zitadel_issuer.rstrip('/')}/oauth/v2/keys"

    @property
    def sqlalchemy_url(self) -> str:
        """Normalizes the DATABASE_URL for SQLAlchemy.

        pg8000 is a pure-Python driver: no native libpq DLL is needed, and
        libpq-only query parameters (sslmode, channel_binding) are dropped;
        SSL is configured via ssl_context in database.py instead.
        """
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+pg8000://", 1)
        head, sep, query = url.partition("?")
        if not sep:
            return url
        dropped = ("channel_binding=", "sslmode=", "sslrootcert=", "sslcert=", "sslkey=")
        kept = [part for part in query.split("&") if part and not part.startswith(dropped)]
        return f"{head}?{'&'.join(kept)}" if kept else head

    @property
    def ssl_required(self) -> bool:
        return any(
            part.startswith("sslmode=") and part.split("=", 1)[1] in {"require", "verify-ca", "verify-full"}
            for part in self.database_url.partition("?")[2].split("&")
        )


def _with_port_patterns(value: str) -> list[str]:
    """Each entry also matches "entry:<port>", the shape a Host header takes."""
    patterns: list[str] = []
    for entry in (part.strip() for part in value.split(",")):
        if not entry:
            continue
        patterns.append(entry)
        if not entry.endswith(":*"):
            patterns.append(f"{entry}:*")
    return patterns


@lru_cache
def get_settings() -> Settings:
    return Settings()  # values come from .env
```

### A.2 `server/app/database.py`

```python
import ssl
from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

# Sync SQLAlchemy on purpose: Neon's pooler is a known trap for asyncpg's
# prepared statements, and pg8000 (pure Python, no native DLL) is plenty here.
_connect_args: dict[str, object] = {}
if settings.ssl_required:
    _connect_args["ssl_context"] = ssl.create_default_context()

engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    # Explicit schema on every table. A pooler in transaction mode can route
    # consecutive statements to different server connections, so anything set
    # per session (search_path) is unreliable.
    metadata = MetaData(schema=settings.db_schema)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### A.3 `server/app/services/security.py`

```python
import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Literal

from fastapi import Response

from ..config import Settings

OAUTH_COOKIE = "app_oauth"          # short-lived login-handshake cookie
OAUTH_COOKIE_MAX_AGE = 600          # ten minutes to finish signing in


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_payload(payload: dict[str, Any], secret: str) -> str:
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    signature = _b64e(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def unsign_payload(value: str | None, secret: str, *, max_age: int) -> dict[str, Any] | None:
    if not value or "." not in value:
        return None
    body, _, signature = value.partition(".")
    expected = _b64e(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(_b64d(body))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    issued = payload.get("iat")
    if not isinstance(issued, int) or time.time() - issued > max_age:
        return None
    return payload


def create_pkce_pair() -> tuple[str, str]:
    """Returns (code_verifier, code_challenge) per RFC 7636 S256."""
    verifier = secrets.token_urlsafe(64)
    challenge = _b64e(hashlib.sha256(verifier.encode()).digest())
    return verifier, challenge


def new_state_nonce() -> tuple[str, str]:
    return secrets.token_urlsafe(32), secrets.token_urlsafe(32)


def set_cookie(
    response: Response,
    name: str,
    value: str,
    *,
    settings: Settings,
    max_age: int,
    http_only: bool = True,
    same_site: Literal["lax", "strict", "none"] = "lax",
) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path="/",
        httponly=http_only,
        secure=settings.cookie_secure,
        samesite=same_site,
    )


def clear_cookie(response: Response, name: str, *, settings: Settings) -> None:
    response.delete_cookie(
        name,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
```

### A.4 `server/app/services/zitadel.py`

```python
"""Minimal, explicit OIDC client. Deliberately plain: httpx for the protocol
calls, PyJWT for JWKS verification. No client secret - the app is a PKCE
public client and the code exchange happens server-side, so the verifier never
leaves this process."""

from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx
import jwt

SCOPE = "openid profile email"

# The IdP's clock is never exactly ours: a token minted "now" can arrive with
# an iat a second or two in the future and would otherwise fail validation.
CLOCK_SKEW_SECONDS = 60


class ZitadelError(RuntimeError):
    pass


@dataclass
class ZitadelClient:
    issuer: str
    client_id: str
    http: httpx.Client
    jwks: dict | None = None  # test seam: skip fetching the key set
    _discovery: dict | None = field(default=None, init=False, repr=False)

    def discovery(self) -> dict:
        if self._discovery is None:
            url = f"{self.issuer.rstrip('/')}/.well-known/openid-configuration"
            response = self.http.get(url)
            response.raise_for_status()
            self._discovery = dict(response.json())
        return self._discovery

    def authorize_url(self, *, state: str, nonce: str, code_challenge: str, redirect_uri: str) -> str:
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": SCOPE,
            "redirect_uri": redirect_uri,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self.discovery()['authorization_endpoint']}?{urlencode(params)}"

    def exchange_code(self, *, code: str, code_verifier: str, redirect_uri: str) -> dict:
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": self.client_id,
            "code_verifier": code_verifier,
        }
        response = self.http.post(self.discovery()["token_endpoint"], data=payload)
        if response.status_code >= 400:
            raise ZitadelError(f"token exchange failed ({response.status_code}): {response.text}")
        return response.json()

    def verify_id_token(self, id_token: str, *, nonce: str) -> dict:
        key_set = self.jwks if self.jwks is not None else self._fetch_jwks()
        try:
            kid = jwt.get_unverified_header(id_token).get("kid")
        except jwt.PyJWTError as exc:
            raise ZitadelError(f"malformed id_token: {exc}") from exc
        try:
            parsed = jwt.PyJWKSet.from_dict(key_set)
            key = parsed[kid] if kid else parsed.keys[0]
        except (jwt.PyJWTError, KeyError, IndexError) as exc:
            raise ZitadelError(f"unknown signing key: {exc}") from exc

        algorithms = self.discovery().get("id_token_signing_alg_values_supported") or ["RS256"]
        try:
            claims = jwt.decode(
                id_token,
                key.key,
                algorithms=[alg for alg in algorithms if alg != "none"],
                audience=self.client_id,
                issuer=self.issuer.rstrip("/"),
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
                leeway=CLOCK_SKEW_SECONDS,
            )
        except jwt.PyJWTError as exc:
            raise ZitadelError(f"id_token rejected: {exc}") from exc
        if claims.get("nonce") != nonce:
            raise ZitadelError("nonce mismatch")
        return claims

    def end_session_url(
        self, *, id_token_hint: str | None = None, post_logout_redirect_uri: str | None = None
    ) -> str:
        endpoint = self.discovery()["end_session_endpoint"]
        params = {"client_id": self.client_id}
        if id_token_hint:
            params["id_token_hint"] = id_token_hint
        if post_logout_redirect_uri:
            params["post_logout_redirect_uri"] = post_logout_redirect_uri
        return f"{endpoint}?{urlencode(params)}"

    def _fetch_jwks(self) -> dict:
        response = self.http.get(self.discovery()["jwks_uri"])
        response.raise_for_status()
        return response.json()
```

### A.5 `server/app/services/auth_services.py`

```python
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from ..config import Settings
from ..models import Session as SessionRow
from ..models import User
from ..models.enums import UserKind
from ..schemas.users import PublicUser
from . import security

LAST_SEEN_THROTTLE = timedelta(minutes=5)


def _now() -> datetime:
    return datetime.now(UTC)


def create_session(
    db: DbSession,
    user: User,
    *,
    settings: Settings,
    user_agent: str | None = None,
    ip: str | None = None,
) -> str:
    """Creates a server-side session and returns the raw cookie token."""
    token = security.new_session_token()
    expires = _now() + timedelta(days=settings.session_ttl_days)
    if user.guest_expires_at is not None:
        expires = min(expires, user.guest_expires_at)
    db.add(
        SessionRow(
            token_hash=security.hash_token(token),
            user_id=user.id,
            expires_at=expires,
            user_agent=(user_agent or "")[:400] or None,
            ip=(ip or "")[:64] or None,
        )
    )
    db.commit()
    return token


def session_user(db: DbSession, token: str | None, *, settings: Settings) -> User | None:
    if not token:
        return None
    now = _now()
    row = db.get(SessionRow, security.hash_token(token))
    if row is None or row.revoked_at is not None or row.expires_at <= now:
        return None

    user = db.get(User, row.user_id)
    if user is None or user.deleted_at is not None:
        return None
    if user.is_guest and user.guest_expires_at is not None and user.guest_expires_at <= now:
        return None

    # Rolling refresh: sessions stay alive while they are being used, but a
    # guest session can never outlive the guest row itself.
    dirty = False
    ttl = timedelta(days=settings.session_ttl_days)
    if row.expires_at - now < ttl / 2:
        row.expires_at = now + ttl
        if user.guest_expires_at is not None:
            row.expires_at = min(row.expires_at, user.guest_expires_at)
        dirty = True
    if user.last_seen_at < now - LAST_SEEN_THROTTLE:
        user.touch()
        dirty = True
    if dirty:
        db.commit()

    return user


def revoke_session(db: DbSession, token: str | None) -> None:
    if not token:
        return
    row = db.get(SessionRow, security.hash_token(token))
    if row is not None and row.revoked_at is None:
        row.revoked_at = _now()
        db.commit()


def find_member(db: DbSession, *, issuer: str, subject: str) -> User | None:
    return db.scalar(select(User).where(User.idp_issuer == issuer, User.zitadel_sub == subject))


def find_or_create_member(
    db: DbSession, *, issuer: str, subject: str, email: str | None, name: str | None
) -> User:
    """Just-in-time provisioning: the local row is a projection of the IdP user."""
    user = find_member(db, issuer=issuer, subject=subject)
    if user is not None:
        changed = False
        if email and user.email != email.strip().lower():
            user.email = email.strip().lower()
            changed = True
        if name and user.display_name != name.strip():
            user.display_name = name.strip()
            changed = True
        if changed:
            db.commit()
        return user

    user = User(
        kind=UserKind.member,
        idp_issuer=issuer,
        zitadel_sub=subject,
        email=email.strip().lower() if email else None,
        display_name=(name or email or "User").strip(),
    )
    db.add(user)
    db.commit()
    return user


def public_user(user: User) -> PublicUser:
    return PublicUser(
        id=str(user.id),
        name=user.display_name or "User",
        email=user.email or "",
        kind=user.kind,
    )
```

### A.6 `server/app/dependencies.py`

```python
import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from .config import Settings, get_settings
from .database import get_db
from .models import User
from .services import auth_services
from .services.zitadel import ZitadelClient


def current_user(
    request: Request,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    return auth_services.session_user(db, token, settings=settings)


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return user


def get_zitadel(settings: Settings = Depends(get_settings)) -> ZitadelClient:
    return ZitadelClient(
        issuer=settings.zitadel_issuer.rstrip("/"),
        client_id=settings.zitadel_client_id,
        http=httpx.Client(timeout=10.0),
    )
```

### A.7 `server/app/main.py`

```python
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

from . import mcp_server, mcp_tools  # noqa: F401  (mcp_tools registers the tools)
from .config import get_settings
from .routers import auth_router, health_router  # + domain routers

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """The host owns the session manager: a mounted app's lifespan never runs."""
    if not settings.mcp_enabled:
        yield
        return
    mcp_server.start()
    try:
        async with mcp_server.mcp.session_manager.run():
            yield
    finally:
        mcp_server.stop()


app = FastAPI(title="<App> API", version="0.1.0", lifespan=lifespan)


class RejectMCPGet:
    """Answer GET /mcp with 405 instead of holding an idle SSE stream open."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "GET" and scope["path"] == "/mcp":
            await Response("SSE stream is not supported.", status_code=405)(scope, receive, send)
            return
        await self.app(scope, receive, send)


# Added before CORS so CORS stays the outermost layer.
app.add_middleware(RejectMCPGet)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """The client reads {"error": "..."} - keep that shape for string details."""
    if isinstance(exc.detail, str):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=exc.headers)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        {"error": "Check the details you sent.", "details": exc.errors()},
        status_code=422,
    )


app.include_router(health_router.router)
app.include_router(auth_router.router)
# ... domain routers here ...

if settings.mcp_enabled:
    # Mounted last on purpose: Starlette tries routes in order, so every
    # /api/* route above wins and the MCP app only sees the rest.
    app.mount("/", mcp_server.mcp_mount)
```

### A.8 `server/app/routers/auth_router.py` (member-only core; guest hooks in §7)

```python
import hmac
import time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from sqlalchemy.orm import Session as DbSession

from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import current_user, get_zitadel, require_user
from ..models import User
from ..schemas.auth import LogoutResponse
from ..schemas.users import PublicUser
from ..services import auth_services
from ..services.security import (
    OAUTH_COOKIE,
    OAUTH_COOKIE_MAX_AGE,
    clear_cookie,
    create_pkce_pair,
    new_state_nonce,
    set_cookie,
    sign_payload,
    unsign_payload,
)
from ..services.zitadel import ZitadelClient, ZitadelError
from ..utils import local_path

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _start_login(request: Request, settings: Settings, zitadel: ZitadelClient) -> RedirectResponse:
    verifier, challenge = create_pkce_pair()
    state, nonce = new_state_nonce()
    payload = {
        "state": state,
        "nonce": nonce,
        "code_verifier": verifier,
        "next": local_path(request.query_params.get("next")),
        "iat": int(time.time()),
    }
    authorize_url = zitadel.authorize_url(
        state=state, nonce=nonce, code_challenge=challenge, redirect_uri=settings.zitadel_redirect_uri
    )
    response = RedirectResponse(authorize_url, status_code=302)
    set_cookie(
        response,
        OAUTH_COOKIE,
        sign_payload(payload, settings.app_secret),
        settings=settings,
        max_age=OAUTH_COOKIE_MAX_AGE,
    )
    return response


@router.get("/login")
def login_get(
    request: Request,
    settings: Settings = Depends(get_settings),
    zitadel: ZitadelClient = Depends(get_zitadel),
) -> RedirectResponse:
    """Sends the browser to the IdP."""
    return _start_login(request, settings, zitadel)


@router.post("/login")
def login_post(
    request: Request,
    settings: Settings = Depends(get_settings),
    zitadel: ZitadelClient = Depends(get_zitadel),
) -> RedirectResponse:
    return _start_login(request, settings, zitadel)


@router.post("/signup")
def signup(
    request: Request,
    settings: Settings = Depends(get_settings),
    zitadel: ZitadelClient = Depends(get_zitadel),
) -> RedirectResponse:
    """Signup happens inside the hosted IdP login."""
    return _start_login(request, settings, zitadel)


@router.get("/callback")
def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    zitadel: ZitadelClient = Depends(get_zitadel),
) -> RedirectResponse:
    failure = f"{settings.public_base_url}/login"
    payload = unsign_payload(
        request.cookies.get(OAUTH_COOKIE), settings.app_secret, max_age=OAUTH_COOKIE_MAX_AGE
    )

    if error:
        query = urlencode({"error": "Signing in was cancelled."})
        return RedirectResponse(f"{failure}?{query}", status_code=302)
    if (
        payload is None
        or not code
        or not state
        or not hmac.compare_digest(str(payload.get("state", "")), state)
    ):
        raise HTTPException(status_code=400, detail="Could not finish signing in. Please try again.")

    try:
        tokens = zitadel.exchange_code(
            code=code, code_verifier=payload["code_verifier"], redirect_uri=settings.zitadel_redirect_uri
        )
        id_token = tokens.get("id_token")
        if not id_token:
            raise ZitadelError("token response had no id_token")
        claims = zitadel.verify_id_token(id_token, nonce=payload["nonce"])
    except ZitadelError as exc:
        raise HTTPException(status_code=502, detail=f"Sign-in failed: {exc}") from exc

    subject = str(claims["sub"])
    issuer = settings.zitadel_issuer.rstrip("/")
    # Guest mode (optional, see master-plan §7): delete the throwaway guest row here.
    user = auth_services.find_or_create_member(
        db, issuer=issuer, subject=subject, email=claims.get("email"),
        name=claims.get("name") or claims.get("preferred_username"),
    )

    token = auth_services.create_session(
        db,
        user,
        settings=settings,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
    )
    response = RedirectResponse(local_path(str(payload.get("next"))), status_code=302)
    set_cookie(
        response,
        settings.session_cookie_name,
        token,
        settings=settings,
        max_age=settings.session_ttl_days * 24 * 3600,
    )
    clear_cookie(response, OAUTH_COOKIE, settings=settings)
    return response


@router.get("/me", response_model=PublicUser)
def me(user: User = Depends(require_user)) -> PublicUser:
    return auth_services.public_user(user)


@router.post("/logout")
def logout(
    request: Request,
    user: User | None = Depends(current_user),
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    zitadel: ZitadelClient = Depends(get_zitadel),
) -> Response:
    """Ends the local session and, for SSO members, the IdP session too.

    Without the IdP round-trip the IdP cookie survives, so the next SSO click
    silently signs the user back in.
    """
    token = request.cookies.get(settings.session_cookie_name)
    auth_services.revoke_session(db, token)
    logout_url = None
    if user is not None and user.zitadel_sub is not None:
        try:
            logout_url = zitadel.end_session_url(
                post_logout_redirect_uri=settings.zitadel_post_logout_uri
            )
        except (httpx.HTTPError, KeyError):
            # Never trap someone in the app because discovery is down.
            logout_url = None
    response = JSONResponse(LogoutResponse(logoutUrl=logout_url).model_dump())
    clear_cookie(response, settings.session_cookie_name, settings=settings)
    return response
```

### A.9 Client shell

`client/next.config.ts`:

```ts
import type { NextConfig } from "next";

// Where the FastAPI server lives. Same origin as far as the browser is
// concerned: everything under /api is proxied here.
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    return {
      // afterFiles: a real route handler under app/api/* would win, the rest
      // of /api goes to FastAPI.
      afterFiles: [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }],
    };
  },
};

export default nextConfig;
```

`client/proxy.ts` (Next 16 route guard — not `middleware.ts`):

```ts
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/garden", "/settings"]; // update per app

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const guarded = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!guarded) return NextResponse.next();
  if (req.cookies.get("app_session")?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|assets|favicon|icon|.*\\..*).*)"],
};
```

Keep the cookie name in `proxy.ts` in sync with `SESSION_COOKIE_NAME` (in
production on Firebase Hosting that is `__session`).

`client/lib/api-client.ts`:

```ts
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?next=${next}`;
  }
  return res;
}
```

Login page pattern:

```tsx
<a className="btn btn-primary" href={`/api/auth/login?next=${encodeURIComponent(next)}`}>
  Continue with SSO
</a>
```

Logout pattern:

```ts
const res = await fetch("/api/auth/logout", { method: "POST" });
const data = (await res.json()) as { logoutUrl: string | null };
window.location.href = data.logoutUrl ?? "/login";
```

### A.10 `server/tests/conftest.py` (isolation pattern)

```python
import ssl
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401  (register models on Base.metadata)
from app.config import get_settings
from app.database import Base, get_db
from app.dependencies import get_zitadel
from app.main import app
from app.models import User
from app.models.enums import UserKind
from app.services.auth_services import create_session

settings = get_settings()
SCHEMA = f"app_test_{uuid.uuid4().hex[:8]}"
assert settings.db_schema != SCHEMA, "refusing to run tests against the live schema"


def _connect_args() -> dict:
    if settings.ssl_required:
        return {"ssl_context": ssl.create_default_context()}
    return {}


# schema_translate_map instead of SET search_path on purpose: session state is
# unreliable through Neon's pooler (transaction mode) and a leaked search_path
# would leave other clients pointing at this schema after it is dropped.
test_engine = create_engine(
    settings.sqlalchemy_url,
    connect_args=_connect_args(),
    execution_options={"schema_translate_map": {settings.db_schema: SCHEMA}},
)

TestingSession = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _schema() -> Iterator[None]:
    with test_engine.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
        connection.commit()
    Base.metadata.create_all(test_engine)
    yield
    with test_engine.connect() as connection:
        connection.execute(text(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE'))
        connection.commit()
    test_engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(_schema: None) -> Iterator[None]:
    yield
    tables = ", ".join(f'"{SCHEMA}"."{table.name}"' for table in Base.metadata.tables.values())
    with test_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def db() -> Iterator[DbSession]:
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: DbSession) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _make_user(
    db: DbSession, *, kind: UserKind = UserKind.member, name: str = "Ada",
    email: str | None = "ada@example.com", zitadel_sub: str | None = None,
) -> User:
    user = User(kind=kind, display_name=name, email=email, zitadel_sub=zitadel_sub)
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def make_user():
    return _make_user


@pytest.fixture
def sign_in(db: DbSession, client: TestClient):
    def _sign_in(user: User) -> str:
        token = create_session(db, user, settings=settings)
        client.cookies.set(settings.session_cookie_name, token)
        return token

    return _sign_in


class FakeZitadel:
    """Records what would have been sent to the IdP, without touching the network."""

    def __init__(self, claims: dict | None = None) -> None:
        self.claims = claims or {}
        self.token_requests: list[dict] = []
        self.authorize_requests: list[dict] = []
        self.verify_calls: list[dict] = []
        self.end_session_calls: list[dict] = []

    def authorize_url(self, *, state, nonce, code_challenge, redirect_uri):
        self.authorize_requests.append(
            {"state": state, "nonce": nonce, "code_challenge": code_challenge, "redirect_uri": redirect_uri}
        )
        return f"https://idp.test/authorize?state={state}"

    def exchange_code(self, *, code, code_verifier, redirect_uri):
        self.token_requests.append({"code": code, "code_verifier": code_verifier, "redirect_uri": redirect_uri})
        return {"id_token": "fake.id.token", "access_token": "fake-access"}

    def verify_id_token(self, id_token: str, *, nonce: str):
        self.verify_calls.append({"id_token": id_token, "nonce": nonce})
        return {**self.claims, "nonce": nonce}

    def end_session_url(self, *, id_token_hint=None, post_logout_redirect_uri=None):
        self.end_session_calls.append(
            {"id_token_hint": id_token_hint, "post_logout_redirect_uri": post_logout_redirect_uri}
        )
        return "https://idp.test/end_session"


@pytest.fixture
def fake_idp() -> FakeZitadel:
    return FakeZitadel()


@pytest.fixture
def idp_client(client: TestClient, fake_idp: FakeZitadel) -> TestClient:
    app.dependency_overrides[get_zitadel] = lambda: fake_idp
    return client


# External APIs follow the same shape: a Fake<Vendor> class recording calls +
# returning canned data, a get_<vendor> override, and a <vendor>_client fixture.


@pytest.fixture
def mcp_owner(make_user, db: DbSession) -> User:
    return make_user(db)


@pytest.fixture
def mcp_env(monkeypatch, mcp_owner: User) -> User:
    """The MCP tools run against the throwaway schema as a static-key owner."""
    import app.mcp_server as mcp_server

    monkeypatch.setattr(mcp_server, "_session_factory", TestingSession)
    monkeypatch.setattr(settings, "mcp_api_key", "test-mcp-key")
    monkeypatch.setattr(settings, "mcp_owner_email", mcp_owner.email)
    return mcp_owner


@pytest.fixture
def mcp_client(client: TestClient, mcp_env: User) -> TestClient:
    return client
```

### A.11 `server/app/models/users.py` and `sessions.py`

```python
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Enum, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base
from .enums import UserKind


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("idp_issuer", "zitadel_sub", name="uq_users_idp_subject"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    kind: Mapped[UserKind] = mapped_column(
        Enum(UserKind, name="user_kind", values_callable=lambda e: [m.value for m in e]),
        default=UserKind.member,
        nullable=False,
    )
    # Source of truth for authentication is the IdP; this is the local link to it.
    zitadel_sub: Mapped[str | None] = mapped_column(String(64), index=True)
    idp_issuer: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320))
    display_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    guest_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def is_guest(self) -> bool:
        return self.kind is UserKind.guest

    def touch(self) -> None:
        self.last_seen_at = utcnow()


class Session(Base):
    """Server-side session. Only the sha256 of the cookie token is stored."""

    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(400))
    ip: Mapped[str | None] = mapped_column(String(64))
```

### A.12 `server/app/mcp_server.py`

```python
"""The MCP server, mounted at /mcp.

Accepts the owner's static MCP_API_KEY, and also validates Zitadel access
tokens (issuer + JWKS signature), mapping their subject to a member through
(idp_issuer, zitadel_sub), so OAuth-capable MCP hosts can sign users in.
"""

import secrets
from uuid import UUID

import anyio
import jwt
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from starlette.applications import Starlette
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from .config import get_settings
from .database import SessionLocal
from .models import User
from .models.enums import UserKind

settings = get_settings()

# Tests point this at a session bound to the throwaway test schema.
_session_factory = SessionLocal
_jwks_client: jwt.PyJWKClient | None = None


def get_session() -> DbSession:
    return _session_factory()


def _owner(db: DbSession) -> User | None:
    email = settings.mcp_owner_email.strip().lower()
    if not email:
        return None
    return db.scalar(
        select(User).where(User.email == email, User.kind == UserKind.member, User.deleted_at.is_(None))
    )


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(settings.mcp_jwks_endpoint)
    return _jwks_client


def _access(user: User, token: str) -> AccessToken:
    return AccessToken(
        token=token,
        client_id=str(user.id),
        scopes=[],
        resource=settings.mcp_resource_url,
        subject=str(user.id),
    )


class AppTokenVerifier(TokenVerifier):
    """The owner's static key, or an IdP JWT that maps to a member."""

    async def verify_token(self, token: str) -> AccessToken | None:
        expected = settings.mcp_api_key
        if expected and secrets.compare_digest(token.encode(), expected.encode()):
            return await anyio.to_thread.run_sync(self._owner_access, token)
        return await anyio.to_thread.run_sync(self._member_access, token)

    def _owner_access(self, token: str) -> AccessToken | None:
        with get_session() as db:
            user = _owner(db)
        return _access(user, token) if user is not None else None

    def _member_access(self, token: str) -> AccessToken | None:
        audience = settings.mcp_audience.strip()
        try:
            signing_key = _jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=settings.zitadel_issuer.rstrip("/"),
                audience=audience or None,
                options={"require": ["exp", "sub"], "verify_aud": bool(audience)},
            )
        except jwt.PyJWTError:
            return None

        subject = claims.get("sub")
        if not subject:
            return None
        with get_session() as db:
            user = db.scalar(
                select(User).where(
                    User.idp_issuer == settings.zitadel_issuer.rstrip("/"),
                    User.zitadel_sub == subject,
                    User.kind == UserKind.member,
                    User.deleted_at.is_(None),
                )
            )
        return _access(user, token) if user is not None else None


def current_user(db: DbSession) -> User:
    """The member the caller authenticated as; the static key is the owner."""
    access = get_access_token()
    if access is None or not access.subject:
        raise RuntimeError("MCP request has no authenticated caller.")
    try:
        user_id = UUID(access.subject)
    except ValueError as exc:
        raise RuntimeError("MCP access token carries an invalid subject.") from exc
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise RuntimeError("MCP caller no longer exists.")
    return user


mcp = MCPServer(
    "<app>",
    title="<App>",
    version="0.1.0",
    instructions="Describe for the model what the tools act on and what cannot be undone.",
    token_verifier=AppTokenVerifier(),
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(settings.zitadel_issuer.rstrip("/")),
        resource_server_url=AnyHttpUrl(settings.mcp_resource_url),
        validate_token_resource=True,
    ),
)


class MCPMount:
    """Stable ASGI mount target; start() swaps in a fresh app per lifespan.

    streamable_http_app() builds a session manager that can only run() once,
    so the app is rebuilt for every lifespan (each uvicorn start - and each
    TestClient in tests).
    """

    app: Starlette | None = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.app is None:
            await Response("MCP is not running.", status_code=503)(scope, receive, send)
            return
        await self.app(scope, receive, send)


mcp_mount = MCPMount()


def start() -> None:
    """Build the streamable HTTP app; call before session_manager.run()."""
    mcp_mount.app = mcp.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=settings.mcp_allowed_host_list,
            allowed_origins=settings.mcp_allowed_origin_list,
        ),
    )


def stop() -> None:
    mcp_mount.app = None
```

### A.13 `server/app/mcp_tools.py` (pattern)

```python
"""MCP tools: thin wrappers over app/services/*.

Sync def tools run on a worker thread in mcp v2, so the sync SQLAlchemy
services are called directly (no FastAPI dependency layer involved). Every
tool runs as the member the verifier resolved for the request.
"""

from typing import Annotated

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field

from .mcp_server import current_user, get_session, mcp
from .models import User
from .services import items_services

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
MUTATING = ToolAnnotations(read_only_hint=False, open_world_hint=False)
DESTRUCTIVE = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)

ItemId = Annotated[str, Field(description="The item's id.")]
Body = Annotated[str, Field(min_length=1, description="What to write.")]


def _owned(db, item_id: str, user: User):
    item = items_services.get_item(db, item_id, user.id)
    if item is None:
        raise ToolError("Item not found.")
    return item


@mcp.tool(annotations=READ_ONLY)
def list_items() -> list[dict]:
    """List every item belonging to the signed-in user."""
    with get_session() as db:
        user = current_user(db)
        return [
            items_services.item_public(item).model_dump(mode="json")
            for item in items_services.list_items(db, user.id)
        ]


@mcp.tool(annotations=MUTATING)
def create_item(body: Body) -> dict:
    """Create an item for the signed-in user."""
    text = body.strip()
    if not text:
        raise ToolError("Write something first.")
    with get_session() as db:
        user = current_user(db)
        item = items_services.create_item(db, owner=user, body=text)
        return items_services.item_public(item).model_dump(mode="json")


@mcp.tool(annotations=DESTRUCTIVE)
def delete_item(item_id: ItemId) -> dict:
    """Delete an item. This cannot be undone."""
    with get_session() as db:
        user = current_user(db)
        items_services.delete_item(db, _owned(db, item_id, user))
        return {"ok": True}
```

### A.14 `server/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
# Built with context = ./server and deployed to Cloud Run, which injects PORT
# and expects the app to listen on 0.0.0.0.

# --- Stage 1: resolve and install into /app/.venv ---------------------------
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Manifest first: a source-only change reuses the dependency layer.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY . .
# --no-editable bakes `app` (including app/data/*.json) into the venv, so the
# runtime image does not depend on the builder's directory layout.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# --- Stage 2: runtime --------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --create-home app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
# Needed at runtime for schema changes and maintenance scripts, e.g.
#   docker run --rm -e DATABASE_URL=... <image> alembic upgrade head
COPY --from=builder --chown=app:app /app/alembic /app/alembic
COPY --from=builder --chown=app:app /app/alembic.ini /app/alembic.ini
COPY --from=builder --chown=app:app /app/scripts /app/scripts

USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

### A.15 `.github/workflows/cd.yml` (reference shape)

```yaml
name: CD Pipeline

on:
  push:
    branches:
      - main
    paths:
      - 'server/**'

env:
  DOCKERHUB_IMAGE: ${{ secrets.DOCKERHUB_USERNAME }}/${{ vars.APP_NAME }}
  GCP_REGION: asia-southeast1
  CLOUD_RUN_SERVICE: ${{ vars.APP_NAME }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: tag
        run: echo "IMAGE_TAG=${GITHUB_SHA::7}" >> $GITHUB_OUTPUT
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./server
          push: true
          tags: |
            ${{ env.DOCKERHUB_IMAGE }}:${{ steps.tag.outputs.IMAGE_TAG }}
            ${{ env.DOCKERHUB_IMAGE }}:latest
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: ${{ env.CLOUD_RUN_SERVICE }}
          region: ${{ env.GCP_REGION }}
          image: ${{ env.DOCKERHUB_IMAGE }}:${{ steps.tag.outputs.IMAGE_TAG }}
```

---

*Reference implementation: `solace-garden`. Deep-dives: `docs/mcp.md`,
`docs/guests-and-cleanup.md`, and the repo's `AGENTS.md`.*
