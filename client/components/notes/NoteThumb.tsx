"use client";

import { useEffect, useState } from "react";

import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** Resolves a short-lived presigned URL per render, like the prototype's
 * per-route object URLs. */
export function NoteThumb({ note, alt }: { note: Note; alt: string }) {
  const { fileUrl } = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!note.fileId) return;
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
  }, [fileUrl, note.fileId]);

  if (!note.fileId || failed) {
    return (
      <div className="nm-notecard-thumb">
        <i className="fa-solid fa-file nm-thumb-ph" aria-hidden="true" />
      </div>
    );
  }
  if (!url) {
    return (
      <div className="nm-notecard-thumb">
        <i className="fa-solid fa-circle-notch fa-spin nm-thumb-ph" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="nm-notecard-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" />
    </div>
  );
}
