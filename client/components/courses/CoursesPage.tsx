"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { EmptyState, Progress } from "@/components/ui/bits";
import { fmtDay, fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";

export function CoursesPage() {
  const store = useStore();
  const connected = store.settings?.moodle.status === "connected";
  const announcementsLoaded = useRef(false);
  const latest = store.announcements.slice(0, 3);

  useEffect(() => {
    if (!connected || announcementsLoaded.current) return;
    announcementsLoaded.current = true;
    void store.loadAnnouncements().catch(() => undefined);
  }, [connected, store]);

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            iTa&apos;leem <span className="nm-mono">{store.courses.length} courses</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Courses
          </h1>
          <div className="nm-head-actions">
            <Link className="nm-btn nm-btn--ghost nm-btn--sm" href="/courses/announcements">
              <i className="fa-solid fa-bullhorn" aria-hidden="true" />
              Announcements
            </Link>
            <Link className="nm-btn nm-btn--ghost nm-btn--sm" href="/settings">
              <i className="fa-solid fa-sliders" aria-hidden="true" />
              iTa&apos;leem settings
            </Link>
          </div>
        </div>
        <p className="nm-meta">
          Deadlines, materials and grades mirrored from iTa&apos;leem. Saving a file copies it into the
          matching vault folder, so it previews, searches and takes highlights like any other note.
        </p>
      </div>

      {latest.length > 0 ? (
        <section className="nm-card mb-5">
          <div className="nm-card-hd flex items-center justify-between gap-3">
            <h2 className="nm-card-title">Latest announcements</h2>
            <Link className="nm-btn nm-btn--ghost nm-btn--sm" href="/courses/announcements">
              View all
            </Link>
          </div>
          <div className="nm-card-bd">
            {latest.map((item) => (
              <Link
                key={item.id}
                className="nm-announcement-strip"
                href={`/courses/${item.courseId}?tab=announcements&discussion=${item.discussionId}`}
              >
                <span className="nm-announcement-strip-title">
                  {item.read ? null : <span className="nm-announcement-dot" aria-hidden="true" />}
                  {item.subject}
                </span>
                <span className="nm-meta nm-mono">
                  {item.courseShortname}
                  {item.postedAt || item.modifiedAt
                    ? ` · ${fmtRelative(item.postedAt ?? item.modifiedAt ?? 0)}`
                    : ""}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!connected ? (
        <EmptyState
          icon="fa-graduation-cap"
          title="Connect iTa'leem"
          body="Paste your iTa'leem connect link once and Neoma will mirror your courses, deadlines and materials."
          action={
            <Link className="nm-btn nm-btn--primary" href="/settings">
              Open settings
            </Link>
          }
        />
      ) : store.courses.length === 0 ? (
        <EmptyState
          icon="fa-book-open"
          title="No courses yet"
          body="iTa'leem is connected but returned no visible courses. Sync again from Settings if your enrolment just changed."
          action={
            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={() => void store.syncMoodle()}
            >
              <i className="fa-solid fa-rotate" aria-hidden="true" />
              Sync now
            </button>
          }
        />
      ) : (
        <div className="nm-groupgrid">
          {store.courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className={`nm-groupcard nm-mk-${course.color}`}
            >
              <span className="nm-groupcard-bar" aria-hidden="true" />
              <div className="nm-groupcard-bd">
                <div className="nm-groupcard-top">
                  <span className="nm-chip nm-chip--sm nm-chip--muted nm-mono">{course.shortname}</span>
                  {course.openDeadlines > 0 ? (
                    <span className="nm-chip nm-chip--sm nm-chip--warn">
                      <i className="fa-solid fa-hourglass-half" aria-hidden="true" />
                      {course.openDeadlines} deadline{course.openDeadlines === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {course.unreadAnnouncements > 0 ? (
                    <span className="nm-chip nm-chip--sm nm-chip--warn">
                      <i className="fa-solid fa-bullhorn" aria-hidden="true" />
                      {course.unreadAnnouncements} new
                    </span>
                  ) : null}
                </div>
                <h2 className="nm-groupcard-title">{course.fullname}</h2>
                <p className="nm-meta">
                  {course.nextDueAt
                    ? `Next: ${fmtDay(course.nextDueAt)} · ${fmtRelative(course.nextDueAt)}`
                    : "No open deadlines"}
                </p>
                {course.progress !== null ? (
                  <Progress pct={course.progress} markerKey={course.color} label={`${course.progress}%`} />
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
