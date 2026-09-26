"use client";

import { Modal } from "@/components/ui/Modal";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { fmtBytes } from "@/lib/files";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** Mobile stand-in for the desktop sidebar: subject, tags, file actions and
 * history in a sheet that is one thumb-tap away. Edits land in the editor's
 * local state and are committed by the Save button. */
export function NoteDetailsSheet({
  note,
  subjectId,
  onSubjectChange,
  tags,
  onTagsChange,
  fileUrl,
  onClose,
  onDelete,
}: {
  note: Note;
  subjectId: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  tags: string;
  onTagsChange: (tags: string) => void;
  fileUrl: string | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  const store = useStore();

  return (
    <Modal
      title="Details"
      subtitle="Saved with the note when you press Save changes."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="nm-field">
        <label className="nm-label" htmlFor="sheet-note-subject">
          Subject
        </label>
        <select
          id="sheet-note-subject"
          className="nm-select"
          value={subjectId ?? ""}
          onChange={(event) => onSubjectChange(event.target.value || null)}
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
        <label className="nm-label" htmlFor="sheet-note-tags">
          Tags
        </label>
        <input
          id="sheet-note-tags"
          className="nm-input"
          placeholder="exam, lab, week 3"
          value={tags}
          onChange={(event) => onTagsChange(event.target.value)}
        />
        <p className="nm-help">Comma separated.</p>
      </div>

      {note.fileId ? (
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
              disabled={!fileUrl}
              onClick={() => {
                if (fileUrl) window.open(fileUrl, "_blank", "noopener");
              }}
            >
              Open file
            </button>
            {fileUrl ? (
              <a className="nm-btn nm-btn--ghost nm-btn--sm" href={fileUrl} download={note.fileName ?? undefined}>
                Download
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="nm-field">
        <span className="nm-label">History</span>
        <p className="nm-meta">Created {fmtDateTime(note.createdAt)}</p>
        <p className="nm-meta">Updated {fmtRelative(note.updatedAt)}</p>
        {note.createdBy && note.createdBy !== store.user?.id ? (
          <p className="nm-meta">Shared by {store.userName(note.createdBy)}</p>
        ) : null}
      </div>

      <button
        type="button"
        className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm"
        onClick={() => {
          onClose();
          onDelete();
        }}
      >
        <i className="fa-solid fa-trash" aria-hidden="true" />
        Delete item
      </button>
    </Modal>
  );
}
