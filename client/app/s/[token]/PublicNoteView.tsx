"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { MoonMark } from "@/components/MoonMark";
import { EmptyState } from "@/components/ui/bits";
import { apiGet } from "@/lib/api-client";
import { fmtBytes } from "@/lib/dates";
import { renderMarkdown } from "@/lib/markdown";
import { noteType } from "@/lib/markers";
import type { PublicNote } from "@/lib/types";

const OFFICE_EXT = /\.(ppt|pptx|doc|docx|xls|xlsx|odt|ods|odp|rtf)$/i;
const OFFICE_TYPE =
  /^(application\/(vnd\.(openxmlformats-officedocument|ms-)|msword|vnd\.oasis\.opendocument)|text\/rtf)/;

/** The read-only public view at /s/[token]. Deliberately store-free: an
 * anonymous visitor fetches only the public share endpoints, so nothing here
 * can bounce them to /login. */
export function PublicNoteView({ token }: { token: string }) {
  const [note, setNote] = useState<PublicNote | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<PublicNote>(`/api/shares/${encodeURIComponent(token)}`)
      .then((data) => {
        if (!active) return;
        setNote(data);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("missing");
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!note?.file) return;
    let active = true;
    apiGet<{ url: string }>(`/api/shares/${encodeURIComponent(token)}/file`)
      .then((data) => {
        if (active) setFileUrl(data.url);
      })
      .catch(() => {
        if (active) setFileUrl(null);
      });
    return () => {
      active = false;
    };
  }, [note?.file, token]);

  if (status === "loading") {
    return (
      <main className="nm-page max-w-[760px]">
        <EmptyState icon="fa-moon" title="Opening the note…" />
      </main>
    );
  }

  if (status === "missing" || !note) {
    return (
      <main className="nm-page max-w-[760px]">
        <EmptyState
          icon="fa-link-slash"
          title="This link is not available"
          body="It may have been turned off by the note’s owner, or it never existed."
          action={
            <Link className="nm-btn nm-btn--primary" href="/">
              Go to Neoma
            </Link>
          }
        />
      </main>
    );
  }

  const type = noteType(note.type);
  const file = note.file;
  const isImage = Boolean(file?.contentType.startsWith("image/"));
  const isPdf = file?.contentType === "application/pdf";
  const isOffice = Boolean(
    file && !isPdf && (OFFICE_TYPE.test(file.contentType) || OFFICE_EXT.test(file.name)),
  );
  const meta = [type.label, file?.size ? fmtBytes(file.size) : null].filter(Boolean).join(" · ");

  const fileActions = (
    <span className="nm-preview-actions">
      {fileUrl ? (
        <a className="nm-btn nm-btn--secondary nm-btn--sm" href={fileUrl} target="_blank" rel="noopener">
          <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
          Open file
        </a>
      ) : (
        <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" disabled>
          Open file
        </button>
      )}
      {fileUrl ? (
        <a className="nm-btn nm-btn--ghost nm-btn--sm" href={fileUrl} download={file?.name ?? undefined}>
          <i className="fa-solid fa-download" aria-hidden="true" />
          Download
        </a>
      ) : null}
    </span>
  );

  let filePane: React.ReactNode = null;
  if (file) {
    if (fileUrl && isImage) {
      filePane = (
        <figure className="nm-preview nm-preview--image">
          <a className="nm-preview-imgwrap" href={fileUrl} target="_blank" rel="noopener" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt={`Preview of ${note.title}`} />
          </a>
          <figcaption className="nm-preview-bar">
            <span className="nm-preview-barinfo">
              <span className="nm-preview-name" title={file.name}>
                {file.name}
              </span>
              <span className="nm-mono nm-preview-meta">{meta}</span>
            </span>
            {fileActions}
          </figcaption>
        </figure>
      );
    } else if (fileUrl && isOffice) {
      const source = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
      filePane = (
        <figure className="nm-preview nm-preview--office">
          <figcaption className="nm-preview-bar">
            <span className="nm-preview-barinfo">
              <span className="nm-preview-name" title={file.name}>
                {file.name}
              </span>
              <span className="nm-mono nm-preview-meta">{meta}</span>
            </span>
            {fileActions}
          </figcaption>
          <iframe key={fileUrl} className="nm-preview-frame" src={source} title={`Preview of ${note.title}`} />
          <p className="nm-help nm-preview-caption">Preview rendered by Microsoft</p>
        </figure>
      );
    } else if (fileUrl && isPdf) {
      filePane = (
        <figure className="nm-preview nm-preview--pdf">
          <figcaption className="nm-preview-bar">
            <span className="nm-preview-barinfo">
              <span className="nm-preview-name" title={file.name}>
                {file.name}
              </span>
              <span className="nm-mono nm-preview-meta">{meta}</span>
            </span>
            {fileActions}
          </figcaption>
          <iframe key={fileUrl} className="nm-preview-frame" src={fileUrl} title={note.title} />
        </figure>
      );
    } else {
      filePane = (
        <figure className="nm-preview nm-preview--file">
          <span className="nm-preview-fileicon">
            <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
          </span>
          <span className="nm-preview-filetext">
            <span className="nm-preview-name" title={file.name}>
              {file.name}
            </span>
            <span className="nm-mono nm-preview-meta">
              {fileUrl ? `${meta} · attachment` : "Preparing the file…"}
            </span>
          </span>
          {fileUrl ? fileActions : null}
        </figure>
      );
    }
  }

  return (
    <main className="nm-page max-w-[760px]">
      <header className="mb-5">
        <span className="nm-eyebrow">Shared note from {note.sharedBy}</span>
        <h1 className="nm-title" tabIndex={-1}>
          {note.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`nm-chip nm-chip--sm nm-chip--mark nm-mk-${type.marker}`}>
            <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
            {type.label}
          </span>
          {note.tags.map((tag) => (
            <span className="nm-chip nm-chip--sm nm-chip--muted" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {note.type === "link" && note.url ? (
        <p className="mb-4">
          <a className="nm-link" href={note.url} target="_blank" rel="noopener">
            <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" /> {note.url}
          </a>
        </p>
      ) : null}

      {filePane}

      {note.body ? (
        <article className="nm-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(note.body) }} />
      ) : null}

      <footer className="mt-8 border-t border-[var(--rule)] pt-4">
        <p className="nm-meta flex items-center gap-2">
          <MoonMark size={16} />
          Shared with a Neoma public link — edits show up here live.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="nm-btn nm-btn--secondary nm-btn--sm" href="/">
            Get Neoma free
          </Link>
          <Link className="nm-btn nm-btn--ghost nm-btn--sm" href="/login">
            Sign in
          </Link>
        </div>
      </footer>
    </main>
  );
}
