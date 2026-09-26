"use client";

import { useNoteActions } from "@/components/notes/NoteActions";
import { NoteThumb } from "@/components/notes/NoteThumb";
import { MarkerChip } from "@/components/ui/bits";
import { fmtRelative, plain, truncate } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** Gallery card, used when the vault is switched to grid view. */
export function NoteCard({
  note,
  onOpen,
  onChanged,
}: {
  note: Note;
  onOpen: (note: Note) => void;
  onChanged?: () => void;
}) {
  const store = useStore();
  const { openMenu, overlays } = useNoteActions(note, { onChange: onChanged });
  const type = noteType(note.type);
  const group = note.groupId ? store.groupById(note.groupId) : null;
  const subject = note.subjectId ? store.subjectById(note.subjectId) : null;
  const hasThumb = note.type !== "note" && note.type !== "link";

  return (
    <article className={`nm-notecard nm-mk-${type.marker}${note.pinned ? " is-pinned" : ""}`}>
      <button
        type="button"
        className="nm-notecard-link"
        aria-label={`Open ${note.title}`}
        onClick={() => onOpen(note)}
      >
        {hasThumb ? (
          <NoteThumb note={note} alt="" className="nm-notecard-thumb" />
        ) : (
          <span className={`nm-notecard-strip nm-mk-${type.marker}`}>
            <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
          </span>
        )}
      </button>
      <div className="nm-notecard-bd">
        <div className="nm-notecard-top">
          <span className={`nm-chip nm-chip--sm nm-chip--mark nm-mk-${type.marker}`}>
            <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
            {type.label}
          </span>
          {note.pinned ? (
            <span className="nm-chip nm-chip--sm nm-chip--muted" title="Pinned">
              <i className="fa-solid fa-thumbtack" aria-hidden="true" />
              Pinned
            </span>
          ) : null}
          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm nm-notecard-menu"
            aria-label="Item actions"
            onClick={openMenu}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        </div>
        <h3 className="nm-notecard-title">
          <button type="button" className="nm-link" onClick={() => onOpen(note)}>
            {note.title}
          </button>
        </h3>
        {note.body ? <p className="nm-notecard-body">{truncate(plain(note.body), 120)}</p> : null}
        <div className="nm-notecard-ft">
          {group ? (
            <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`} title={group.name}>
              <span className="nm-dot" />
              <span className="nm-chip-name">{group.name}</span>
            </span>
          ) : subject ? (
            <MarkerChip name={subject.name} markerKey={subject.color} small />
          ) : null}
          {note.tags.slice(0, 2).map((tag) => (
            <span className="nm-tag" key={tag}>
              #{tag}
            </span>
          ))}
          <span className="nm-mono nm-time">{fmtRelative(note.updatedAt)}</span>
        </div>
      </div>
      {overlays}
    </article>
  );
}
