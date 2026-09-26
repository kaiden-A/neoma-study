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

## 2. Next: in-app previews (agreed plans, not yet built)

### 2.1 YouTube / Vimeo embeds

- [ ] `client/lib/links.ts` (new): `parseVideoUrl`, `videoEmbedUrl`,
      `videoThumbUrl`. Recognise `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`,
      `/live/`, `/embed/`, `m.youtube.com`, `music.youtube.com`, `vimeo.com/{id}`,
      `player.vimeo.com/video/{id}`; keep `t=`/`start=` (incl. `1h2m3s`) and
      `list=`; validate IDs (`^[A-Za-z0-9_-]{11}$` for YouTube) before
      embedding anything.
- [ ] `client/components/notes/LinkPreview.tsx` (new): owns all link rendering.
      Video → 16:9 facade (YouTube thumbnail + play button); on click swap in
      `youtube-nocookie.com/embed/{id}?autoplay=1&rel=0[&start=]`; Vimeo →
      `player.vimeo.com/video/{id}` (plain play button, no thumbnail). Bar keeps
      the URL + **Open on YouTube / Vimeo**. Non-video → current link card.
      Respects the `linkEmbeds` setting.
- [ ] `NoteEditor.tsx`: replace the inline link card (old lines ~247-259) with
      `<LinkPreview note={note} />`.
- [ ] `NoteThumb.tsx`: video-link branch → thumbnail tile in rows/cards
      (`loading="lazy"`, `onError` → existing icon tile). `NoteCard` uses the
      tile instead of the generic strip for video links.
- [ ] `AddItemModal.tsx`: blank title + video URL → `store.linkPreview(url)` and
      use the real title; fallback `domainOf(url)`; button shows
      "Fetching video title…".
- [ ] Server: `app/services/link_services.py` + `app/routers/links_router.py`,
      `POST /api/links/preview` (auth): host **allowlist** (youtube.com,
      youtu.be, m.youtube.com, music.youtube.com, vimeo.com) → call the
      provider's oEmbed endpoint with the original URL as a *parameter*
      (SSRF-safe: never fetch the user URL), 3s timeout, `httpx` (already a
      dependency). Returns `{title, author, thumbnailUrl}` or nulls.
- [ ] Setting: `linkEmbeds: bool = True` in `UserSettings` + patch
      (JSONB bag, **no migration**); `UserSettings` type in
      `client/lib/types.ts`.
- [ ] Tests: `server/tests/test_links.py` with httpx mocked — allowed host →
      title; non-allowlisted host → nulls; provider error/timeout → nulls; auth
      required. Settings default/patch in `tests/test_settings.py`.
- [ ] Settings page: "Files & links" card with the `nm-toggle`
      **"Play video links inside Neoma"** (help text: YouTube is contacted only
      when you press play).
- [ ] Verify: `ruff`, `pyright`, `pytest tests/test_links.py tests/test_settings.py -q`,
      client `typecheck`/`lint`/`build`, headless-Chrome shots (facade → play →
      iframe; vault row thumbnail; setting off → card).

### 2.2 Office + text previews

- [ ] Server key fix: `_file_key(prefix, name)` appends a sanitized extension
      (`users/{id}/{file_id}.pptx`). Used in `presign_upload`
      (`files_router.py`) and `_copy_file_to_group` (`note_services.py`).
      Thumbs stay `{key}-thumb`. Reason: Office/Google viewers detect file type
      from the URL path extension; today keys have none.
- [ ] `server/scripts/migrate_file_keys.py` (dry-run default): for rows whose
      key lacks an extension, server-side copy to the extensioned key, update
      the row, delete the old key — so already-uploaded decks preview.
- [ ] `GET /api/files/{id}/text` (auth): `file_services.require_visible_file`;
      only `text/*` + `application/json`; ≤256 KB via new
      `Storage.get_bytes(key, max_bytes)`; returns `{text, truncated}`.
      (Chosen over client `fetch(presigned)` to avoid a bucket CORS GET rule
      and keep ownership checks.)
- [ ] `FilePreview.tsx`: Office branch → iframe
      `https://view.officeapps.live.com/op/embed.aspx?src=<encoded presigned URL>`
      with the existing bar (name/size/Open/Download) + **Reload preview**
      (presigns live 10 min) + caption "Preview rendered by Microsoft".
      Text branch → `<pre class="nm-preview-text">` from `fileText(id)`.
      Office off → card + "Office previews are off in Settings".
- [ ] Setting: `officePreview: bool = True` (same pattern as §2.1).
- [ ] `NoteEditor.tsx`: `reloadFileUrl` callback for the Reload button.
- [ ] Tests: key extension on presign + share copy (`test_notes.py`), `/text`
      owner ok / non-member 404 / binary 400, setting default + patch.
- [ ] Verify: office iframe renders a real pptx, text file previews, setting
      off → card; both themes, both breakpoints.

### 2.3 PDF viewer (pdf.js)

- [ ] Add `pdfjs-dist` — the **first client dependency**; import lazily only
      when a PDF note opens so the vault stays light. Worker:
      `new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url))`
      (verify under Turbopack; fallback: `?url` import).
- [ ] `client/components/notes/PdfViewer.tsx` (new): page nav (prev/next,
      "page N / M", jump input), zoom in/out/fit, **text layer** (selectable —
      foundation for §3.2 highlights), fullscreen. Replace the `<iframe>` in
      `FilePreview` for `application/pdf`.
- [ ] Why: Android Chrome downloads iframes instead of rendering them; no page
      memory or selection with the native viewer.
- [ ] Page memory: `localStorage["neoma.study." + noteId]` → `{page, scroll}`;
      move to the server when §3.2 lands (`notes.study` JSONB).
- [ ] Keep the bar: Open file / Download unchanged.

### 2.4 Focus view (the left/right study layout)

- [ ] `client/lib/studyView.ts` (new, `useSyncExternalStore` pattern like
      `vaultView.ts`): mode (`split | material | write`) + split ratio,
      persisted per user.
- [ ] Desktop (≥1080px): `grid-template-columns: var(--split) 1fr` with a
      **draggable divider** (pointer events, sensible min widths); `Ctrl+\`
      cycles modes; `Esc` exits fullscreen material. In split mode the
      Details/History sidebar collapses — reuse `NoteDetailsSheet` from the
      chips row.
- [ ] Right pane: title input, type/subject chips, textarea filling the
      remaining height, word count; Save stays in the header (desktop) and the
      bottom bar (mobile).
- [ ] Mobile (<900px): segmented **Material / Notes** tabs; for video a
      **sticky mini-player** while writing (tap → back to Material); for PDF a
      "page N · resume" pill.
- [ ] Material pane uses: `PdfViewer`, video embed (§2.1), Office iframe
      (§2.2), image, text preview (§2.2), link card fallback.
- [ ] Verify: 1280×900 + 390×844 headless shots; drag divider; mode persists;
      page/video position survives reload.

---

## 3. Study roadmap

### 3.1 Capture (make the note a study artefact)

- [ ] YouTube timestamps: body convention `[mm:ss]` / `[hh:mm:ss]`; a **"Stamp
      current time"** button inserts at the caret; clicking a timestamp seeks
      the player (reload iframe with `start=`); timestamps render as chips in
      the right pane when the note has a video.
- [ ] PDF highlights: select text in the pdf.js text layer → floating
      **Highlight** button → store in a new `notes.study` JSONB column
      (Alembic migration, hand-reviewed):
      `{position: {page, scroll}, highlights: [{id, page, rects, quote, color,
      createdAt, tag?}], timestamps: []}`. Render highlights over the text
      layer; excerpts list with "jump to page" and copy-into-note.
- [ ] Page anchors: writing `[p. 12]` becomes a clickable jump.

### 3.2 Recall (the step that makes studying stick)

- [ ] Tables (Alembic): `flashcards` (id, owner_id, note_id, front, back,
      source_highlight_id, due_at, interval_days, ease, reps, lapses,
      suspended, created_at, updated_at) + `study_sessions` (see §3.3).
- [ ] SM-2 scheduling (~40 lines): grades Again / Hard / Good / Easy update
      ease + interval; `due_at` drives the queue.
- [ ] `/review` page: flip card, grade buttons, keyboard 1–4, due count in the
      nav badge. Card list per note; "Add card" from a highlight or selection.
- [ ] Notifications: derived `review_due:{user}` in
      `notification_services.py`; optional inclusion in the daily digest.
- [ ] MCP tools: `list_due_cards`, `create_card`, `grade_card` (read tools
      first, annotations per repo convention).
- [ ] Tests: scheduling math, ownership, due filtering, MCP shapes.

### 3.3 Progress & habit

- [ ] `study_sessions` table (id, user_id, note_id, subject_id, started_at,
      ended_at, seconds, source: timer|manual).
- [ ] Timer on the note page (start/pause/finish); auto-stop after idle;
      writes a session row.
- [ ] Subject dashboard: per subject — note/file counts, last studied, cards
      due, minutes this week; entry point from the vault header.
- [ ] Home (`/today`): **"Continue studying"** card → last note, page/timestamp
      resume; streak from days with sessions or reviews.
- [ ] Tests: session aggregation, dashboard numbers, streak boundaries.

### 3.4 Library depth (search)

- [ ] Text extraction on upload (best-effort, never fails the upload): `pypdf`
      (PDF, with page markers), `python-docx`, `python-pptx`, plain text → new
      `files.extracted_text` + `extracted_at` columns.
- [ ] `scripts/reindex_text.py` (dry-run default) for existing files.
- [ ] Search: include file text with "found in file · page N" snippets; switch
      `note_services.list_notes` from the Python filter to SQL (ILIKE now,
      tsvector when volume justifies); include group notes in vault search.
- [ ] OCR for handwriting — later, separate project (tesseract or an API).

### 3.5 AI — LibreChat inside Neoma

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
- [ ] No R2 CORS change needed for §2.2 (text goes through the API); Office
      viewer fetches presigned URLs directly — watch the 10-min
      `R2_SIGNED_URL_TTL_SECONDS` and use the Reload button.
- [ ] Preview defaults to keep in mind: YouTube oEmbed is public but
      undocumented (3s timeout + fallback); Office preview ships files to
      Microsoft (setting exists); `pypdf`/`python-docx`/`python-pptx` are pure
      Python (no Docker weight).

---

## 5. Open decisions (confirm before/during the relevant phase)

- [ ] LibreChat: public URL, API key, agent id, version (Agents API support).
- [ ] `pdfjs-dist` adoption confirmed (first client dependency, lazy-loaded).
- [ ] "Focus" naming for the split layout (avoid clashing with study *groups*).
- [ ] Whether the timer is manual-start only or prompts on opening a note.

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
