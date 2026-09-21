# Neoma — study OS (prototype)

Three things, done properly: **group projects**, **your own study notes**, and **one
calendar** that knows about both. Groups come in two kinds — a project group runs a task
board, a **study group** trades notes and books sessions — and a personal **to-do list**
sits alongside them for everything that isn't group work. Home opens on the month with
what's coming up, so the calendar is the first thing you see.

This folder is a frontend-only prototype: no backend, no build step, no accounts.
State lives in `localStorage`, uploaded files in `IndexedDB`.

Open `prototype/index.html` in Chrome, Edge or Firefox — that's it. Or serve it:

```powershell
# from the repo root, either works
python -m http.server 8123 --directory prototype
npx serve prototype
```

---

## 1. What's in it

### Home — the day, with the calendar on it
- **Mini month calendar**: event dots per day, today highlighted, month arrows, one click to the full calendar.
- **Coming up**: the next seven days of exams, meetings and study sessions, grouped by day. Click a day in the mini calendar and the list filters to that day ("Show the week" clears it).
- **My to-do**: inline add row, then your own overdue, today, tomorrow, later and undated tasks — with the nearest group deadlines underneath. Tick one off and a highlighter stroke pulls through the title (with Undo).
- **Your groups**: progress and next deadline for project groups; shared notes, open requests and the next session for study groups.

### My to-do — your own list, separate from group work
| Feature | Where |
| --- | --- |
| Inline add with **Today / Tomorrow / No date** shortcuts | My to-do (and Home) |
| Sections: Overdue · Today · Tomorrow · Next 7 days · Later · No date · Done | My to-do |
| Row menu: Edit · **Postpone to tomorrow** · Duplicate · Delete | any row's `⋯` |
| **Include group work** toggle — off by default, so your list stays yours | top of the page |
| Reached from Home's module, the palette (`Ctrl+K`) and the avatar menu | `#/tasks` |

Personal tasks reuse the task model (`groupId: null`), so they already appear on the
calendar, in reminders, in search, in the `.ics` export and in the MCP payloads — no
separate system.

### Project groups — for the work you're graded on
| Feature | Where |
| --- | --- |
| Create a project group (name, unit, colour, brief) | Groups → New group |
| Add members by email, or share the invite link / code | Group → Members |
| Tasks: due date + time, assignees, priority, status, checklist, links | Group → Tasks |
| Board with drag & drop **and** a list view with inline status selects | Group → Tasks |
| Shared notes, minutes and resource link cards | Group → Notes |
| Workload per member, invite link, remove member with task reassignment | Group → Members |

Each group header carries one slim line: `open · done · % · next deadline`.

### Study groups — for friends across different units
Same members, invites and sessions, but the notes are the point.

| Feature | Where |
| --- | --- |
| Create a study group with **topics** (CS301, CHEM210, Maths…) | Groups → New group → Study group |
| Shared notes filed under a topic, filterable by chip | Group → Notes |
| **Ask for a note**: a request post ("anyone have week 5's slides?") that pins to the top until answered | Group → Notes → Ask for a note |
| **Answer with a link**: answering creates a link note and closes the request | Group → Notes → any open request |
| Topic management (add, rename, remove) | Group → Manage topics |
| **Schedule session**: books a calendar event tied to the group | Group header |
| Notices in the bell a lead-time before, and an hour before, a session starts | Alerts |
| An optional **Plan** tab — the same board, framed as reading goals, not assignments | Group → Plan |
| Join page that explains the note exchange instead of a task board | `#/join/CODE` |

### Notes — for the stuff you actually revise
- **Five item types**: typed note, handwritten (photo), slides, question paper, link.
- Subjects with colours, tags, full-text search, and four filters: Everything · Notes · Files · Links.
- **Real uploads**: images are compressed and thumbnailed, PDFs and decks stored locally in IndexedDB (15 MB cap).
- Editor with autosave, word count, file preview and link cards. Pin a note to keep it on top.
- **Share to a group** — pick the group, then the topic (for study groups). Your copy stays yours.

### Calendar
- Month and week views merging group task deadlines, exams, study sessions, meetings and personal events.
- Filter chips per source, day detail panel, add/edit/delete events with a reminder per event.
- **Working today:** per-event *Add to Google* links (opens Google Calendar's template form) and a whole-calendar `.ics` export (Google Calendar → Settings → Import).
- **Mocked:** the OAuth connect flow and sync log in Settings, so the shape of the real integration is visible.

### System
- **Notification centre** (bell in the top bar, no nav item): overdue, due soon, study sessions, assigned to you, exams (7/3/2/1/0 days), shared notes. Snooze, mark read, desktop notifications while the tab is open.
- **Quick capture** (✦ in the top bar): one field → note, task or event.
- **Command palette** (`Ctrl/⌘ + K` or `/`): jump to pages, groups, tasks, notes, events, or run an action.
- **Settings**: profile, light/dark, notification rules + lead time, Google Calendar, the Elpis MCP contract, JSON export/import, file cleanup, reset to demo data.
- Demo semester on first run: 4 groups (3 project + 1 study), 19 tasks (13 group + 6 personal), 17 notes, 5 calendar events, 7 people.

---

## 2. Demo script (two minutes)

1. **Home** — month at a glance, "Coming up" for events, "My to-do" with the inline add row and the nearest group deadlines underneath.
2. Click a day in the mini calendar: the agenda filters to it. "Show the week" resets it.
3. Add a to-do from Home: type, pick **Today**, press Enter. Tick it off for the highlighter strike and Undo.
4. `Ctrl + K` → type "to-do" → Enter: the full list. Try **Postpone to tomorrow**, **Duplicate**, then flip on **Include group work**.
5. `Ctrl + K` → type "finals" → Enter: you land in the study group.
5. **Study group** — topic chips filter the feed (try MATH201), the open request is pinned at the top with **Answer with a link**, and the strip shows the next session countdown.
6. Put the composer in **Ask for a note** mode and post a request; answer one and watch it close.
7. **Schedule session** → the event modal opens prefilled as a session for that group; save, then find it in the calendar and the bell.
8. **Plan** tab — the same board, deliberately optional.
9. **Groups → New group → Study group** to see the form change (topics instead of a unit).
10. Copy a study group's invite link and open it: the join page sells the note exchange, not a task board.
11. **Notes**: filter to Files, open the CHEM210 past paper; **Share to group** and pick a topic.
12. **Calendar**: week view, add an event, *Add to Google* or *Export .ics*. **Settings**: connect Google (mock), read the Elpis tool list, export your data.

---

## 3. Design notes

Direction: **"annotated notebook"** — cool paper, ink, hairline rules, highlighter
markers. Paper grid appears only on Home and Calendar; Groups and Notes stay plain.

- **Signature: the moon-phase deadline dial.** Thin crescent when a deadline is far, full disc when it arrives, mint disc with a tick when done, red when overdue. It sits in the margin rail for the next deadline and beside every dated item — deadlines and sessions alike.
- **Second signature: the highlighter strike** — completing a task draws a marker stroke through its title (220 ms, off under `prefers-reduced-motion`).
- **Colour:** paper `#EFF1EC`, ink `#171C1A`, rule `#D9DFD7`, six highlighter markers (amber, mint, sky, coral, violet, pink) reused as group colours, subject colours and topic colours. Amber is the only accent: focus, active nav, requests, the strike.
- **Type:** Fraunces for display, IBM Plex Sans for UI, IBM Plex Mono for dates, counts and codes.
- **Discipline:** flat surfaces, 14 px cards, 10 px controls, visible focus rings, five-item bottom bar on mobile, empty states that say what to do next.

Tokens live in `assets/css/app.css` under `:root` and `[data-theme='dark']`; Tailwind's
config in `index.html` maps the same tokens.

---

## 4. Architecture

```
prototype/
├─ index.html                  shell: margin rail, top bar, tab bar, modal/toast roots
└─ assets/
   ├─ css/app.css              tokens + component layer + signature elements
   └─ js/                      classic scripts, one global namespace (window.Neoma)
      ├─ util.js               ids, dates, escape, moon phase, event bus, storage, delegate ledger
      ├─ files.js              IndexedDB blobs, URL cache, image compression, demo previews
      ├─ seed.js               demo semester (project + study groups) + MCP tool manifest
      ├─ store.js              state, actions, selectors, persistence, migration, export/import
      ├─ notify.js             derived notifications (deadlines, sessions, exams, notes)
      ├─ ics.js                .ics export + Google Calendar template links
      ├─ ui.js                 modal, menu, toast, chips, avatars, rows, empty states
      ├─ palette.js            Ctrl+K command palette
      ├─ taskmodal.js          create/edit a task
      ├─ router.js             hash router + per-route options + cleanup
      ├─ pages/                dashboard (Home), groups, group, todo (My to-do), vault
      │                        (Notes), note, calendar, notifications, settings, join
      └─ app.js                boot, shell wiring, badge updates
```

Why classic scripts and no modules: the whole thing opens from `file://` with zero
tooling, and each file is a self-contained IIFE attached to `window.Neoma`.

**Rendering.** The router owns `#view` and reads per-route options — `grid: true` for the
two planner pages, `manual: true` for the two editing surfaces (Notes list and note
editor) so typing is never interrupted by a re-render. Everything else re-renders on
store changes. `ctx.onCleanup()` flushes autosave and releases object URLs; delegated
listeners live in a ledger (`util.releaseDelegates`) that the router clears before each
render, so one click never fires handlers left over from earlier renders.

**State.** One versioned object under `neoma.v1.state` (16 kB with the demo data).
`store.normalise()` tops up older saves when fields are added (this is how `kind`,
`topics` and `topicId` arrived). File bytes live in the `neoma-files` IndexedDB database
(`{id}` plus `{id}:thumb`).

**Group model.**
`group.kind: 'project' | 'study'` decides the group page: which tab opens first, which
tabs exist, what the header strip counts. `group.topics[]` holds per-group topics (name +
colour), and shared notes carry `topicId`. Requests are notes with `type: 'request'` and
`request: {open, answeredBy, answeredAt, answerNoteId}`; answering creates the link note
and closes the request in one store action.

**Personal to-dos.** A task with `groupId: null` is a personal to-do — same model, so the
calendar, reminders, search and export pick it up automatically. `store.personalTasks()`,
`postponeTask()` and `duplicateTask()` are the only additions. The composer markup is
shared (`N.pages.todoComposer` + `bindTodoComposer`) between Home and the full page, and
`ui.taskRow()` takes a `menu` attribute so the to-do list, Home and group views all draw
rows from one renderer.

**Deadline maths.** `util.moonPhase()` maps time-to-deadline to an illuminated fraction
(0.18 → 0.92); `util.moonPath()` draws the terminator with two SVG arcs; done and
overdue are tones rather than phases.

---

## 5. Integrations

### Google Calendar
Implemented now, no account needed:
- **Add to Google** on any event or task → opens Google's template form with title, times, group and location prefilled.
- **Export .ics** → valid iCalendar with `VALARM` reminders, importable into Google Calendar or anything else.

Modelled, not implemented: OAuth, two-way sync, conflict handling. The prototype stores
`settings.google = {status, email, lastSyncAt}` and appends to `settings.syncLog`.
The real thing is Google Identity Services + the Calendar API with `syncToken`.

### Elpis (MCP)
Settings → Elpis · MCP holds the endpoint (`/mcp`, Streamable HTTP JSON-RPC), an auth
token field, a read/write toggle, the 10-tool list and a copyable manifest.

| Tool | Purpose |
| --- | --- |
| `neoma.list_groups` | Groups with kind, members, topics and open task counts |
| `neoma.list_tasks` | Filter by group, assignee, status or due date |
| `neoma.create_task` | Create a task with due date and assignees |
| `neoma.update_task` | Change status, due date, assignees |
| `neoma.upcoming` | Merged deadlines and calendar events ahead |
| `neoma.search_vault` | Search notes, papers, slides and links |
| `neoma.get_note` | Full text of one note, with its topic |
| `neoma.create_note` | Capture a note or link into a subject or group topic |
| `neoma.list_events` | Calendar events in a date range |
| `neoma.daily_brief` | Everything Elpis needs to plan the day |

Resources: `neoma://vault/{noteId}`, `neoma://groups/{groupId}/board`,
`neoma://calendar/this-week`. Payloads are plain text with ISO-8601 UTC timestamps and
stable ids — which is how the store keeps them.

---

## 6. Prototype limits

- **Single user per browser.** Members, invites and joins are simulated locally; real multi-user needs a backend and auth.
- **No email.** Invites produce a link rather than sending mail.
- **Storage is per-browser.** Clearing site data deletes everything — export JSON first if it matters.
- **Uploads cap at 15 MB** and live in IndexedDB.
- **Notifications are derived, not pushed.** They refresh on load, every 60 s while the tab is open, and on every change.
- **Topics are per-group free text** with colours from the marker palette — not a global taxonomy, and not renamed across groups.
- **Tailwind Play CDN** prints a "not for production" console note; a real build would compile it.
- Demo file items (handwritten page, slide deck, past paper) use canvas-generated previews rather than real documents.

## 7. Roadmap

1. **Backend + auth** (Postgres/SQLite with magic links) so groups are genuinely shared; realtime board and feed updates.
2. **Google Calendar two-way sync** with OAuth and per-calendar mapping.
3. **MCP server** for Elpis implementing the tool table above with scoped device tokens.
4. **Study intelligence via Elpis**: summarise a deck into revision cards, turn an open request into an answer, a weekly "what's at risk" brief.
5. **PWA**: offline install, service-worker reminders.
6. Smaller things: subtask due dates, **recurring to-dos** (daily/weekly), recurring sessions, group file storage, CSV import.
