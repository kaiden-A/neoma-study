"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { FilePreview } from "@/components/notes/FilePreview";
import { useNoteActions } from "@/components/notes/NoteActions";
import { NoteDetailsSheet } from "@/components/notes/NoteDetailsSheet";
import { EmptyState, MarkerChip } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { parseTags } from "@/lib/files";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";

interface Baseline {
  title: string;
  body: string;
  tags: string[];
  subjectId: string | null;
}

export function NoteEditor({ noteId }: { noteId: string }) {
  const store = useStore();
  const router = useRouter();
  const note = store.noteById(noteId);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [subjectId, setSubjectId] = useState<string | null>(note?.subjectId ?? null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!note || loaded.current) return;
    loaded.current = true;
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
    setSubjectId(note.subjectId);
    setBaseline({ title: note.title, body: note.body, tags: note.tags, subjectId: note.subjectId });
  }, [note]);

  useEffect(() => {
    let active = true;
    if (!note?.fileId) return;
    store
      .fileUrl(note.fileId)
      .then((url) => {
        if (active) setFileUrl(url);
      })
      .catch(() => {
        if (active) setFileMissing(true);
      });
    return () => {
      active = false;
    };
  }, [note?.fileId, store]);

  const parsedTags = parseTags(tags);
  const dirty = Boolean(
    baseline &&
      (title !== baseline.title ||
        body !== baseline.body ||
        subjectId !== baseline.subjectId ||
        parsedTags.join("\u0000") !== baseline.tags.join("\u0000")),
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!note) return false;
    const nextTitle = title.trim() || "Untitled";
    const nextTags = parseTags(tags);
    setSaveState("saving");
    try {
      await store.updateNote(note.id, { title: nextTitle, body, tags: nextTags, subjectId });
      setTitle(nextTitle);
      setBaseline({ title: nextTitle, body, tags: nextTags, subjectId });
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setTimeout(() => {
        setSaveState("idle");
        setSavedAt(null);
      }, 2500);
      return true;
    } catch {
      // The store rolls the note back and says what went wrong.
      setSaveState("idle");
      return false;
    }
  }, [body, note, setBaseline, setSaveState, setSavedAt, setTitle, store, subjectId, tags, title]);

  // Ctrl/Cmd+S saves without reaching for the button.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) void save();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  // Leaving the page with unsaved edits: in-app links go through the guard
  // dialog, refresh/close through the browser's own prompt.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      // Capture phase: Next's Link never sees the click, so it cannot navigate.
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(`${url.pathname}${url.search}`);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const actions = useNoteActions(note, {
    onDelete: () => router.push(note?.groupId ? `/groups/${note.groupId}?tab=notes` : "/vault"),
  });

  if (!note) {
    return (
      <div className="nm-page">
        <EmptyState
          icon="fa-circle-question"
          title={store.ready ? "That item is gone" : "Loading…"}
          body={store.ready ? "It may have been deleted from your notes." : undefined}
          action={
            store.ready ? (
              <Link className="nm-btn nm-btn--secondary" href="/vault">
                Back to notes
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const type = noteType(note.type);
  const group = note.groupId ? store.groupById(note.groupId) : null;
  const subject = subjectId ? store.subjectById(subjectId) : null;
  const isFile = Boolean(note.fileId);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  const saveLabel = saveState === "saving" ? "Saving…" : "Save changes";

  return (
    <div className="nm-page nm-page--note">
      {actions.overlays}

      <div className="nm-note-top">
        <Link className="nm-backlink" href="/vault">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Notes
        </Link>
        <span
          className={`nm-savestate nm-mono${dirty ? " is-dirty" : ""}${saveState === "saved" ? " is-saved" : ""}`}
          aria-live="polite"
        >
          {saveState === "saving" ? "Saving…" : dirty ? "Unsaved changes" : saveState === "saved" ? `Saved ${savedAt}` : ""}
        </span>
        <div className="nm-note-topactions">
          <button
            type="button"
            className="nm-btn nm-btn--primary nm-btn--sm nm-save-desktop"
            onClick={() => void save()}
            disabled={!dirty || saveState === "saving"}
          >
            <i className="fa-solid fa-check" aria-hidden="true" />
            {saveLabel}
          </button>
          {group ? null : (
            <button
              type="button"
              className="nm-btn nm-btn--secondary nm-btn--sm"
              aria-label="Share to group"
              onClick={() => actions.share()}
            >
              <i className="fa-solid fa-share-nodes" aria-hidden="true" />
              <span className="nm-btn-label">Share to group</span>
            </button>
          )}
          <button type="button" className="nm-iconbtn" aria-label="Item actions" onClick={actions.openMenu}>
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="nm-note-layout">
        <div className="nm-note-main">
          <div className="nm-note-chips">
            <span className={`nm-chip nm-chip--sm nm-chip--mark nm-mk-${type.marker}`}>
              <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
              {type.label}
            </span>
            {group ? (
              <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`} title={group.name}>
                <span className="nm-dot" />
                <span className="nm-chip-name">{group.name}</span>
              </span>
            ) : subject ? (
              <MarkerChip name={subject.name} markerKey={subject.color} small />
            ) : null}
            {note.pinned ? (
              <span className="nm-chip nm-chip--sm nm-chip--muted" title="Pinned">
                <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                Pinned
              </span>
            ) : null}
          </div>

          <input
            className="nm-note-titleinput"
            aria-label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          {note.type === "link" && note.url ? (
            <div className="nm-linkcard">
              <i className="fa-solid fa-link nm-linkcard-icon" aria-hidden="true" />
              <div className="nm-linkcard-bd">
                <div className="nm-linkcard-label">{note.title}</div>
                <div className="nm-linkcard-url nm-mono">{note.url}</div>
              </div>
              <a className="nm-btn nm-btn--secondary nm-btn--sm" href={note.url} target="_blank" rel="noopener">
                Open link
              </a>
            </div>
          ) : null}

          {isFile ? (
            <FilePreview note={note} url={fileUrl} failed={fileMissing} loading={!fileUrl && !fileMissing} />
          ) : null}

          <div className="nm-writer">
            <div className="nm-writer-head">
              <label className="nm-label" htmlFor="note-body">
                {isFile ? "Your notes on this file" : "Notes"}
              </label>
              <span className="nm-mono nm-writer-count">
                {words} word{words === 1 ? "" : "s"}
              </span>
            </div>
            <textarea
              id="note-body"
              className="nm-textarea nm-note-body"
              rows={14}
              value={body}
              placeholder="Write it out in your own words — that is what makes it stick."
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const next = `${body.slice(0, start)}  ${body.slice(target.selectionEnd)}`;
                  setBody(next);
                  requestAnimationFrame(() => {
                    target.selectionStart = target.selectionEnd = start + 2;
                  });
                }
              }}
            />
            <p className="nm-help nm-writer-help">
              Plain text. Line breaks are preserved. Press Save changes when you are done.
            </p>
          </div>
        </div>

        <aside className="nm-note-side">
          <div className="nm-card">
            <div className="nm-card-hd">
              <h2 className="nm-card-title">Details</h2>
            </div>
            <div className="nm-card-bd">
              <div className="nm-field">
                <label className="nm-label" htmlFor="note-subject">
                  Subject
                </label>
                <select
                  id="note-subject"
                  className="nm-select"
                  value={subjectId ?? ""}
                  onChange={(event) => setSubjectId(event.target.value || null)}
                >
                  <option value="">No subject</option>
                  {store.subjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="nm-field">
                <label className="nm-label" htmlFor="note-tags">
                  Tags
                </label>
                <input
                  id="note-tags"
                  className="nm-input"
                  placeholder="exam, lab, week 3"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                />
                <p className="nm-help">Comma separated.</p>
              </div>
            </div>
          </div>

          <div className="nm-card">
            <div className="nm-card-hd">
              <h2 className="nm-card-title">History</h2>
            </div>
            <div className="nm-card-bd">
              <p className="nm-meta">Created {fmtDateTime(note.createdAt)}</p>
              <p className="nm-meta">Updated {fmtRelative(note.updatedAt)}</p>
              {note.createdBy && note.createdBy !== store.user?.id ? (
                <p className="nm-meta">Shared by {store.userName(note.createdBy)}</p>
              ) : null}
              <button
                type="button"
                className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm mt-3"
                onClick={() => void actions.remove()}
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
                Delete item
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="nm-note-bottombar">
        <button type="button" className="nm-btn nm-btn--secondary" onClick={() => setDetailsOpen(true)}>
          <i className="fa-solid fa-sliders" aria-hidden="true" />
          Details
        </button>
        <button
          type="button"
          className="nm-btn nm-btn--primary"
          onClick={() => void save()}
          disabled={!dirty || saveState === "saving"}
        >
          <i className="fa-solid fa-check" aria-hidden="true" />
          {saveLabel}
        </button>
      </div>

      {detailsOpen ? (
        <NoteDetailsSheet
          note={note}
          subjectId={subjectId}
          onSubjectChange={setSubjectId}
          tags={tags}
          onTagsChange={setTags}
          fileUrl={fileUrl}
          onClose={() => setDetailsOpen(false)}
          onDelete={() => void actions.remove()}
        />
      ) : null}

      {leaveHref ? (
        <Modal
          title="Save your changes?"
          size="sm"
          onClose={() => setLeaveHref(null)}
          footer={
            <>
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setLeaveHref(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--ghost"
                onClick={() => {
                  const href = leaveHref;
                  setLeaveHref(null);
                  router.push(href);
                }}
              >
                Discard
              </button>
              <div className="nm-spacer" />
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={() => {
                  const href = leaveHref;
                  void save().then((ok) => {
                    setLeaveHref(null);
                    if (ok) router.push(href);
                  });
                }}
              >
                Save &amp; leave
              </button>
            </>
          }
        >
          <p className="nm-body-text">This note has unsaved edits. Save them before leaving?</p>
        </Modal>
      ) : null}
    </div>
  );
}
