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

### 3.6 Later / optional (each is its own project)

- [ ] Offline: cache the bootstrap payload + queue note edits (lecture-hall
      wifi). PWA shell already exists.
- [ ] Markdown + LaTeX rendering (body is plain text today; server cap 20k
      chars, one attachment per note).
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
