# iTa'leem (IIUM Moodle) integration

Neoma mirrors a student's own iTa'leem courses, deadlines and materials. The
mirror is **read-only**: Neoma never submits assignments, posts to forums,
messages anyone or changes the Moodle profile.

## Connect (one paste)

1. Sign in at <https://italeemc.iium.edu.my> (CAS + MFA).
2. In Neoma: **Settings → iTa'leem → Open iTa'leem connect page**. The page
   opens `admin/tool/mobile/launch.php?service=moodle_mobile_app&urlscheme=neoma&confirmed=1`.
3. Right-click **"click here to launch the app"** → **Copy link**.
4. Paste it into the **Connect link** field and press **Connect iTa'leem**.

The link is a `neoma://token=<base64>` URL containing:

```
md5(wwwroot + passport) ::: wstoken ::: privatetoken
```

`POST /api/moodle/token` decodes it, keeps only `wstoken`, validates it with
`core_webservice_get_site_info`, and stores it Fernet-encrypted (key derived
from `APP_SECRET`, purpose `moodle`). The token is never returned to the
browser, never logged, and never placed in a note body.

Why not OAuth: iTa'leem uses CAS SSO with MFA, so a password/token login would
require the student's credentials. The mobile launch flow is the only official
browser handshake, and IIUM enables it for the Moodle app. The site reports
Moodle 5.2-era core (`2026042000.02`).

## What gets mirrored

| Moodle call | Neoma |
|---|---|
| `core_webservice_get_site_info` | validates the token; stores `release` + `functions` |
| `core_enrol_get_users_courses` | `moodle_courses` + one vault folder per course |
| `mod_assign_get_assignments` | `moodle_assignments` + tasks (`assign:<id>`) |
| `core_calendar_get_action_events_by_timesort` | quiz/other closes as tasks (`italeem-event:<id>`) |
| `core_course_get_contents` | cached outline, fetched lazily per course |
| `gradereport_user_get_grade_items` | cached grades tab |
| `mod_assign_get_submission_status` | submitted/draft/not-submitted state (10 min TTL) |
| `mod_forum_get_forums_by_courses` | forum names/types for scheduled announcement emails |
| `mod_forum_get_forum_discussions` | new announcements and reply counts |
| `pluginfile.php` + `?token=` | "Save to vault": R2 copy + note + text extraction |

Assignment due dates win over the calendar's `assign` events (those are
skipped) so a deadline never appears twice. Quiz `close` events become tasks;
`open` events are ignored. Imported tasks remind 24 h before.

## Sync rules

- Deadlines sync on connect, once a day from the app shell, on **Sync now**,
  and via `POST /api/maintenance/sync-moodle` (`X-Cleanup-Secret`).
- Moodle wins on title/due/description. Local status (`todo/doing/done`)
  survives.
- Editing an imported task detaches it (`external_uid` cleared) and records the
  UID in `moodle_accounts.ignored_uids`, so a later sync neither overwrites nor
  recreates it. Deleting a mirrored task does the same.
- An assignment that vanishes from Moodle deletes its still-open task; a
  completed one is detached instead.
- Unenrolled courses are archived, not deleted; their folders, notes and tasks
  stay.
- Disconnect removes the account, courses, assignments and mirrored tasks
  (plus their Google twins). Saved vault notes stay.

## Files

`POST /api/moodle/courses/{id}/save` takes `{cmid, fileIndex}`. The server
looks the URL up in the **cached outline** — it never accepts a URL from the
client — appends the token, caps the download at 50 MB, stores the bytes in R2
and creates a personal note in the course folder. `extract_services` then makes
PDFs/decks/docs searchable ("found in file · page N") and the note opens in the
existing PDF/Office viewers, study reader and flashcard flow.

Saved copies are not replaced automatically when the Moodle file changes: a new
PDF version would invalidate page-anchored highlights. Save again to make a
fresh copy if needed.

## Submission status and grades

`GET /api/moodle/courses/{id}/assignments` refreshes `submitted` / `draft` /
`not submitted` for that course's assignments through
`mod_assign_get_submission_status` (10-minute TTL; `?refresh=1` forces it) and
returns the same rows the course page uses. The MCP tool `italeem_assignment`
takes `refresh: true` for a fresh lookup. A single assignment failing does not
break the page; an invalid token still asks for a reconnect.

`GET /api/moodle/courses/{id}/grades` refreshes the grade items (6-hour TTL).
Neoma never auto-completes a task from a Moodle submission; the status is a
separate chip.

## Scheduled update emails

`POST /api/maintenance/sync-moodle?notify=true` (with `X-Cleanup-Secret`) does
the normal deadline sync and then scans for things the user has not been told
about yet:

- new announcements and forum posts (the full first post is included);
- new replies, detected through `numreplies` (IIUM's
  `mod_forum_get_discussion_posts` call currently returns an access error on the
  news forums, so reply text is best-effort and the email always links to the
  discussion);
- new files in a course outline;
- new or changed item-level grades (`itemtype=mod`/`manual`; course totals and
  hidden grades are skipped);
- imported deadlines, even if the app opened and synced them first.

The state lives in `moodle_accounts.seen` (JSONB) and is keyed by discussion ID,
file UID, grade item fingerprint and task UID. **The first scheduled scan after
connecting is a silent baseline** — per course and per forum — so it never
emails an existing backlog. A new enrolment is baselined the same way. One
batched email is sent per account per scan; the batch key also makes a repeated
run idempotent. `NotificationKinds.italeem` controls it, and the unsubscribe
endpoint turns it off with the other reminder kinds. Run
`alembic upgrade head` before deploying the code; the hand-written migration
adds the column.

Run it every two hours from Cloud Scheduler. Use the **direct Cloud Run URL**
(Firebase Hosting rewrites are not meant for a multi-course scan) and the
timezone `Asia/Kuala_Lumpur`:

```bash
gcloud scheduler jobs create http neoma-sync-italeem \
  --location=asia-southeast1 \
  --schedule="0 */2 * * *" \
  --time-zone="Asia/Kuala_Lumpur" \
  --uri="https://<cloud-run-url>/api/maintenance/sync-moodle?notify=true" \
  --http-method=POST \
  --headers="X-Cleanup-Secret=<secret>" \
  --attempt-deadline=300s \
  --max-retry-attempts=3 \
  --min-backoff=30s \
  --max-backoff=300s
```

GitHub Actions is deliberately not used for this: on a public repository,
scheduled workflows are auto-disabled after 60 days without repository
activity, which would silently stop the emails. A plain `workflow_dispatch`
workflow is fine as a manual button; the scheduler must not depend on it.

The scan makes one forums call, one discussion call per forum with posts, one
outline call per active course and one grade call per course every six hours.
It is sequential, so keep the endpoint on the direct Cloud Run URL and watch
the run count as users are added.

## MCP tools

The `/mcp` server exposes the member's own mirror:

- `italeem_status`, `italeem_courses`, `italeem_deadlines`
- `italeem_course`, `italeem_files`, `italeem_assignment`, `italeem_grades`
- `italeem_sync` (mutating, no-op inside 60 s)
- `italeem_save_file` (mutating, uses the same server-side resolver)

Read tools answer from the mirror. `italeem_deadlines` refreshes when the last
sync is older than 10 minutes and falls back to cached rows with
`stale: true` + `warning` instead of failing the tool call. Imported deadlines
are ordinary Neoma tasks, so `list_tasks`, `upcoming` and `daily_brief` already
see them.

## Failure modes

| Symptom | Meaning |
|---|---|
| `Invalid token - token not found` | token revoked or the Moodle service changed → reconnect |
| `no export` / HTML login page | the request lost the token or Cloudflare challenged it → retry, then reconnect |
| `accessexception` | a function is not in the site's mobile service → that feature hides |
| timeout / 5xx | cached data stays; the next sync retries |
| `Invalid authentication` on a file | the token died between sync and save → reconnect |
| `$CFG->dataroot is not configured properly` | IIUM is serving a bad backend node → Neoma retries twice; if it persists, report it to `italeem_support@iium.edu.my` |

Tokens have no expiry and survive password changes; Moodle only deletes them
when the account is deleted. Revocation is admin-side, so treat the token like a
password and disconnect if it may have leaked.

The web-service endpoint is occasionally served by a Moodle node whose
`moodledata` is inaccessible (`Fatal error: $CFG->dataroot is not configured
properly`). `MoodleClient.call` retries 500/502/503/504 twice with backoff; a
failed outline returns the cached one with `outlineError` instead of failing the
whole course page. This is an IIUM infrastructure problem, not a Neoma bug.

## Spike

`scripts/moodle_spike.py` dumps the exact shapes (site info, courses,
assignments, outline, events) and optionally downloads the first file:

```bash
uv run --directory server python scripts/moodle_spike.py --link "neoma://token=..." --download
```

Fixtures go to `server/tests/fixtures/moodle/`; the token is never written.
