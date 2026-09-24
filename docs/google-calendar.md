# Google Calendar

Two-way sync is built. Events created or edited in Neoma are pushed to the
owner's Google Calendar (best-effort), and edits made in Google are pulled back
on the next sync. Google is never asked to invite anyone on Neoma's behalf:
assignments and group sessions are announced by Neoma's own email (Resend) with
an `.ics` attached and an **Add to Google Calendar** button.

Group events are pushed once, without attendees, so they land on the
organizer's calendar only; the other members hear about the session through
Neoma's email. Each row carries one `google_event_id`; pulling skips an id
already mapped locally, so the API copy never shows up twice. Copies people add
by hand (the email button or the `.ics`) carry a `Neoma id: <uuid>` marker in
their description — the pull skips an item whose marker points at an existing
Neoma row, so those copies are not imported as duplicates.

Tasks with a due date sync the same way, using the same mechanic: the task
becomes a Google event (30-minute block at the due time) organised by the first
connected person involved — creator first, then assignees. Each task carries its
own `reminder_minutes`, which sets the Google notification; completing a task
retitles the event `✓ …` and silences it. Dragging the event in Google moves the
task's due date on the next sync. Tasks without a due date never reach Google.

The client syncs in the background once per page load, and at most once a day
per user (`lastSyncAt` is not today, local time), right after connecting. The
**Sync now** button always works. `auto=true` calls are collapsed server-side if
another one happened in the last 15 minutes, so two open tabs produce one sync.

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
   - **Scopes**: add `.../auth/calendar.events` (create/update/delete events and
     manage attendees this app made). The integration also requests `openid` and
     `email` so the account's address can be shown in Settings.
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

```dotenv
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/callback   # the default
```

Then apply the migration: `uv run --directory server alembic upgrade head`.

## 3. How it works

- `GET /api/google/connect` → 302 to Google with a signed `state` bound to the
  session (`access_type=offline`, `prompt=consent`, scope `calendar.events`).
- `GET /api/google/callback` → verifies `state`, exchanges the code, stores the
  refresh token (encrypted at rest with a key derived from `APP_SECRET`), then
  redirects to `/settings?google=connected`.
- **Push** happens in `event_services` and `task_services` after
  create/update/delete. It is best-effort: a Google outage logs a warning and
  never fails the request. Every write sends `sendUpdates=none`, and no body
  carries `attendees`, so Google never emails a guest.
- **Notices** (Resend, best-effort): a task assignment or due-date move and a
  group session create/move/cancel render `task.html` / `session.html` with the
  `.ics` attached and an Add-to-Google button. Recipients can switch these off
  per kind in Settings; the actor is never emailed, and cancellations only go to
  people who received the original notice.
- **Pull** runs through `google_services.sync_account`: an initial window of
  90 days back / 1 year ahead, then incremental via `events.list` `syncToken`
  (410 → full resync). Last write wins on `updated`; cancelled events delete
  their local twin; a cancelled task event only drops the link, never the task.
  Pulled events become personal Neoma events, unless their id already belongs
  to a task.
- **Tokens**: refreshed on demand; `invalid_grant` disconnects the account.
  Rotating `APP_SECRET` invalidates stored tokens (users reconnect).
- **Scheduling**: `uv run --directory server python scripts/sync_google.py
  [--dry-run]` or `POST /api/maintenance/sync-google` with the
  `X-Cleanup-Secret` header. `POST /api/google/sync` is the signed-in "Sync now"
  button; `POST /api/google/sync?auto=true` is the client's daily background
  call.
- `POST /api/google/disconnect` removes the account; the events already on
  Google are left in place.

## 4. Production notes

- Sensitive scopes (`calendar.events`) require Google **app verification** if
  anyone outside your test users signs in; until then the 100-test-user cap
  applies. The consent screen shows an "unverified app" warning.
- Set the production redirect URI in the same OAuth client and in
  `GOOGLE_REDIRECT_URI`.
- Group event and task notices do not depend on Google at all: they go to the
  member's Neoma email. The Google copy belongs to the organizer, whose task
  reminder setting drives Google's popup; people who add the `.ics` or use the
  button get the reminder baked into the file. Copies added by hand are ignored
  on the next pull thanks to the `Neoma id:` marker.
- The refresh token is encrypted at rest; treat `APP_SECRET` like a password.
