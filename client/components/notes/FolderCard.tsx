"use client";

import Link from "next/link";

import { FolderGlyph } from "@/components/notes/FolderGlyph";

/** A Drive-style folder tile on the notes home. The whole card navigates;
 * the ellipsis is the existing rename/delete menu, kept out of the link. */
export function FolderCard({
  href,
  name,
  meta,
  color,
  variant = "folder",
  onMenu,
}: {
  href: string;
  name: string;
  meta: string;
  color?: string | null;
  variant?: "folder" | "inbox";
  onMenu?: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div className={`nm-foldercard${color ? ` nm-mk-${color}` : ""}`}>
      <Link className="nm-foldercard-link" href={href}>
        <span className="nm-foldercard-glyph">
          <FolderGlyph variant={variant} />
        </span>
        <span className="nm-foldercard-name">{name}</span>
        <span className="nm-foldercard-meta">{meta}</span>
      </Link>
      {onMenu ? (
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm nm-foldercard-menu"
          aria-label={`${name} options`}
          title="Folder options"
          onClick={onMenu}
        >
          <i className="fa-solid fa-ellipsis" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
