# Google Calendar

Two-way sync is built. Events created or edited in Neoma are pushed to the
owner's Google Calendar (best-effort), edits made in Google are pulled back on
the next sync, and Google sends the reminders — Neoma does not need its own
notification path for synced events.

Group events are delivered by Google itself: the event is pushed once, with the
other group members as attendees, so Google emails the invitations and puts it
on their calendars. Each row carries one `google_event_id`; pulling skips an id
already mapped locally, so an invitation never shows up twice.

Tasks with a due date sync the same way, using the same mechanic: the task
becomes a Google event (30-minute block at the due time) organised by the first
connected person involved — creator first, then assignees — with the other
people as attendees. Each task carries its own `reminder_minutes`, which sets
the Google notification; completing a task retitles the event `✓ …` and
silences it. Dragging the event in Google moves the task's due date on the next
sync. Tasks without a due date never reach Google.

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
  never fails the request.
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
- Group event and task invitations assume a member's Neoma email is their
  Google address; if it is not, they still see the item in Neoma. A task's
  reminder setting applies to the organizer's copy; attendees get their own
  Google default notifications, and the invitation email itself is a ping.
- The refresh token is encrypted at rest; treat `APP_SECRET` like a password.
