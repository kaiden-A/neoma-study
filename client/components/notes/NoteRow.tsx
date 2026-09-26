"use client";

import { useNoteActions } from "@/components/notes/NoteActions";
import { NoteThumb } from "@/components/notes/NoteThumb";
import { MarkerChip } from "@/components/ui/bits";
import { fmtRelative, plain, truncate } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** The default vault layout: one scannable row per note. */
export function NoteRow({
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
  const snippet = note.body ? truncate(plain(note.body), 170) : note.url ?? "";

  return (
    <article className={`nm-noterow nm-mk-${type.marker}${note.pinned ? " is-pinned" : ""}`}>
      <button type="button" className="nm-noterow-link" aria-label={`Open ${note.title}`} onClick={() => onOpen(note)}>
        <NoteThumb note={note} alt="" className="nm-noterow-thumb" />
        <span className="nm-noterow-bd">
          <span className="nm-noterow-titlerow">
            {note.pinned ? <i className="fa-solid fa-thumbtack nm-noterow-pin" aria-hidden="true" /> : null}
            <span className="nm-noterow-title">{note.title}</span>
          </span>
          {snippet ? <span className="nm-noterow-snippet">{snippet}</span> : null}
          <span className="nm-noterow-meta">
            <span className={`nm-chip nm-chip--sm nm-mk-${type.marker}`}>
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
            {note.tags.slice(0, 3).map((tag) => (
              <span className="nm-tag" key={tag}>
                #{tag}
              </span>
            ))}
            <span className="nm-mono nm-time">{fmtRelative(note.updatedAt)}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="nm-iconbtn nm-iconbtn--sm nm-noterow-menu"
        aria-label="Item actions"
        onClick={openMenu}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden="true" />
      </button>
      {overlays}
    </article>
  );
}
