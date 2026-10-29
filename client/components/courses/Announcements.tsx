"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/ui/bits";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import type { Announcement } from "@/lib/types";

interface AnnouncementsListProps {
  items: Announcement[];
  unread: number;
  syncedAt: number | null;
  warning: string | null;
  loading?: boolean;
  showCourse?: boolean;
  focusDiscussion?: number | null;
  onMarkRead?: (id: string) => void;
  onMarkAll?: () => void;
}

function excerpt(body: string): string {
  const text = body.trim();
  return text.length > 320 ? `${text.slice(0, 319)}…` : text;
}

export function AnnouncementsList({
  items,
  unread,
  syncedAt,
  warning,
  loading = false,
  showCourse = false,
  focusDiscussion = null,
  onMarkRead,
  onMarkAll,
}: AnnouncementsListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading && items.length === 0) {
    return <p className="nm-meta">Loading announcements…</p>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="fa-bullhorn"
        title="No announcements yet"
        body="When a lecturer posts to an iTa'leem forum, it will appear here. The mirror refreshes every two hours."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="nm-meta">
          {syncedAt ? `Updated ${fmtRelative(syncedAt)}` : "Waiting for the first sync"}
          {unread > 0 ? ` · ${unread} unread` : ""}
        </p>
        {unread > 0 && onMarkAll ? (
          <button
            type="button"
            className="nm-btn nm-btn--ghost nm-btn--sm"
            onClick={onMarkAll}
          >
            <i className="fa-solid fa-check-double" aria-hidden="true" />
            Mark all read
          </button>
        ) : null}
      </div>

      {warning ? (
        <p className="nm-help" style={{ color: "var(--danger)" }}>
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {warning}
        </p>
      ) : null}

      {items.map((item) => {
        const open = openId === item.id;
        const focused = focusDiscussion === item.discussionId;
        return (
          <article
            key={item.id}
            id={`announcement-${item.discussionId}`}
            className={`nm-card nm-announcement${item.read ? "" : " is-unread"}${
              focused ? " is-focused" : ""
            }`}
          >
            <div className="nm-card-bd">
              <div className="flex items-start gap-2">
                {item.read ? null : (
                  <span className="nm-announcement-dot" aria-label="Unread" />
                )}
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => {
                    setOpenId(open ? null : item.id);
                    if (!item.read) onMarkRead?.(item.id);
                  }}
                >
                  <h2 className="nm-card-title">{item.subject}</h2>
                </button>
              </div>

              <p className="nm-meta mt-1">
                {item.forumName || "iTa'leem forum"}
                {item.author ? ` · ${item.author}` : ""}
                {item.postedAt ? ` · ${fmtDateTime(item.postedAt)}` : ""}
              </p>

              <p className="nm-announcement-body">
                {open ? item.body : excerpt(item.body)}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {showCourse ? (
                  <Link
                    className="nm-chip nm-chip--sm nm-chip--link"
                    href={`/courses/${item.courseId}`}
                  >
                    {item.courseShortname}
                  </Link>
                ) : null}
                {item.replies > 0 ? (
                  <span className="nm-chip nm-chip--sm nm-chip--muted">
                    <i className="fa-solid fa-comments" aria-hidden="true" />
                    {item.replies} repl{item.replies === 1 ? "y" : "ies"}
                  </span>
                ) : null}
                {item.body.length > 320 ? (
                  <button
                    type="button"
                    className="nm-chip nm-chip--sm nm-chip--link"
                    onClick={() => setOpenId(open ? null : item.id)}
                  >
                    {open ? "Show less" : "Read more"}
                  </button>
                ) : null}
                <a
                  className="nm-chip nm-chip--sm nm-chip--link"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                  Open in iTa&apos;leem
                </a>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
