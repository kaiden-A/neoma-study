# TODO: Neoma emails replace Google Calendar invitations

Decided: tasks **and** group events stop using Google invitations. Google never
sends mail for Neoma again; Neoma sends its own branded Resend email with a
`.ics` attachment and an "Add to Google Calendar" button. Task due-date changes
also notify assignees.

## 1. Google side: stop inviting

- [ ] `server/app/services/google_services.py`
  - [ ] `_task_body`: drop the `attendees` key.
  - [ ] `_event_body`: drop the `attendees` key.
  - [ ] `sendUpdates`: change `"all"` to `"none"` on insert/patch/delete so
        Google stops emailing (including when old attendees are removed).
  - [ ] Delete now-dead `_task_attendance` / `_attendee_emails` (keep
        `_task_involved` for organizer selection).
  - [ ] Leave already-sent invitations alone: patching without the `attendees`
        field keeps existing guests, so no cancellation spam.
- [ ] `_apply_item`: duplicate guard (see section 3).

## 2. Emails (Resend)

- [ ] `server/app/services/email_services.py`
  - [ ] `send_email` + `_deliver`: accept `attachments: list[dict] | None`
        (Resend `attachments: [{filename, content: base64}]`).
  - [ ] `send_task_assignment(...)` — assignees on create / newly added.
  - [ ] `send_task_moved(...)` — when `dueAt` changes.
  - [ ] `send_session_notice(...)` — group event created / moved / cancelled.
  - [ ] Rules: skip the actor and users without email; honour the recipient's
        settings (`kinds.assigned` for tasks, `kinds.sessions` for events);
        best-effort, never fail the request.
  - [ ] Dedupe keys (email_log):
        `assigned:{task}:{user}`,
        `task:{task}:{user}:moved:{dueMs}`,
        `session:{event}:{user}:created`,
        `session:{event}:{user}:moved:{startMs}`,
        `session:{event}:{user}:cancelled`.
- [ ] Templates `server/app/templates/emails/` (extend `base.html`):
  - [ ] `task.html|txt`: heading, group, due date/time, priority, description,
        "Open in Neoma" CTA, "Add to Google Calendar" button, footer note about
        the attached `.ics` and notification settings.
  - [ ] `session.html|txt`: same shape for scheduled/moved; a cancelled variant
        with no attachment.
- [ ] `server/app/services/ics_services.py`
  - [ ] `task_block`: use the task's own `reminder_minutes` (not the 60-minute
        default) so the attached alarm matches the Reminder setting.
  - [ ] Add a `neoma_id` marker line to `event_block` / `task_block`
        descriptions (see section 3).
  - [ ] `google_url(...)`: include the same marker in `details`.

## 3. Duplicate prevention (required)

Invitations used to share one `google_event_id`, so pull skipped them. A copy
added by hand (button or `.ics`) is a new Google event and would be imported as
a duplicate on the next sync.

- [ ] Marker format `Neoma id: <uuid>` in the description of everything the
      button/`.ics` produces (API-pushed bodies stay marker-free).
- [ ] `_apply_item`: skip items whose description carries a marker for an
      existing Neoma row (event or task).

## 4. Hooks

- [ ] `server/app/services/task_services.py`
  - [ ] `create_task`: email all new assignees after commit.
  - [ ] `update_task`: capture assignee ids before `_apply_assignees`; email
        only newly added; if `dueAt` changed, email `task_moved` to the current
        assignees.
  - [ ] `duplicate_task`: treat the copy's assignees as a new assignment.
  - [ ] `postpone_task`: goes through the due-date change path.
- [ ] `server/app/services/event_services.py`
  - [ ] `create_event`: group events email the other members.
  - [ ] `update_event`: time change (`startsAt`/`endsAt`) emails a "moved"
        notice.
  - [ ] `delete_event`: cancellation notice to members who were notified
        (check `email_log` for a prior session key).
  - [ ] Personal events and events without a start never email.

## 5. Tests

- [ ] Update the two Google tests that assert `attendees`
      (`test_group_events_invite_members`, `test_group_task_invites_assignees`)
      to assert no attendees and `sendUpdates="none"`.
- [ ] Extend the `sent_emails` fake (`server/tests/test_groups.py:17`, or move
      to `conftest.py`) to accept `attachments`.
- [ ] New cases: assignment email per assignee; self-assignment skipped;
      setting-off skipped; dedupe on repeat; `.ics` attachment present and
      parses; Add-to-Google link present with marker; task moved email;
      session created/moved/cancelled; pull skips marker copies.

## 6. Docs and copy

- [ ] `docs/google-calendar.md`: delivery model is now "Neoma email + .ics +
      Add to Google"; no Google attendees/invitations; note the marker.
- [ ] `AGENTS.md` calendar bullet: tasks/group events notify by email, Google
      pushes are invite-free.
- [ ] `client/app/(app)/settings/page.tsx`: the Google card help text
      ("Group events invite the other members…") is no longer true.
- [ ] Verify: `ruff`, `pyright`, `pytest`, client `lint`/`typecheck`/`build`.

## Notes

- Digest/scheduler gap is out of scope: Cloud Scheduler is not enabled and
  nothing hits `POST /api/maintenance/send-reminders`, so daily digests still
  do not run in production.
- Reminder semantics: the organizer's Google copy keeps `reminders.overrides`;
  people who add the `.ics`/button get the task/session reminder from the file.

---

# TODO: MCP time awareness

The model has no clock: it cannot know today's date/time unless a tool tells
it. Decision: one server default timezone (no per-user timezone), a middleware
that stamps every tool result, a `neoma.now` tool, and human-readable ISO
strings in read tools.

## 1. Config

- [ ] `server/app/config.py`: add `default_timezone: str = "Asia/Kuala_Lumpur"`.
- [ ] `server/.env.example`: document `DEFAULT_TIMEZONE`.
- [ ] `server/pyproject.toml`: add `tzdata` (Windows and `python:3.12-slim`
      lack IANA data; `ZoneInfo` raises without it), then `uv lock`.

## 2. Middleware: every tool result carries "now"

- [ ] `server/app/mcp_server.py`: `TimeContextMiddleware` registered via
      `MCPServer(..., middleware=[...])` (the SDK forwards it to the low-level
      server).
  - [ ] Only for `tools/call`; append a text block as the **last** content item
        so `content[0]` stays the tool payload:
        `Now: Wed 24 Sep 2026, 23:40 (+08, Asia/Kuala_Lumpur) · <utc ISO> · <unix ms>`
  - [ ] Handle both `CallToolResult` and plain dict results; never touch
        `initialize` / `tools/list` / notifications.
  - [ ] Invalid `DEFAULT_TIMEZONE` falls back to UTC.
- [ ] Update the server `instructions` text: every tool result ends with the
      current time; timestamps are unix ms UTC.

## 3. `neoma.now` tool

- [ ] `server/app/mcp_tools.py`: read-only `now(timezone: str | None = None)`
      with an IANA override; unknown zone raises a readable `ToolError`.
- [ ] Returns `utc`, `unixMs`, `timezone`, `local`, `date`, `time`, `weekday`,
      `utcOffsetMinutes`, `startOfDayMs`, `endOfDayMs`.

## 4. Humanized dates (read tools only)

- [ ] `upcoming`: each item gains `atIso` + a short human label.
- [ ] `daily_brief`: gains `now` plus `*Iso` values per task/event.
- [ ] `list_tasks` / `list_events`: return dicts (not bare schemas) with
      `dueAtIso` / `startsAtIso` / `endsAtIso` added.
- [ ] Write tools (`create_task`, `update_task`, `create_note`, …) keep their
      current schema returns; the caller supplied the epoch ms.

## 5. Tests

- [ ] `server/tests/test_mcp.py`
  - [ ] `now`: shape, `startOfDayMs <= unixMs < endOfDayMs`, bad-zone error.
  - [ ] Middleware: last content block starts with `Now:` on tool calls;
        `tools/list` untouched; `content[0]` still the tool payload.
  - [ ] Humanized fields present (`dueAtIso`, `atIso`, `daily_brief.now`).
  - [ ] Make the `_payload` test helper tolerant of the extra content block
        (pick the first block that parses as JSON).

## 6. Docs

- [ ] `AGENTS.md` MCP bullet: every tool result carries the current time;
      `DEFAULT_TIMEZONE` drives it.
- [ ] Verify: `ruff`, `pyright`, `pytest`.
