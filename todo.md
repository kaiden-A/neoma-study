# Neoma — TODO

Roadmap for turning Neoma's notes into a full study experience: open the app,
pick a subject, read/watch the material **inside Neoma** while writing notes
beside it, then review and track progress. Everything below is agreed work or
verified findings from the repo; checkboxes are the unit of work.

---

## 0. Vision (the target)

One stop centre for studying:

- **Focus view** on a note: material on the left, your writing on the right.
- Material = PDF, YouTube/Vimeo, Office files, images, text files, links — all
  previewed in-app, no tab juggling.
- Capture while consuming: timestamps that seek, PDF highlights saved as
  excerpts, page anchors.
- Recall: highlights become flashcards with spaced repetition, reviewed in-app.
- Progress: study timer, per-subject dashboard, "Continue studying" on Home.
- AI: LibreChat agents available inside Neoma (Agents API proxy), with the MCP
  route documented for the reverse direction.

---

## 1. Shipped (context, do not redo)

- [x] Notes redesign — list rows + grid toggle (`lib/vaultView.ts`), real
      thumbnails per type, `NoteRow`/`NoteCard`/`FilePreview`, redesigned
      `NoteEditor`, Add-modal drop zone, mobile notes pass (scrollable filter
      chips, list-only phones, bottom action bar, `NoteDetailsSheet`).
- [x] Notion-style note editor (TipTap 3 + `@tiptap/markdown`) — in-place
      WYSIWYG stored as Markdown in `notes.body`; `/` slash menu at the caret
      (`slashItems.ts`, `SlashMenu.tsx`, `slashCommand.tsx`), selection bubble
      (bold/italic/underline/strike/code/link), task lists, tables, image
      links and markdown input rules (`RichTextEditor.tsx`); group feeds
      render Markdown through `lib/markdown.ts`; rows/cards/palette strip
      syntax. Inline image paste/upload still needs the attachment model
      (see §3.7).
- [x] Explicit save — dirty tracking over title/body/tags/subject, Save button
      (header on desktop, bottom bar on mobile), Ctrl/Cmd+S, leave guard
      (Cancel / Discard / Save & leave) + `beforeunload`. Autosave removed.
- [x] Loading UX — `BootStatus` + `bootSlow` + `retry()` in `lib/store.tsx`,
      20s timeout ×2 attempts, route skeletons (`components/skeletons/`),
      `BootError`, `RouteProgress`, `loading.tsx` per route.
- [x] PWA — `app/manifest.ts`, icons in `public/icons/`, `public/sw.js`
      (network-first navigations + `/offline`), `ServiceWorkerRegister`,
      iOS install hint.
- [x] Completed work orders archived in §9 below (emails replace Google
      invitations; MCP time awareness) — both verified in code.

---

## 2. In-app previews — DONE

### 2.1 YouTube / Vimeo embeds

- [x] `client/lib/links.ts` — `parseVideoUrl`, `videoEmbedUrl`,
      `videoThumbUrl`; every URL form + `t=`/`start=` (incl. `1h2m3s`) and
      `list=` kept; IDs validated before embedding.
- [x] `client/components/notes/LinkPreview.tsx` — 16:9 facade, click swaps in
      `youtube-nocookie.com/embed/...` (Vimeo: plain tile); bar keeps the URL +
      **Open on YouTube / Vimeo**; respects `linkEmbeds`.
- [x] `NoteEditor.tsx` renders `<LinkPreview note={note} />`.
- [x] `NoteThumb.tsx` / `NoteCard.tsx` — video thumbnail tiles with `onError`
      fallback to the icon tile.
- [x] `AddItemModal.tsx` — blank title + video URL fetches the real title
      ("Fetching video title…"), `domainOf(url)` fallback.
- [x] Server: `app/services/link_services.py` + `app/routers/links_router.py`,
      `POST /api/links/preview` (auth, host allowlist, oEmbed URL as a
      parameter, 3s timeout, nulls on failure).
- [x] Setting: `linkEmbeds` in the JSONB bag; client type + Settings card
      "Files & links" with the toggle.
- [x] Tests: `tests/test_links.py` (allowed/non-allowlisted/error/auth) and
      settings default + patch in `tests/test_settings.py`.
- [x] Verified: ruff, pyright, pytest, typecheck/lint/build + headless shots
      (facade → play → iframe, row thumbnail, setting off → card).

### 2.2 Office + text previews

- [x] `file_services.file_key(prefix, name)` appends a sanitized extension;
      used by presign, the legacy upload and share copies. Thumbs stay
      `{key}-thumb`.
- [x] `server/scripts/migrate_file_keys.py` (dry-run default).
- [x] `GET /api/files/{id}/text` (auth, `require_visible_file`, text/* + JSON,
      first 256 KB via `Storage.get_bytes`).
- [x] `FilePreview.tsx`: Office iframe via `view.officeapps.live.com` + the
      existing bar + **Reload preview** + "Preview rendered by Microsoft";
      text files in `<pre class="nm-preview-text">`; Office off → card with
      "Office previews are off in Settings".
- [x] Setting: `officePreview` (same pattern as §2.1).
- [x] `NoteEditor.tsx` passes `reloadFileUrl` for the Reload button.
- [x] Tests: key extension on presign + share copy, `/text` owner/member/404/
      binary/truncation, setting default + patch.
- [x] Verified: text preview + Office branch in headless shots (Office iframe
      needs a real pptx; the branch is covered by tests + code path).

### 2.3 PDF viewer (pdf.js)

- [x] `pdfjs-dist` added (the first client dependency), lazily imported;
      module worker from `pdfjs-dist/build/pdf.worker.min.mjs` (verified the
      worker asset is emitted by Turbopack).
- [x] `client/components/notes/PdfViewer.tsx`: page nav + jump, zoom/fit,
      selectable text layer, fullscreen. Replaced the `<iframe>` for
      `application/pdf`.
- [x] Page memory lives in `notes.study` (server) — see §3.1; the viewer
      reports position and restores it.
- [x] Bar keeps Open file / Download.

### 2.4 Focus view (the left/right study layout)

- [x] `client/lib/studyView.ts` (`useSyncExternalStore`): mode
      (`split | material | write`) + split ratio, persisted.
- [x] Desktop ≥1081px: `--split` grid with a draggable divider, `Ctrl+\`
      cycles modes, `Esc` leaves full-width material; the Details/History
      sidebar collapses into `NoteDetailsSheet` via the chips row.
- [x] Right pane: title input, type/subject chips, textarea filling the
      remaining height, word count; Save stays in header/bottom bar.
- [x] Mobile <900px: Material / Notes tabs, sticky video mini-player (tap →
      Material), PDF "page N · resume" pill.
- [x] Material pane uses PdfViewer, video embed, Office iframe, image, text
      preview and the link card fallback.
- [x] Verified: 1280×900 + 390×844 headless shots; mode persists via
      localStorage; page/video position survives reload (server `notes.study`).

---

## 3. Study roadmap

### 3.1 Capture (make the note a study artefact)

- [x] YouTube timestamps: `[mm:ss]` / `[hh:mm:ss]` convention, **"Stamp
      current time"** inserts at the caret (YouTube clock via the iframe
      postMessage channel), clicking a chip seeks the player, chips render in
      the write pane.
- [x] PDF highlights: select in the pdf.js text layer → floating **Highlight**
      button → stored in `notes.study` JSONB (Alembic migration
      `b7c4d1e8a220`, hand-reviewed):
      `{position, highlights: [{id, page, rects, quote, color, createdAt,
      tag?}], timestamps}`. Rendered over the text layer; excerpts list with
      "jump to page", "copy into note" and "make card".
- [x] Page anchors: `[p. 12]` in the body renders as a clickable jump chip on
      PDF notes.

### 3.2 Recall (the step that makes studying stick)

- [x] Tables (migration `c9d5e2f1b331`): `flashcards` + `study_sessions`.
- [x] SM-2 scheduling (`services/srs.py`): Again / Hard / Good / Easy update
      ease + interval; failed cards return in 10 minutes.
- [x] `/review` page: flip card, grade buttons, keyboard 1–4, due count in the
      nav badge (rail + phone tab bar). Card list per note + "Add card" from
      the note or from a highlight.
- [x] Notifications: derived `review_due:{user}`; the `review` group is in the
      daily digest too.
- [x] MCP tools: `list_due_cards`, `create_card`, `grade_card`.
- [x] Tests: scheduling math, ownership, due filtering, MCP shapes.

### 3.3 Progress & habit

- [x] `study_sessions` table (migration `c9d5e2f1b331`).
- [x] Timer on the note page (manual start/pause/finish); auto-finishes after
      5 idle minutes; writes a session row.
- [x] Subject dashboard: per subject note/file counts, last studied, cards due,
      minutes this week; opened from the vault header.
- [x] Home (`/today`): **"Continue studying"** card → last note with page /
      timestamp resume; streak from days with sessions or reviews.
- [x] Tests: session aggregation, dashboard numbers, streak boundaries.

### 3.4 Library depth (search)

- [x] Text extraction on upload (best-effort, never fails the upload): pypdf
      (with `--- page N ---` markers), python-docx, python-pptx, plain text →
      `files.extracted_text` + `extracted_at` (migration `d1e6f3a2c447`).
- [x] `scripts/reindex_text.py` (dry-run default).
- [x] Search: SQL ILIKE over title/body/url/tags + file text with
      "found in file · page N" snippets; group notes are included; the vault
      gets a "Search inside files" run through `store.searchNotes`.
- [ ] OCR for handwriting — later, separate project (tesseract or an API).

### 3.5 AI — LibreChat inside Neoma (skipped this pass, per request)

- [x] Findings (verified in LibreChat docs): they ship an **Agents API** —
      `POST /api/agents/v1/chat/completions` (OpenAI-compatible, API-key auth,
      streaming; `model` = agent id) and Open Responses; LibreChat is also a
      full **MCP client** (streamable-http).
- [ ] Confirm prerequisites with the user: LibreChat reachable on public HTTPS
      from Cloud Run, an API key, an agent id, and a version that has the
      Agents API (0.8.x-era releases; otherwise show "AI not configured").
- [ ] Server: `services/librechat_services.py` (the master-plan §6 vendor
      pattern: `configured` flag, typed results, one error type) with
      `LIBRECHAT_BASE_URL`, `LIBRECHAT_API_KEY`, `LIBRECHAT_AGENT_ID` in
      `server/.env`; `GET /api/ai/status`;
      `POST /api/ai/chat` streaming SSE (httpx streaming → `StreamingResponse`).
- [ ] Client: AI panel on the note page (right rail on desktop, bottom sheet on
      mobile): streaming messages, "use this note as context" (title/body/
      source URL), quick actions **Summarise**, **Make 5 questions**, **Explain
      selection**, and **insert response into note**.
- [ ] Optional: give the LibreChat agent Neoma's MCP server so it can search
      and write notes during chat (tools already exist and carry timestamps).
- [ ] `docs/librechat.md`: Agents API setup + the reverse route (Neoma MCP in
      `librechat.yaml`, `type: streamable-http`, token from Settings).
- [ ] Tests: mocked httpx stream; unconfigured → status false + clean error.
- [ ] Fallbacks if the Agents API is unavailable: MCP-only (chat in LibreChat)
      or a deep-link "Ask in LibreChat" button. Never build the iframe panel
      unless LibreChat is on a same-site subdomain (third-party cookies).

### 3.6 iTa'leem (Moodle) — the all-in-one source (planned 28 Oct 2026)

**Goal.** iTa'leem courses, deadlines and material inside Neoma: a `/courses`
home, assignment/quiz deadlines as tasks, the course outline with files, and
"Save to vault" so PDFs/decks open in the study reader, become searchable and
turn into flashcards.

**Verified 28 Oct 2026.** Canonical host `https://italeemc.iium.edu.my`
(Moodle 5.2-era `2026042000.02`; `italeem.iium.edu.my` 301s to the root).
`admin/tool/mobile/launch.php` and the `moodle_mobile_app` service are enabled
and allow browser login (303 to login + `tool_mobile_launch` cookie; a disabled
service would error before `require_login`). `calendar/export_execute.php` is
enabled (`Invalid authentication`, not `no export`). REST answers JSON
(`invalidtoken`), and a plain server-side GET is not Cloudflare-challenged from
this machine. The mobile service exposes ~175 functions, incl.
`core_enrol_get_users_courses`, `mod_assign_get_assignments`,
`core_course_get_contents`, `core_calendar_get_action_events_by_timesort`,
`gradereport_user_get_grade_items`; file downloads need `?token=` on
`/webservice/pluginfile.php`. Tokens have no expiry and survive password changes
(Moodle wipes them on account deletion) — encrypt at rest, never return them to
the client.

**Auth (one paste per user, no shell).** Settings → iTa'leem → open
`launch.php?service=moodle_mobile_app&passport=<rand>&urlscheme=neoma&confirmed=1`
while signed in, copy the `neoma://token=...` link, paste it into Neoma.
`POST /api/moodle/token` decodes `siteid:::wstoken:::privatetoken`, validates
with `core_webservice_get_site_info`, then stores the token encrypted.

**Non-goals.** Submitting assignments, forum posts, messages, profile writes —
the token allows them, our code won't. Read-only mirror; not a Moodle
replacement.

**Work order:** say **proceed with A**, then **B**, **C**, **D**, **E**, **F**,
**G**. Each phase ends at its gate; do not start the next one before the gate
passes.
**Defaults unless you say otherwise:** read-only; files on demand (auto-save
off); imported deadlines remind 24 h before; Courses in the top nav.

**Status 28 Oct 2026 (live).** Connected with a real IIUM account: courses and
deadlines synced, and `scripts/moodle_debug.py` pulled site info, courses,
assignments, action events and every course outline. IIUM intermittently serves
a bad backend node (`$CFG->dataroot` fatal, HTTP 500); Neoma retries 5xx twice
and now returns a course with `outlineError` + cached data instead of a 503.
Remaining: capture the real fixtures, run the full pytest suite (Neon is flaky
from this machine), the live browser pass, and revoke the token that appeared in
a screenshot.

#### Phase A — spike + fixtures (script built; needs your token)

- [ ] `server/scripts/moodle_spike.py`: token from `MOODLE_TOKEN` or argv;
      print site info (release, userid, `functions[]`), courses, assignments
      for one course, one outline; download one file to a temp path.
- [ ] Save redacted JSON under `server/tests/fixtures/moodle/` (site info,
      courses, assignments, outline) and record which functions IIUM exposes.
- [ ] Run it from this machine; note the release and any missing call.
- **Gate:** four calls return, one file downloads, fixtures are in the repo.

#### Phase B — account + sync spine (built)

- [ ] Alembic (hand-reviewed): `moodle_accounts` (`user_id` unique, `wwwroot`,
      `token_enc`, `moodle_user_id`, `username`, `release`, `functions` JSONB,
      `ignored_uids` JSONB, `last_sync_at`, `last_error`); `moodle_courses`
      (`user_id`, `course_id`, `shortname`, `fullname`, `category`, `progress`,
      `subject_id` FK SET NULL, `outline` JSONB, `outline_at`, `archived`,
      unique `(user_id, course_id)`); `moodle_assignments` (`user_id`,
      `course_id`, `assign_id`, `cmid`, `name`, `due_at`, `cutoff_at`, `intro`,
      `submission_status`, `grade`, `grade_max`, `timemodified`, `task_id`,
      unique `(user_id, assign_id)`); `tasks.external_uid` + `tasks.course_id`
      (FK SET NULL).
- [ ] `services/crypto.py`: lift Google's Fernet helper into a shared
      `encrypt_secret` / `decrypt_secret` keyed by `APP_SECRET` + purpose.
- [ ] `services/moodle_services.py`: `MoodleClient` (httpx, form-encoded REST,
      15 s timeout, 2 concurrent max, JSON errors), `connect_token`, `sync`,
      `status`, `disconnect`; assignment/quiz → task mapping; UID dedupe; skip
      `modulename=assign` calendar events; detach on edit; `ignored_uids`
      tombstones.
- [ ] `schemas/moodle.py`, `routers/moodle_router.py`, `main.py`:
      `GET /api/moodle`, `POST /api/moodle/token`, `POST /api/moodle/sync`
      (`?auto=true`), `DELETE /api/moodle`.
- [ ] `settings_services.py`: `MoodleSettings` (`status`, `lastSyncAt`,
      `error`) inside `users.settings`; the token never goes there.
- [ ] `bootstrap_router.py`: course summary + moodle status.
- [ ] Settings card (paste link, status, sync now, disconnect) and task chips;
      `/courses` empty state links back to Settings.
- [ ] Tests: token decode/validation, idempotent sync, detach, delete/ignore,
      `invalidtoken`, Cloudflare HTML, timeout.
- **Gate:** real connect works; deadlines land as tasks; a second sync is a
  no-op; disconnect removes only that user's mirror.

#### Phase C — course pages (built)

- [ ] `GET /api/moodle/courses` (summary) and
      `GET /api/moodle/courses/{id}` (outline + assignments; `?refresh=1`);
      fetch the outline lazily and cache it for 60 min, filter `uservisible`.
- [ ] `app/(app)/courses/page.tsx` + `courses/[id]/page.tsx` +
      `components/courses/*` + `loading.tsx`; cards coloured from `MARKERS`,
      progress, next deadline, counts; tabs **Outline · Assignments · Files ·
      Grades** (Grades empty until E).
- [ ] `AppShell.tsx` nav entry + `CommandPalette.tsx`; reuse `nm-card`,
      `nm-chip`, `nm-list`; no raw Moodle HTML (link out for pages/labels).
- **Gate:** a real course renders, mobile 390×844 pass, only visible modules
  appear.

#### Phase D — content into the vault (built)

- [ ] `POST /api/moodle/courses/{id}/save` `{cmid, fileIndex}`; the server
      resolves `fileurl` from the cached outline (never accepts a URL from the
      client), appends `?token=`, caps at 50 MB.
- [ ] `FileObject` + `Storage.put` + `extract_services.extract_file_text` +
      `Note` (personal, course subject, tags `["iTa'leem", shortname]`,
      `external_uid`); one folder per course via `moodle_courses.subject_id`,
      created once and not recreated if deleted.
- [ ] `mod_url` → link note; `mod_folder` → each file; `mod_page`/`label` →
      "Open in iTa'leem"; saved files open in `PdfViewer`/`FilePreview`.
- [ ] UI: Save button, saved state, "Open in Neoma"; stale badge when the
      Moodle file's `timemodified` moves on (never auto-replace: page-anchored
      highlights).
- [ ] Tests: fake `Storage`, dedupe by UID, extraction called, oversize/404.
- **Gate:** save a PDF, open it, highlight it, and find it via "Search inside
  files".

#### Phase E — status + grades (built)

- [ ] `mod_assign_get_submission_status` and
      `gradereport_user_get_grade_items`, cached per course; never auto-complete
      a Neoma task from Moodle.
- [ ] Assignment chips (Submitted / Not submitted / Graded x/y) and the Grades
      tab; refresh on tab open if older than 6 h.
- **Gate:** statuses and grades match iTa'leem.

#### Phase F — hardening + docs (mostly built; live checks pending)

- [ ] Reconnect/invalid-token states; disconnect purges that user's account,
      courses, assignments and mirrored tasks/notes only.
- [ ] `scripts/sync_moodle.py` + `POST /api/maintenance/sync-moodle`
      (`X-Cleanup-Secret`), same pattern as Google.
- [ ] `docs/italeem.md`: token steps, API surface, failure modes; update
      `AGENTS.md` seams + this list on ship.
- [ ] Full checks: `ruff check`/`format`, `pyright`, `pytest`, client
      `typecheck`/`lint`/`build`, plus the §7 headless-Chrome pass.
- **Gate:** all checks green and the real-browser pass recorded.

#### Phase G — MCP tools (built)

Imported deadlines are already Neoma tasks, so the existing `list_tasks`,
`upcoming` and `daily_brief` tools see them for free. This phase adds the
iTa'leem-specific context an agent needs (courses, materials, grades, a sync
trigger).

- [ ] `app/mcp_italeem.py`, imported from `main.py` beside `mcp_tools`:
      `italeem_status`, `italeem_courses`, `italeem_deadlines`,
      `italeem_course`, `italeem_files`, `italeem_assignment`,
      `italeem_grades`, `italeem_sync`, `italeem_save_file`. Every read uses
      `current_user(db)`; no token, connect link or secret is ever returned.
- [ ] Freshness: `italeem_deadlines` runs a light sync (assignments + calendar)
      when `last_sync_at` is older than 10 min, with a 15 s timeout; on failure
      it returns cached rows with `stale: true` + `warning` instead of erroring.
      Outlines refresh lazily (>60 min); grades only on request.
- [ ] Shapes: deadlines `{taskId, title, course, dueAt, due, overdue, status,
      submission, url}`; `italeem_assignment(taskId)` returns the intro text,
      cutoff, submission status, grade and activity URL; course sections
      `{name, modules: [{cmid, name, modname, url, description?, files:
      [{filename, mimetype, size, savedNoteId}]}]}` with descriptions stripped
      to text and capped; `italeem_grades` returns cached items per course.
      Return `truncated: true` when a cap is hit rather than dumping a whole
      course.
- [ ] `italeem_sync` (MUTATING) is a no-op inside 60 s; `italeem_save_file`
      (MUTATING) reuses the Phase D resolver (never a URL from the caller) and
      returns the new note id.
- [ ] Update the MCP instructions string in `mcp_server.py`, the `MCP_TOOLS`
      list on the Settings page, and `docs/italeem.md` (examples: "what's due
      this week", "what's in my Business Law course", "save week 5 slides").
- [ ] Tests: tool list contains the new names, owner scoping, not-connected is
      a readable sentence, stale fallback, save-file with fake `Storage`.
- **Gate:** from Elpis/Claude, the three example prompts return real iTa'leem
  data and "save week 5 slides" creates a vault note.

G needs B for the read tools and D for `italeem_save_file`; E supplies grades.

#### Phase H — scheduled update emails (built 29 Oct 2026)

- [x] `moodle_accounts.seen` JSONB + hand-written Alembic migration: per-course
      and per-forum baselines, seen discussion IDs/reply counts, file UIDs,
      grade fingerprints and imported task UIDs.
- [x] `moodle_services.collect_updates`: new announcements (full first post),
      reply counts, new outline files, item-level grade changes and imported
      deadlines. First scan per course/forum is a silent baseline. IIUM's
      `mod_forum_get_discussion_posts` is best-effort; reply text may be absent.
- [x] `email_services.send_italeem_update` + `italeem.html/.txt`: one batched
      email, `kind="italeem"`, deduped by item keys.
- [x] `kinds.italeem` setting, unsubscribe, Settings toggle and client types.
- [x] `POST /api/maintenance/sync-moodle?notify=true` and
      `scripts/sync_moodle.py --notify`.
- [x] Cloud Scheduler every 2 hours (direct Cloud Run URL, not GitHub Actions:
      public-repo schedules auto-disable after 60 days without activity).
- [x] Migration applied to `public`; Cloud Scheduler job `neoma-sync-italeem`
      created (every 2 hours, `Asia/Kuala_Lumpur`, direct Cloud Run URL).
- [ ] Deploy the new server image, then verify one real email against iTa'leem.

A–D is the "all in one place to study" core (≈7–9 d); E–G is polish and agent
access (≈4–5 d).

### 3.7 Later / optional (each is its own project)

- [ ] Offline: cache the bootstrap payload + queue note edits (lecture-hall
      wifi). PWA shell already exists.
- [ ] LaTeX rendering (body is Markdown now; server cap 20k chars, one
      attachment per note).
- [ ] Inline images / paste into notes, handwriting & drawing (needs an
      inline-attachment model).
- [ ] AI-generated flashcards from a note (after §3.5).

---

## 4. Infra & prerequisites

- [ ] Cloud Run `--min-instances=1` removes the cold start outright (the
      loading UX already makes it tolerable).
- [x] No R2 CORS change needed for §2.2 (text goes through the API); the
      bucket's existing rule already allows `GET`/`HEAD`/`PUT` from the app
      origins, which §2.3's pdf.js needs.
- [x] Preview defaults to keep in mind: YouTube oEmbed is public but
      undocumented (3s timeout + fallback); Office preview ships files to
      Microsoft (setting exists); `pypdf`/`python-docx`/`python-pptx` are pure
      Python (no Docker weight).

---

## 5. Open decisions (confirm before/during the relevant phase)

- [ ] LibreChat: public URL, API key, agent id, version (Agents API support).
- [x] `pdfjs-dist` adoption confirmed (first client dependency, lazy-loaded).
- [x] "Focus" naming for the split layout (avoid clashing with study *groups*).
- [x] Timer is manual-start only (`Start studying` on the note page; no
      prompt on opening a note).

---

## 6. Agent reminders (from AGENTS.md, easy to forget)

- [ ] Read `client/AGENTS.md` + `node_modules/next/dist/docs/` before Next code.
- [ ] Sync SQLAlchemy + pg8000, schema-qualified tables, tz-aware UTC, ms in
      payloads, `{"error": ...}` shape, services raise `app/services/errors.py`.
- [ ] Alembic migrations are hand-reviewed; drop autogenerated no-op
      directives; deploys never run them.
- [ ] `users.settings` JSONB needs no migration for new preferences.
- [ ] Client: `lib/store.tsx` holds all data; optimistic mutations via
      `beginMutation`/`finishMutation`; no `Date.now()` in render; no sync
      `setState` in effects (`useSyncExternalStore`/lazy initializers).
- [ ] New mutations follow the existing optimistic path; `create*` stays
      server-first.
- [ ] Every phase: `ruff check`/`format`, `pyright`,
      `pytest`, client `typecheck`/`lint`/`build`, plus headless-Chrome
      screenshot check for UI phases.

---

## 7. Verification harness (reuse)

Headless-Chrome smoke (used for the mobile/notes passes):

1. `uv run --directory server uvicorn app.main:app --port 8000` (or use the
   running dev API).
2. `npm --prefix client run build && npm run start -- --port 33xx`.
3. `uv run --directory server python scripts/smoke_session.py mint` → cookie;
   `POST /api/demo` for sample data.
4. Chrome `--headless=new --remote-debugging-port=922x`, a small Node CDP
   script: `Network.setCookie`, `Emulation.setDeviceMetricsOverride`
   (390×844 / 1280×900), `Page.captureScreenshot`.
5. Clean up: `DELETE /api/demo`, `smoke_session.py clean`, kill temp servers.
   Never touch the user's own dev servers (3000/8000).

---

## 8. Product gaps not yet scheduled (research notes)

Recorded from the study-experience research; not committed work:

- Note↔note links/backlinks; outline/TOC for long notes; templates; nesting
  beyond flat subjects.
- Meaningful search ranking; semantic search.
- Per-subject mastery estimates (beyond raw counts).
- Study-group side: shared highlights/cards across a group.

---

## 9. Completed work orders (archive — verified in code)

### 9.1 Neoma emails replace Google Calendar invitations — DONE

- [x] `google_services`: no `attendees`; `sendUpdates="none"` on
      insert/patch/delete (`google_services.py:145-165`).
- [x] `email_services`: attachments supported; `send_task_assignment`,
      `send_task_moved`, `send_session_notice` with dedupe keys
      (`email_services.py:269+`).
- [x] Templates under `app/templates/emails/`; `.ics` blocks use the task's own
      reminder and carry the `Neoma id:` marker (`ics_services.MARKER_PREFIX`).
- [x] Duplicate guard: `_MARKER_RE` + `_apply_item` skip
      (`google_services.py:658-665`).
- [x] Client copy updated (Settings → Google card).

### 9.2 MCP time awareness — DONE

- [x] `DEFAULT_TIMEZONE` (`config.py:24`, default `Asia/Kuala_Lumpur`),
      `tzdata` dependency.
- [x] `TimeContextMiddleware` appends `Now: …` as the last content block on
      `tools/call` (`mcp_server.py:155`, registered at `:193`).
- [x] `neoma.now` tool with IANA override (`mcp_tools.py:104`).
- [x] Humanised `*Iso` fields on read tools.
- [x] Tests in `tests/test_mcp.py`.
