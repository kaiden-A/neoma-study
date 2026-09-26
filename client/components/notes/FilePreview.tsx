"use client";

import { fmtBytes } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import type { Note } from "@/lib/types";

/** The file preview on a note page, chosen by what the browser can actually
 * render: images inline, PDFs in a frame, everything else a compact file card
 * with the real actions instead of a large empty box. */
export function FilePreview({
  note,
  url,
  failed = false,
  loading = false,
}: {
  note: Note;
  url: string | null;
  failed?: boolean;
  loading?: boolean;
}) {
  const type = noteType(note.type);
  const name = note.fileName ?? "stored file";
  const meta = [type.label, note.fileSize ? fmtBytes(note.fileSize) : null].filter(Boolean).join(" · ");
  const isImage = Boolean(note.fileType?.startsWith("image/"));
  const isPdf = note.fileType === "application/pdf";

  const actions = (
    <span className="nm-preview-actions">
      {url ? (
        <a className="nm-btn nm-btn--secondary nm-btn--sm" href={url} target="_blank" rel="noopener">
          <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          Open file
        </a>
      ) : (
        <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" disabled>
          Open file
        </button>
      )}
      {url ? (
        <a className="nm-btn nm-btn--ghost nm-btn--sm" href={url} download={note.fileName ?? undefined}>
          <i className="fa-solid fa-download" aria-hidden="true" />
          Download
        </a>
      ) : null}
    </span>
  );

  if (loading) {
    return (
      <figure className={`nm-preview nm-preview--loading nm-mk-${type.marker}`} aria-label={`Loading preview of ${name}`}>
        <span className="nm-preview-fileicon">
          <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
        </span>
      </figure>
    );
  }

  if (url && isImage && !failed) {
    return (
      <figure className={`nm-preview nm-preview--image nm-mk-${type.marker}`}>
        <a className="nm-preview-imgwrap" href={url} target="_blank" rel="noopener" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Preview of ${note.title}`} />
        </a>
        <figcaption className="nm-preview-bar">
          <span className="nm-preview-barinfo">
            <span className="nm-preview-name" title={name}>
              {name}
            </span>
            <span className="nm-mono nm-preview-meta">{meta}</span>
          </span>
          {actions}
        </figcaption>
      </figure>
    );
  }

  if (url && isPdf && !failed) {
    return (
      <figure className={`nm-preview nm-preview--pdf nm-mk-${type.marker}`}>
        <figcaption className="nm-preview-bar">
          <span className="nm-preview-barinfo">
            <span className="nm-preview-name" title={name}>
              {name}
            </span>
            <span className="nm-mono nm-preview-meta">{meta}</span>
          </span>
          {actions}
        </figcaption>
        <iframe className="nm-preview-frame" src={url} title={`Preview of ${note.title}`} />
      </figure>
    );
  }

  return (
    <figure className={`nm-preview nm-preview--file nm-mk-${type.marker}`}>
      <span className="nm-preview-fileicon">
        <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
      </span>
      <span className="nm-preview-filetext">
        <span className="nm-preview-name" title={name}>
          {name}
        </span>
        <span className="nm-mono nm-preview-meta">
          {failed ? "Preview unavailable" : `${meta} · no inline preview`}
        </span>
      </span>
      {actions}
    </figure>
  );
}
