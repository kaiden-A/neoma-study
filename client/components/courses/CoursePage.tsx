"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AnnouncementsList } from "@/components/courses/Announcements";
import { EmptyState } from "@/components/ui/bits";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtBytes, fmtDay, fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { CourseDetail, CourseModule, CourseSection } from "@/lib/types";

type Tab = "outline" | "assignments" | "announcements" | "grades";

const TABS: { id: Tab; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "assignments", label: "Assignments" },
  { id: "announcements", label: "Announcements" },
  { id: "grades", label: "Grades" },
];

const ICONS: Record<string, string> = {
  assign: "fa-file-pen",
  quiz: "fa-circle-question",
  resource: "fa-file-lines",
  folder: "fa-folder-open",
  url: "fa-arrow-up-right-from-square",
  forum: "fa-comments",
  page: "fa-file",
  label: "fa-paragraph",
  book: "fa-book",
  choice: "fa-square-poll-vertical",
};

const SUBMISSION_LABEL: Record<string, string> = {
  submitted: "Submitted",
  draft: "Draft saved",
  notsubmitted: "Not submitted",
  graded: "Graded",
};

const SUBMISSION_CLASS: Record<string, string> = {
  submitted: "nm-chip--ok",
  draft: "nm-chip--warn",
  notsubmitted: "nm-chip--danger",
};

function moduleIcon(module: CourseModule): string {
  return ICONS[module.modname] ?? "fa-cube";
}

export function CoursePage({
  courseId,
  initialTab = "outline",
  focusDiscussion = null,
}: {
  courseId: string;
  initialTab?: Tab;
  focusDiscussion?: number | null;
}) {
  const store = useStore();
  const { toast } = useOverlays();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [busy, setBusy] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loaded = useRef(false);
  const gradesLoaded = useRef(false);
  const assignmentsLoaded = useRef(false);
  const announcementsLoaded = useRef(false);
  const focusHandled = useRef(false);
  const detail = store.courseDetail(courseId);
  const announcements = store.announcementsForCourse(courseId);
  const announcementMeta = store.announcementMeta[courseId];
  const unreadAnnouncements =
    announcementMeta?.unread ?? detail?.course.unreadAnnouncements ?? 0;

  useEffect(() => {
    if (loaded.current || !store.ready) return;
    loaded.current = true;
    void store.loadCourse(courseId).catch((caught) => {
      const message = caught instanceof Error ? caught.message : "Could not load that course.";
      setLoadError(message);
      toast(message, { kind: "danger" });
    });
  }, [courseId, store, toast]);

  async function retryLoad() {
    setLoadError(null);
    try {
      await store.loadCourse(courseId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load that course.";
      setLoadError(message);
      toast(message, { kind: "danger" });
    }
  }

  useEffect(() => {
    if (tab !== "grades" || !detail || gradesLoaded.current) return;
    gradesLoaded.current = true;
    void store.loadGrades(courseId).catch((caught) => {
      toast(caught instanceof Error ? caught.message : "Could not load grades.", {
        kind: "danger",
      });
    });
  }, [tab, detail, courseId, store, toast]);

  useEffect(() => {
    if (tab !== "assignments" || !detail || assignmentsLoaded.current) return;
    assignmentsLoaded.current = true;
    void store.loadAssignments(courseId).catch((caught) => {
      toast(caught instanceof Error ? caught.message : "Could not load submission status.", {
        kind: "danger",
      });
    });
  }, [tab, detail, courseId, store, toast]);

  useEffect(() => {
    if (tab !== "announcements" || !detail || announcementsLoaded.current) return;
    announcementsLoaded.current = true;
    void store.loadAnnouncements(courseId).catch((caught) => {
      toast(caught instanceof Error ? caught.message : "Could not load announcements.", {
        kind: "danger",
      });
    });
  }, [tab, detail, courseId, store, toast]);

  useEffect(() => {
    if (!focusDiscussion || focusHandled.current) return;
    const target = announcements.find((item) => item.discussionId === focusDiscussion);
    if (!target) return;
    focusHandled.current = true;
    document
      .getElementById(`announcement-${focusDiscussion}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (!target.read) {
      void store
        .markAnnouncementsRead({ ids: [target.id] })
        .catch(() => undefined);
    }
  }, [announcements, focusDiscussion, store]);

  async function save(module: CourseModule, index: number) {
    setBusy(module.cmid);
    try {
      const note = await store.saveCourseFile(courseId, module.cmid, index);
      toast(`Saved “${note.title}” to your vault`, { kind: "success" });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save that file.", { kind: "danger" });
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      await store.syncMoodle();
      await store.loadCourse(courseId, true);
      gradesLoaded.current = false;
      assignmentsLoaded.current = false;
      announcementsLoaded.current = tab === "announcements";
      if (tab === "announcements") {
        await store.loadAnnouncements(courseId, true);
      }
      toast("Course refreshed", { kind: "success" });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not refresh the course.", {
        kind: "danger",
      });
    } finally {
      setSyncing(false);
    }
  }

  if (!detail) {
    return (
      <div className="nm-page">
        <Link className="nm-btn nm-btn--ghost nm-btn--sm" href="/courses">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Courses
        </Link>
        <div className="nm-card mt-4">
          <div className="nm-card-bd">
            {loadError ? (
              <>
                <p className="nm-help" style={{ color: "var(--danger)" }}>
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {loadError}
                </p>
                <button type="button" className="nm-btn nm-btn--secondary nm-btn--sm" onClick={() => void retryLoad()}>
                  <i className="fa-solid fa-rotate" aria-hidden="true" />
                  Retry
                </button>
              </>
            ) : (
              <p className="nm-meta">Loading course…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const course = detail.course;
  const courseUrl = `https://italeemc.iium.edu.my/course/view.php?id=${course.moodleId}`;

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <Link className="nm-eyebrow nm-eyebrow--link" href="/courses">
            <i className="fa-solid fa-arrow-left" aria-hidden="true" /> Courses
          </Link>
          <span className="nm-eyebrow nm-mono">{course.shortname}</span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {course.fullname}
          </h1>
          <div className="nm-head-actions">
            <button
              type="button"
              className="nm-btn nm-btn--secondary nm-btn--sm"
              onClick={() => void sync()}
              disabled={syncing}
            >
              <i className="fa-solid fa-rotate" aria-hidden="true" />
              {syncing ? "Syncing…" : "Refresh"}
            </button>
            <a className="nm-btn nm-btn--ghost nm-btn--sm" href={courseUrl} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              Open in iTa&apos;leem
            </a>
          </div>
        </div>
        <p className="nm-meta">
          {course.openDeadlines > 0
            ? `${course.openDeadlines} open deadline${course.openDeadlines === 1 ? "" : "s"}${
                course.nextDueAt ? ` · next ${fmtRelative(course.nextDueAt)}` : ""
              }`
            : "No open deadlines"}
          {detail.outlineAt ? ` · outline synced ${fmtRelative(detail.outlineAt)}` : ""}
          {detail.truncated ? " · outline truncated" : ""}
        </p>
      </div>

      {detail.outlineError ? (
        <div className="nm-card">
          <div className="nm-card-bd">
            <p className="nm-help" style={{ color: "var(--danger)" }}>
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {detail.outlineError}
            </p>
          </div>
        </div>
      ) : null}

      <div className="nm-seg nm-seg--wide nm-course-tabs" role="tablist" aria-label="Course view">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`nm-seg-btn${tab === item.id ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.id === "announcements" && unreadAnnouncements > 0
              ? `Announcements (${unreadAnnouncements})`
              : item.label}
          </button>
        ))}
      </div>

      {tab === "outline" ? (
        <Outline sections={detail.sections} busy={busy} onSave={save} />
      ) : tab === "assignments" ? (
        <Assignments detail={detail} />
      ) : tab === "announcements" ? (
        <AnnouncementsList
          items={announcements}
          unread={unreadAnnouncements}
          syncedAt={announcementMeta?.syncedAt ?? null}
          warning={announcementMeta?.warning ?? null}
          loading={!announcementMeta && announcements.length === 0}
          focusDiscussion={focusDiscussion}
          onMarkRead={(id) => {
            void store
              .markAnnouncementsRead({ ids: [id] })
              .catch(() => undefined);
          }}
          onMarkAll={() => {
            void store
              .markAnnouncementsRead({ courseId })
              .catch(() => undefined);
          }}
        />
      ) : (
        <Grades detail={detail} />
      )}
    </div>
  );
}

function Outline({
  sections,
  busy,
  onSave,
}: {
  sections: CourseSection[];
  busy: number | null;
  onSave: (module: CourseModule, index: number) => void;
}) {
  if (sections.length === 0) {
    return (
      <EmptyState
        icon="fa-folder-open"
        title="Nothing visible yet"
        body="iTa'leem returned no visible sections for this course. Lecturers may not have published anything."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <section className="nm-card" key={section.id}>
          <div className="nm-card-hd">
            <h2 className="nm-card-title">{section.name || "Section"}</h2>
          </div>
          <div className="nm-card-bd">
            {section.summary ? <p className="nm-meta mb-2">{section.summary}</p> : null}
            <div>
              {section.modules.map((module) => (
                <div
                  key={module.cmid}
                  className="flex items-start gap-3 border-b border-[var(--rule)] py-3 last:border-0"
                >
                  <span className="nm-chip nm-chip--sm nm-chip--muted">
                    <i className={`fa-solid ${moduleIcon(module)}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="nm-task-text">{module.name || "Untitled activity"}</span>
                      <span className="nm-chip nm-chip--sm nm-chip--muted nm-mono">{module.modname}</span>
                      {module.url ? (
                        <a
                          className="nm-chip nm-chip--sm nm-chip--link"
                          href={module.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                    {module.description ? (
                      <p className="nm-meta mt-1 whitespace-pre-line">{module.description}</p>
                    ) : null}
                    {module.link ? (
                      <a className="nm-meta mt-1 block underline" href={module.link} target="_blank" rel="noreferrer">
                        {module.link}
                      </a>
                    ) : null}
                    {module.files.map((file, index) => (
                      <div key={`${module.cmid}-${file.filename}`} className="mt-2 flex flex-wrap items-center gap-2">
                        <i className="fa-solid fa-paperclip nm-meta" aria-hidden="true" />
                        <span className="nm-meta">
                          {file.filename} · {fmtBytes(file.size)}
                        </span>
                        {file.noteId ? (
                          <Link className="nm-chip nm-chip--sm nm-chip--ok" href={`/vault/${file.noteId}`}>
                            <i className="fa-solid fa-check" aria-hidden="true" />
                            In vault
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="nm-chip nm-chip--sm nm-chip--link"
                            onClick={() => onSave(module, index)}
                            disabled={busy === module.cmid}
                          >
                            <i className="fa-solid fa-download" aria-hidden="true" />
                            {busy === module.cmid ? "Saving…" : "Save to vault"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function Assignments({ detail }: { detail: CourseDetail }) {
  if (detail.assignments.length === 0) {
    return (
      <EmptyState
        icon="fa-file-pen"
        title="No assignments"
        body="Nothing with a due date is visible in iTa'leem for this course."
      />
    );
  }
  return (
    <div className="nm-card">
      <div className="nm-card-bd">
        {detail.assignments.map((assignment) => (
          <div
            key={assignment.assignId}
            className="flex flex-wrap items-center gap-3 border-b border-[var(--rule)] py-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="nm-task-text">{assignment.name}</span>
                {assignment.submissionStatus ? (
                  <span
                    className={`nm-chip nm-chip--sm ${
                      SUBMISSION_CLASS[assignment.submissionStatus] ?? "nm-chip--info"
                    }`}
                  >
                    {SUBMISSION_LABEL[assignment.submissionStatus] ?? assignment.submissionStatus}
                  </span>
                ) : null}
                {assignment.grade ? (
                  <span className="nm-chip nm-chip--sm nm-chip--ok">
                    {assignment.grade}
                    {assignment.gradeMax && !assignment.grade.includes("/")
                      ? ` / ${assignment.gradeMax}`
                      : ""}
                  </span>
                ) : null}
              </div>
              <p className="nm-meta">
                {assignment.dueAt
                  ? `Due ${fmtDay(assignment.dueAt)} · ${fmtRelative(assignment.dueAt)}`
                  : "No due date"}
                {assignment.cutoffAt ? ` · cutoff ${fmtDay(assignment.cutoffAt)}` : ""}
              </p>
            </div>
            {assignment.taskId ? (
              <Link className="nm-chip nm-chip--sm nm-chip--link" href="/tasks">
                In to-do
              </Link>
            ) : null}
            <a className="nm-chip nm-chip--sm nm-chip--link" href={assignment.url} target="_blank" rel="noreferrer">
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

function Grades({ detail }: { detail: CourseDetail }) {
  if (detail.grades.length === 0) {
    return (
      <EmptyState
        icon="fa-chart-simple"
        title="No grades yet"
        body="Grades appear after iTa'leem publishes them. Refresh to pull the latest."
      />
    );
  }
  return (
    <div className="nm-card">
      <div className="nm-card-bd">
        {detail.grades.map((grade, index) => (
          <div
            key={`${grade.name}-${index}`}
            className="flex flex-wrap items-center gap-3 border-b border-[var(--rule)] py-2 last:border-0"
          >
            <span className="nm-task-text flex-1">{grade.name || "Item"}</span>
            <span className="nm-mono">{grade.grade || "—"}</span>
            {grade.max ? <span className="nm-meta">/ {grade.max}</span> : null}
            {grade.percentage ? <span className="nm-chip nm-chip--sm nm-chip--muted">{grade.percentage}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
