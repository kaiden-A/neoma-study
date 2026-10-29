"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AnnouncementsList } from "@/components/courses/Announcements";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";

export function AnnouncementsPage() {
  const store = useStore();
  const { toast } = useOverlays();
  const loaded = useRef(false);
  const [course, setCourse] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loaded.current || !store.ready) return;
    loaded.current = true;
    void store
      .loadAnnouncements()
      .catch((caught) => {
        toast(caught instanceof Error ? caught.message : "Could not load announcements.", {
          kind: "danger",
        });
      })
      .finally(() => setLoading(false));
  }, [store, toast]);

  const meta = store.announcementMeta.all;
  const unread = meta?.unread ?? store.announcements.filter((item) => !item.read).length;
  const items = store.announcements.filter(
    (item) =>
      (!course || item.courseId === course) &&
      (!unreadOnly || !item.read),
  );
  const visibleUnread = items.filter((item) => !item.read).length;

  function markRead(id: string) {
    void store
      .markAnnouncementsRead({ ids: [id] })
      .catch(() => undefined);
  }

  function markAll() {
    void store
      .markAnnouncementsRead(course ? { courseId: course } : { all: true })
      .catch(() => undefined);
  }

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <Link className="nm-eyebrow nm-eyebrow--link" href="/courses">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Courses
          </Link>
          <span className="nm-eyebrow nm-mono">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Announcements
          </h1>
        </div>
        <p className="nm-meta">
          Announcements and forum posts from every iTa&apos;leem course, newest first.
          Open a course tab to refresh that course now; the mirror also syncs every two hours.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className="nm-select nm-select--sm"
          aria-label="Filter by course"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
        >
          <option value="">All courses</option>
          {store.courses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.shortname}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`nm-chip nm-chip--sm nm-chip--link${unreadOnly ? " is-active" : ""}`}
          aria-pressed={unreadOnly}
          onClick={() => setUnreadOnly((value) => !value)}
        >
          Unread only
        </button>
        {unread > 0 ? (
          <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={markAll}>
            <i className="fa-solid fa-check-double" aria-hidden="true" />
            Mark all read
          </button>
        ) : null}
      </div>

      <AnnouncementsList
        items={items}
        unread={visibleUnread}
        syncedAt={meta?.syncedAt ?? null}
        warning={meta?.warning ?? null}
        loading={loading}
        showCourse
        onMarkRead={markRead}
        onMarkAll={markAll}
      />
    </div>
  );
}
