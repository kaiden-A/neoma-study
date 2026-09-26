"use client";

import { useEffect, useState } from "react";

import { noteType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** The file tile used by cards, rows and the group feed.
 *
 * Previews only exist for images (the browser compresses and uploads a JPEG
 * thumb at upload time). Pointing an <img> at a slide deck or PDF just shows
 * the alt text, so anything that is not an image gets the note type's icon on
 * a marker-tinted tile instead. */
export function NoteThumb({
  note,
  alt,
  className = "nm-notecard-thumb",
}: {
  note: Note;
  alt: string;
  className?: string;
}) {
  const { fileUrl } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const type = noteType(note.type);
  const isImage = Boolean(note.fileId && note.fileType?.startsWith("image/"));

  useEffect(() => {
    let active = true;
    if (!isImage || !note.fileId) return;
    fileUrl(note.fileId, true)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [fileUrl, isImage, note.fileId]);

  if (!isImage || failed) {
    return (
      <span className={`${className} nm-filetile nm-mk-${type.marker}`}>
        <i className={`fa-solid ${type.icon} nm-filetile-icon`} aria-hidden="true" />
      </span>
    );
  }

  if (!url) {
    return (
      <span className={`${className} nm-filetile nm-filetile--loading nm-mk-${type.marker}`}>
        <i className={`fa-solid ${type.icon} nm-filetile-icon`} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={`${className} nm-filetile nm-filetile--image`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}
