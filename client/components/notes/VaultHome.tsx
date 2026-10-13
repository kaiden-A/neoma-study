"use client";

import Link from "next/link";

import { FolderCard } from "@/components/notes/FolderCard";
import { NoteCard } from "@/components/notes/NoteCard";
import { EmptyState } from "@/components/ui/bits";
import { fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { useNow } from "@/lib/useNow";

const SUGGESTED_LIMIT = 6;

function folderMeta(count: number, latest: number, now: number): string {
  const items = `${count} item${count === 1 ? "" : "s"}`;
  return latest ? `${items} · edited ${fmtRelative(latest, now)}` : items;
}

/** The notes home: folder tiles first, then a capped suggestion instead of
 * the whole vault in one list. Search and the flat "All files" view live in
 * the page around this. */
export function VaultHome({
  notes,
  onOpenNote,
  onNewFolder,
  onSubjectMenu,
  onAdd,
}: {
  notes: Note[];
  onOpenNote: (note: Note) => void;
  onNewFolder: () => void;
  onSubjectMenu: (subjectId: string, event: React.MouseEvent<HTMLElement>) => void;
  onAdd: () => void;
}) {
  const store = useStore();
  const now = useNow(60_000);

  const folders = store.subjects.map((subject) => {
    const inside = notes.filter((note) => note.subjectId === subject.id);
    const latest = inside.reduce((max, note) => Math.max(max, note.updatedAt), 0);
    return { subject, count: inside.length, latest };
  });
  const unsorted = notes.filter((note) => note.subjectId === null);
  const unsortedLatest = unsorted.reduce((max, note) => Math.max(max, note.updatedAt), 0);
  // Pinned first, then most recently edited; a glimpse, not the whole vault.
  const suggested = [...notes]
    .sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1))
    .slice(0, SUGGESTED_LIMIT);

  return (
    <div className="nm-home">
      <section className="nm-home-section">
        <div className="nm-home-head">
          <h2 className="nm-section-title">Folders</h2>
        </div>
        <div className="nm-foldergrid">
          {folders.map(({ subject, count, latest }) => (
            <FolderCard
              key={subject.id}
              href={`/vault?subject=${subject.id}`}
              name={subject.name}
              color={subject.color}
              meta={folderMeta(count, latest, now)}
              onMenu={(event) => onSubjectMenu(subject.id, event)}
            />
          ))}
          {unsorted.length ? (
            <FolderCard
              href="/vault?subject=unsorted"
              name="Unsorted"
              variant="inbox"
              meta={folderMeta(unsorted.length, unsortedLatest, now)}
            />
          ) : null}
          <button type="button" className="nm-foldercard nm-foldercard--add" onClick={onNewFolder}>
            <span className="nm-foldercard-glyph nm-foldercard-glyph--add">
              <i className="fa-solid fa-plus" aria-hidden="true" />
            </span>
            <span className="nm-foldercard-name">New folder</span>
            <span className="nm-foldercard-meta">Group notes by subject</span>
          </button>
        </div>
      </section>

      <section className="nm-home-section">
        <div className="nm-home-head">
          <h2 className="nm-section-title">Suggested for you</h2>
          <Link className="nm-home-more" href="/vault?view=all">
            View all <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
        {suggested.length ? (
          <div className="nm-notegrid">
            {suggested.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={onOpenNote} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="fa-note-sticky"
            title="No notes here yet"
            body="Write a note, photograph your handwriting, or drop in a slide deck or past paper."
            action={
              <button type="button" className="nm-btn nm-btn--primary" onClick={onAdd}>
                Add something
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}
