"use client";

import { useState } from "react";

import { NoteThumb } from "@/components/notes/NoteThumb";
import { MarkerChip } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { fmtRelative, truncate } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const type = noteType(note.type);
  const group = note.groupId ? store.groupById(note.groupId) : null;
  const subject = note.subjectId ? store.subjectById(note.subjectId) : null;

  return (
    <article className={`nm-notecard nm-mk-${type.marker}`}>
      <button type="button" className="nm-notecard-link" aria-label={`Open ${note.title}`} onClick={() => onOpen(note)}>
        {note.type !== "note" && note.type !== "link" ? <NoteThumb note={note} alt={`Preview of ${note.title}`} /> : null}
        {note.type === "link" ? (
          <div className="nm-notecard-thumb nm-notecard-thumb--link">
            <i className="fa-solid fa-arrow-up-right-from-square nm-thumb-ph" aria-hidden="true" />
          </div>
        ) : null}
      </button>
      <div className="nm-notecard-bd">
        <div className="nm-notecard-top">
          <span className={`nm-chip nm-chip--sm nm-mk-${type.marker}`}>
            <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
            {type.label}
          </span>
          {note.pinned ? (
            <span className="nm-chip nm-chip--sm nm-chip--muted" title="Pinned">
              <i className="fa-solid fa-thumbtack" aria-hidden="true" />
              Pinned
            </span>
          ) : null}
        </div>
        <h3 className="nm-notecard-title">
          <button type="button" className="nm-link" onClick={() => onOpen(note)}>
            {note.title}
          </button>
        </h3>
        {note.body ? <p className="nm-notecard-body">{truncate(note.body.replace(/\s+/g, " "), 120)}</p> : null}
        <div className="nm-notecard-ft">
          {group ? (
            <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`}>
              <span className="nm-dot" />
              {group.name}
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
          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm"
            aria-label="Item actions"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen(true);
            }}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <Menu
          label="Item actions"
          onClose={() => setMenuOpen(false)}
          style={{ position: "fixed", right: 24, top: 130 }}
          items={[
            { label: "Open", icon: "fa-arrow-up-right-from-square", onSelect: () => onOpen(note) },
            {
              label: note.pinned ? "Unpin" : "Pin to top",
              icon: "fa-thumbtack",
              onSelect: () => {
                void store.updateNote(note.id, { pinned: !note.pinned }).then(() => onChanged?.());
              },
            },
            { separator: true },
            {
              label: "Delete",
              icon: "fa-trash",
              danger: true,
              onSelect: () => {
                void store.deleteNote(note.id).then(() => onChanged?.());
              },
            },
          ]}
        />
      ) : null}
    </article>
  );
}
