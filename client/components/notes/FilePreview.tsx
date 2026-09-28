"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { fmtBytes } from "@/lib/dates";
import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { FileText, Note, StudyHighlight, StudyPosition } from "@/lib/types";

// pdfjs-dist is the one client dependency: only fetched when a PDF note opens.
const PdfViewer = dynamic(() => import("@/components/notes/PdfViewer").then((mod) => mod.PdfViewer), {
  ssr: false,
  loading: () => <p className="nm-help nm-preview-caption">Opening reader…</p>,
});

const OFFICE_EXT = /\.(ppt|pptx|doc|docx|xls|xlsx|odt|ods|odp|rtf)$/i;
const OFFICE_TYPE =
  /^(application\/(vnd\.(openxmlformats-officedocument|ms-)|msword|vnd\.oasis\.opendocument)|text\/rtf)/;

/** The file preview on a note page, chosen by what can actually render:
 * images inline, PDFs in the reader, Office files through Microsoft's viewer
 * (opt-out in Settings), text as selectable plain text, everything else a
 * compact file card with the real actions instead of a large empty box. */
export function FilePreview({
  note,
  url,
  failed = false,
  loading = false,
  onReload,
  position,
  highlights,
  onPositionChange,
  onHighlight,
  seekPage,
}: {
  note: Note;
  url: string | null;
  failed?: boolean;
  loading?: boolean;
  onReload?: () => Promise<void>;
  position?: StudyPosition;
  highlights?: StudyHighlight[];
  onPositionChange?: (position: StudyPosition) => void;
  onHighlight?: (highlight: StudyHighlight) => void;
  seekPage?: { page: number; nonce: number } | null;
}) {
  const { settings, fileText } = useStore();
  const type = noteType(note.type);
  const name = note.fileName ?? "stored file";
  const meta = [type.label, note.fileSize ? fmtBytes(note.fileSize) : null].filter(Boolean).join(" · ");
  const isImage = Boolean(note.fileType?.startsWith("image/"));
  const isPdf = note.fileType === "application/pdf";
  const isText = Boolean(
    note.fileType && (note.fileType.startsWith("text/") || note.fileType === "application/json"),
  );
  const isOffice = Boolean(
    note.fileId &&
      !isPdf &&
      !isText &&
      (OFFICE_TYPE.test(note.fileType ?? "") || OFFICE_EXT.test(note.fileName ?? "")),
  );
  const officeOn = settings?.officePreview !== false;

  const [text, setText] = useState<FileText | null>(null);
  const [textFailed, setTextFailed] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!isText || !note.fileId) return;
    let active = true;
    fileText(note.fileId)
      .then((value) => {
        if (active) setText(value);
      })
      .catch(() => {
        if (active) setTextFailed(true);
      });
    return () => {
      active = false;
    };
  }, [fileText, isText, note.fileId]);

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

  const reloadButton = onReload ? (
    <button
      type="button"
      className="nm-btn nm-btn--ghost nm-btn--sm"
      disabled={reloading}
      onClick={() => {
        setReloading(true);
        void onReload().finally(() => setReloading(false));
      }}
    >
      <i className="fa-solid fa-rotate" aria-hidden="true" />
      {reloading ? "Reloading…" : "Reload preview"}
    </button>
  ) : null;

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

  if (url && isOffice && officeOn && !failed) {
    const source = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    return (
      <figure className={`nm-preview nm-preview--office nm-mk-${type.marker}`}>
        <figcaption className="nm-preview-bar">
          <span className="nm-preview-barinfo">
            <span className="nm-preview-name" title={name}>
              {name}
            </span>
            <span className="nm-mono nm-preview-meta">{meta}</span>
          </span>
          <span className="nm-preview-actions">
            {reloadButton}
            {actions}
          </span>
        </figcaption>
        <iframe key={url} className="nm-preview-frame" src={source} title={`Preview of ${note.title}`} />
        <p className="nm-help nm-preview-caption">Preview rendered by Microsoft</p>
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
        <PdfViewer
          url={url}
          title={note.title}
          position={position ?? note.study.position}
          highlights={highlights ?? note.study.highlights}
          onPositionChange={onPositionChange}
          onHighlight={onHighlight}
          seekPage={seekPage}
        />
      </figure>
    );
  }

  if (isText && !failed) {
    return (
      <figure className={`nm-preview nm-preview--text nm-mk-${type.marker}`}>
        <figcaption className="nm-preview-bar">
          <span className="nm-preview-barinfo">
            <span className="nm-preview-name" title={name}>
              {name}
            </span>
            <span className="nm-mono nm-preview-meta">{meta}</span>
          </span>
          {actions}
        </figcaption>
        {textFailed ? (
          <p className="nm-help nm-preview-caption">Could not read that file.</p>
        ) : text ? (
          <>
            <pre className="nm-preview-text">{text.text}</pre>
            {text.truncated ? (
              <p className="nm-help nm-preview-caption">Showing the first 256 KB.</p>
            ) : null}
          </>
        ) : (
          <p className="nm-help nm-preview-caption">Reading file…</p>
        )}
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
          {failed
            ? "Preview unavailable"
            : isOffice && !officeOn
              ? `${meta} · Office previews are off in Settings`
              : `${meta} · no inline preview`}
        </span>
      </span>
      {actions}
    </figure>
  );
}
