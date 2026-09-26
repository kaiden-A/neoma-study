"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { FilePreview } from "@/components/notes/FilePreview";
import { useNoteActions } from "@/components/notes/NoteActions";
import { EmptyState, MarkerChip } from "@/components/ui/bits";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { parseTags } from "@/lib/files";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";

export function NoteEditor({ noteId }: { noteId: string }) {
  const store = useStore();
  const router = useRouter();
  const note = store.noteById(noteId);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!note || loaded.current) return;
    loaded.current = true;
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
  }, [note]);

  const flush = useCallback(
    async (patch?: Partial<{ title: string; body: string; tags: string[] }>) => {
      if (!note) return;
      try {
        await store.updateNote(note.id, {
          title: (patch?.title ?? title).trim() || "Untitled",
          body: patch?.body ?? body,
          tags: patch?.tags ?? parseTags(tags),
        });
        setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
        setTimeout(() => setSavedAt(null), 1600);
      } catch {
        // The store rolls the note back and says what went wrong.
      }
    },
    [body, note, store, tags, title],
  );

  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    };
  }, [flush]);

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
  const subject = note.subjectId ? store.subjectById(note.subjectId) : null;
  const isFile = Boolean(note.fileId);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="nm-page nm-page--note">
      {actions.overlays}

      <div className="nm-note-top">
        <Link className="nm-backlink" href="/vault">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Notes
        </Link>
        <span className="nm-savestate nm-mono" aria-live="polite">
          {savedAt ? `Saved ${savedAt}` : ""}
        </span>
        <div className="nm-note-topactions">
          {group ? null : (
            <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => actions.share()}>
              <i className="fa-solid fa-share-nodes" aria-hidden="true" />
              Share to group
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
            onChange={(event) => {
              setTitle(event.target.value);
              scheduleSave();
            }}
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
              onChange={(event) => {
                setBody(event.target.value);
                scheduleSave();
              }}
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
                  scheduleSave();
                }
              }}
            />
            <p className="nm-help nm-writer-help">Plain text. Line breaks are preserved. Everything saves automatically.</p>
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
                  value={note.subjectId ?? ""}
                  onChange={(event) => {
                    void store.updateNote(note.id, { subjectId: event.target.value || null }).catch(() => {});
                  }}
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
                  onChange={(event) => {
                    setTags(event.target.value);
                    scheduleSave();
                  }}
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
    </div>
  );
}
