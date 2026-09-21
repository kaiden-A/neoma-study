import Link from "next/link";

import { MoonMark } from "@/components/MoonMark";

const FEATURES = [
  {
    marker: "mint",
    icon: "fa-users",
    title: "Group projects",
    body: "A task board with due dates, assignees, priorities, checklists and workload per member.",
  },
  {
    marker: "sky",
    icon: "fa-book-open-reader",
    title: "Study groups",
    body: "Topic-chipped shared notes, note requests that pin until answered, and sessions on the calendar.",
  },
  {
    marker: "violet",
    icon: "fa-note-sticky",
    title: "Your notes",
    body: "Typed notes, handwritten pages, slides, past papers and links — searchable, taggable, shareable.",
  },
  {
    marker: "amber",
    icon: "fa-calendar-days",
    title: "One calendar",
    body: "Deadlines, exams, sessions and personal events in one month view, with .ics export.",
  },
];

export default function Home() {
  return (
    <main className="nm-view nm-view--grid min-h-screen">
      <div className="nm-page max-w-[1000px]">
        <div className="flex flex-col items-start gap-3">
          <span className="nm-brand-mark" style={{ color: "var(--mark-amber)" }}>
            <MoonMark size={38} />
          </span>
          <span className="nm-eyebrow">Neoma · Study OS</span>
          <h1 className="nm-title max-w-[24ch]">
            Group projects, your own notes, and one calendar that knows about both.
          </h1>
          <p className="nm-body-text max-w-[62ch]">
            A project group runs a task board, a study group trades notes and books sessions, and a personal
            to-do list sits alongside them for everything that isn&rsquo;t group work. Home opens on the month
            with what&rsquo;s coming up.
          </p>
        </div>

        <div className="nm-inline-actions mt-6">
          <a className="nm-btn nm-btn--primary" href="/api/auth/login?next=%2Ftoday">
            <i className="fa-solid fa-graduation-cap" aria-hidden="true" />
            Continue with Elysiaa SSO
          </a>
          <Link className="nm-btn nm-btn--secondary" href="/signup">
            Create an account
          </Link>
        </div>
        <p className="nm-help">Sign-in runs through Elysiaa — no passwords live in Neoma.</p>

        <div className="nm-pulse-grid mt-8">
          {FEATURES.map((feature) => (
            <div className={`nm-pulse nm-mk-${feature.marker}`} key={feature.title}>
              <div className="nm-pulse-top">
                <span className="nm-chip nm-chip--sm nm-chip--mark">
                  <i className={`fa-solid ${feature.icon}`} aria-hidden="true" />
                  {feature.title}
                </span>
              </div>
              <h2 className="nm-pulse-title">{feature.title}</h2>
              <p className="nm-pulse-next">{feature.body}</p>
            </div>
          ))}
        </div>

        <p className="nm-meta mt-8">
          Trusted by one student and whatever group chat they were voluntold into.
        </p>
      </div>
    </main>
  );
}
