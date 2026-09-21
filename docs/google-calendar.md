# Adding Google Calendar (on hold — the setup walkthrough)

The app ships with the parts that need no Google account: **Add to Google**
template links on every event and a whole-calendar **.ics export**. Two-way sync
is deliberately not built yet; this is the exact path to add it later.

## 1. Google Cloud setup

1. **Create a project** — <https://console.cloud.google.com> → project picker →
   *New project*. Name it something like `neoma-calendar`. Wait for it to be
   selected.
2. **Enable the API** — *APIs & Services → Library* → search **Google Calendar
   API** → *Enable*. (Billing is not required for this API at normal student
   volumes.)
3. **Configure the consent screen** — *APIs & Services → OAuth consent screen*:
   - User type: **External** (or **Internal** if everyone is in one Workspace).
   - App name (`Neoma`), support email, developer contact email.
   - **Scopes**: add `.../auth/calendar.events` (create/update/delete events this
     app made) and optionally `.../auth/calendar.readonly` if you want to read
     events the user already has.
   - While the app is in **Testing**, add every Google account you will sign in
     with under *Test users* (max 100). No verification is needed for this.
4. **Create the OAuth client** — *Credentials → Create credentials → OAuth
   client ID* → **Web application**:
   - Authorised redirect URIs:
     - `http://localhost:8000/api/google/callback` (dev)
     - `https://<your-api-host>/api/google/callback` (production)
   - Save the **Client ID** and **Client secret**.

> ### The OAuth client does *not* go in the browser
> The secret stays in `server/.env`; `/api/*` is the only origin the browser
> talks to.

## 2. Server env

Add to `server/.env` (and document in `.env.example`):

```dotenv
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/callback   # defaults to this
```

## 3. Server implementation (when you pick it up)

1. **Migration** — add two tables:
   - `google_accounts`: `id`, `user_id` (unique, cascade), `google_sub`,
     `email`, `refresh_token` (encrypt at rest), `access_token`,
     `access_token_expires_at`, `sync_token` (incremental pull cursor),
     `calendar_id` (default `primary`), `last_sync_at`, `created_at`.
   - `events.google_event_id` (nullable, indexed) so a local event maps to its
     Google twin.
2. **OAuth dance** (`services/google_services.py` + `routers/google_router.py`):
   - `GET /api/google/connect` → 302 to
     `https://accounts.google.com/o/oauth2/v2/auth` with
     `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`,
     `scope=.../auth/calendar.events`, `state` signed exactly like the Zitadel
     login handshake (`services/security.py:sign_payload`).
   - `GET /api/google/callback` → verify `state`, exchange the code at
     `https://oauth2.googleapis.com/token`, store the refresh token, then
     redirect to `/settings?google=connected`.
3. **Push (local → Google)**: in `event_services`, after create/update/delete,
   best-effort `events.insert` / `events.patch` / `events.delete` through one
   `google_services.push_event()`; never fail the user's request if Google is
   down (log and retry on the next sync). Store `google_event_id`.
4. **Pull (Google → local)**: `events.list` with `syncToken` for incremental
   changes (full sync when the token is rejected with 410). Map by
   `google_event_id`; last-write-wins on `updated`. Respect deleted/tentative
   events.
5. **Tokens**: refresh with the stored refresh token when
   `access_token_expires_at` is near; keep the refresh token server-side only.
6. **Schedule it**: reuse the `send_reminders.py` pattern — one service
   function, a CLI, and a secret-header endpoint under `/api/maintenance/`.

## 4. Client

- The Settings card already has the connect/disconnect shape; point it at
  `/api/google/connect` and read `settings.google.status` (already stored).
- Keep *Add to Google* and *Export .ics* as the no-account path.

## 5. Production notes

- Sensitive scopes (`calendar.events`) require Google **app verification** if
  anyone outside your test users signs in; until then the 100-test-user cap
  applies. The consent screen shows an "unverified app" warning.
- Set the production redirect URI in the same OAuth client.
- Store the refresh token encrypted (e.g. `cryptography.fernet` with a key from
  env); treat it like a password.
