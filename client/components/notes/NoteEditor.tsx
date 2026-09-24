"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState, MarkerChip } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { ShareToGroupModal } from "@/components/notes/ShareToGroupModal";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { fmtBytes, parseTags } from "@/lib/files";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";

export function NoteEditor({ noteId }: { noteId: string }) {
  const store = useStore();
  const router = useRouter();
  const { toast, confirm } = useOverlays();
  const note = store.noteById(noteId);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [saved, setSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
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

  async function remove() {
    if (!note) return;
    const ok = await confirm({
      title: `Delete “${note.title}”?`,
      message: group
        ? "This removes the shared note for everyone in the group."
        : "This removes it from your notes.",
      confirmLabel: "Delete item",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteNote(note.id);
      toast("Deleted", { kind: "info" });
      router.push(group ? `/groups/${group.id}?tab=notes` : "/vault");
    } catch {
      // The store puts the note back and says what went wrong.
    }
  }

  return (
    <div className="nm-page">
      <div className="nm-note-top">
        <Link className="nm-backlink" href="/vault">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Notes
        </Link>
        <span className={`nm-savestate nm-mono${saved ? " is-saved" : ""}`} aria-live="polite">
          {saved ? `Saved ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
        <div className="nm-note-topactions">
          <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => setShareOpen(true)}>
            <i className="fa-solid fa-share-nodes" aria-hidden="true" />
            Share to group
          </button>
          <button
            type="button"
            className="nm-iconbtn"
            aria-label="Item actions"
            onClick={() => setMenuOpen(true)}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="nm-note-layout">
        <div>
          <div className="nm-note-chips">
            <span className={`nm-chip nm-chip--sm nm-mk-${type.marker}`}>
              <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
              {type.label}
            </span>
            {group ? (
              <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`}>
                <span className="nm-dot" />
                {group.name}
              </span>
            ) : subject ? (
              <MarkerChip name={subject.name} markerKey={subject.color} small />
            ) : null}
            <span className="nm-mono nm-meta">{words} word{words === 1 ? "" : "s"}</span>
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
            <figure className="nm-preview">
              {fileMissing ? (
                <div className="nm-thumb-ph">Preview unavailable</div>
              ) : note.fileType?.startsWith("image/") ? (
                fileUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={`Preview of ${note.title}`} />
                ) : (
                  <div className="nm-thumb-ph">
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                  </div>
                )
              ) : fileUrl ? (
                <object className="nm-preview-frame" data={fileUrl} type={note.fileType ?? undefined}>
                  Open the file to view it
                </object>
              ) : (
                <div className="nm-thumb-ph">
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                </div>
              )}
            </figure>
          ) : null}

          {!isFile && note.type !== "link" ? null : null}

          <label className="nm-label" htmlFor="note-body">
            {isFile ? "Your notes on this file" : "Notes"}
          </label>
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
          <p className="nm-help">Plain text. Line breaks are preserved. Everything saves automatically.</p>
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
              {isFile ? (
                <div className="nm-field">
                  <span className="nm-label">File</span>
                  <p className="nm-mono nm-meta">
                    {note.fileName ?? "stored file"}
                    {note.fileSize ? ` · ${fmtBytes(note.fileSize)}` : ""}
                  </p>
                  <div className="nm-inline-actions">
                    <button
                      type="button"
                      className="nm-btn nm-btn--secondary nm-btn--sm"
                      onClick={() => {
                        if (fileUrl) window.open(fileUrl, "_blank", "noopener");
                        else toast("File is not available", { kind: "danger" });
                      }}
                    >
                      Open file
                    </button>
                    <a className="nm-btn nm-btn--ghost nm-btn--sm" href={fileUrl ?? "#"} download={note.fileName ?? undefined}>
                      Download
                    </a>
                  </div>
                </div>
              ) : null}
              {note.pinned ? (
                <p className="nm-help">
                  <i className="fa-solid fa-thumbtack" aria-hidden="true" /> Pinned to the top of your notes.
                </p>
              ) : null}
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
              <button type="button" className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm mt-3" onClick={() => void remove()}>
                Delete item
              </button>
            </div>
          </div>
        </aside>
      </div>

      {menuOpen ? (
        <Menu
          label="Item actions"
          onClose={() => setMenuOpen(false)}
          style={{ position: "fixed", right: 24, top: 120 }}
          items={[
            {
              label: note.pinned ? "Unpin" : "Pin to top",
              icon: "fa-thumbtack",
              onSelect: () => void store.updateNote(note.id, { pinned: !note.pinned }).catch(() => {}),
            },
            { label: "Share to group", icon: "fa-share-nodes", onSelect: () => setShareOpen(true) },
            { separator: true },
            { label: "Delete item", icon: "fa-trash", danger: true, onSelect: () => void remove() },
          ]}
        />
      ) : null}

      {shareOpen ? <ShareToGroupModal note={note} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
