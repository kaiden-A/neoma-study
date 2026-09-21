"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { NewGroupModal } from "@/components/groups/NewGroupModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TodoComposer, type AddMode } from "@/components/tasks/TodoComposer";
import { Avatar, Dial, EmptyState, MarkerChip, Progress } from "@/components/ui/bits";
import { addDays, daysUntil, fmtDay, fmtDayLong, fmtMonthYear, fmtRelative, fmtTime, isSameDay, monthGrid, startOfDay } from "@/lib/dates";
import { eventType } from "@/lib/markers";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import type { Task } from "@/lib/types";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const store = useStore();
  const router = useRouter();
  const now = useNow();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [mode, setMode] = useState<AddMode>("today");
  const [newGroup, setNewGroup] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const today = new Date(now);
  const firstName = store.user?.name.split(" ")[0] ?? "there";
  const personal = store.personalTasks();
  const openTasks = personal.filter((task) => task.status !== "done").length;
  const overdue = personal.filter(
    (task) => task.status !== "done" && task.dueAt !== null && task.dueAt < now,
  ).length;
  const dueThisWeek = store
    .dueSoonTasks(24 * 7, now)
    .filter((task) => task.groupId === null).length;

  // Digest: overdue → today → next 7 → no date, capped at 6.
  const digest = (() => {
    const open = personal.filter((task) => task.status !== "done");
    const buckets: Task[][] = [[], [], [], []];
    for (const task of open) {
      if (task.dueAt === null) buckets[3].push(task);
      else {
        const days = daysUntil(task.dueAt, now);
        if (days < 0) buckets[0].push(task);
        else if (days === 0) buckets[1].push(task);
        else if (days <= 7) buckets[2].push(task);
      }
    }
    for (const bucket of buckets) {
      bucket.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
    }
    return [...buckets[0], ...buckets[1], ...buckets[2].slice(0, 3), ...buckets[3].slice(0, 2)].slice(0, 6);
  })();

  const groupDue = store.tasks
    .filter((task) => task.groupId !== null && task.status !== "done" && task.dueAt !== null)
    .filter((task) => daysUntil(task.dueAt ?? 0, now) <= 7)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
    .slice(0, 3);

  const agenda = selectedDay
    ? store.eventsOnDay(selectedDay)
    : store
        .allEvents()
        .filter((item) => item.kind === "event")
        .filter((item) => item.start >= startOfDay(now).getTime() && item.start <= addDays(now, 7).getTime())
        .slice(0, 8);

  const cells = monthGrid(anchor);

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Home · <span className="nm-mono">{fmtDayLong(today)}</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {greeting(today.getHours())}, {firstName}
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--secondary" onClick={() => setNewGroup(true)}>
              <i className="fa-solid fa-users" aria-hidden="true" />
              New group
            </button>
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setNewTask(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              New task
            </button>
          </div>
        </div>
        <p className="nm-meta">
          <span className="nm-mono">{dueThisWeek} due this week</span> ·{" "}
          <span className="nm-mono">{openTasks} open</span>
          {overdue > 0 ? (
            <>
              {" · "}
              <span className="nm-chip nm-chip--sm nm-chip--danger">
                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                {overdue} overdue
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="nm-home-panel">
        <div className="nm-minical">
          <div className="nm-minical-head">
            <button
              type="button"
              className="nm-iconbtn nm-iconbtn--sm"
              aria-label="Previous month"
              title="Previous month"
              onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <span className="nm-minical-label">{fmtMonthYear(anchor)}</span>
            <button
              type="button"
              className="nm-iconbtn nm-iconbtn--sm"
              aria-label="Next month"
              title="Next month"
              onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </div>
          <div className="nm-minical-grid nm-minical-grid--names" aria-hidden="true">
            {WEEKDAY_INITIALS.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="nm-minical-grid">
            {cells.map((day) => {
              const items = store.eventsOnDay(day);
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  className={`nm-minical-day${day.getMonth() !== anchor.getMonth() ? " is-other" : ""}${
                    isSameDay(day, now) ? " is-today" : ""
                  }${selectedDay && isSameDay(day, selectedDay) ? " is-selected" : ""}`}
                  aria-label={`${fmtDayLong(day)} — ${items.length} item${items.length === 1 ? "" : "s"}`}
                  aria-pressed={Boolean(selectedDay && isSameDay(day, selectedDay))}
                  onClick={() =>
                    setSelectedDay((current) => (current && isSameDay(day, current) ? null : day))
                  }
                >
                  <span className="nm-minical-num nm-mono">{day.getDate()}</span>
                  <span className="nm-minical-dots">
                    {items.slice(0, 3).map((item) => (
                      <i
                        key={item.id}
                        className={`nm-minical-dot nm-mk-${item.color}${item.done ? " is-done" : ""}`}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="nm-minical-foot">
            <Link className="nm-link" href="/calendar">
              Open the calendar <i className="fa-solid fa-arrow-right" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="nm-home-agenda">
          <div className="nm-agenda-head">
            {selectedDay ? (
              <>
                <h2 className="nm-section-title">{fmtDayLong(selectedDay)}</h2>
                <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => setSelectedDay(null)}>
                  Show the week
                </button>
              </>
            ) : (
              <>
                <h2 className="nm-section-title">Coming up</h2>
                <span className="nm-mono nm-meta">next 7 days</span>
              </>
            )}
          </div>
          {agenda.length === 0 ? (
            <EmptyState
              compact
              icon="fa-calendar-day"
              title={selectedDay ? "Nothing on this day" : "Nothing in the next week"}
              body={
                selectedDay
                  ? "A clear day — add an event from the calendar if you need one."
                  : "Deadlines, exams and study blocks land here."
              }
            />
          ) : (
            <ul className="nm-uplist">
              {agenda.map((item, index) => {
                const previous = agenda[index - 1];
                const showDay = !previous || !isSameDay(previous.start, item.start);
                return (
                  <li key={item.id}>
                    {showDay ? (
                      <div className="nm-uplist-day nm-mono">
                        {isSameDay(item.start, now) ? "Today" : fmtDay(item.start)}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="nm-uprow"
                      onClick={() => {
                        if (item.kind === "event") {
                          router.push("/calendar");
                        } else {
                          const task = store.taskById(item.refId);
                          if (task) setEditing(task);
                        }
                      }}
                    >
                      <span className="nm-uprow-when nm-mono">{fmtTime(item.start)}</span>
                      <span className="nm-uprow-bd">
                        <span>{item.title}</span>
                        <small className="nm-meta">
                          {item.kind === "task" ? "Task" : eventType(item.type ?? "personal").label}
                          {item.groupName ? ` · ${item.groupName}` : ""}
                          {item.location ? ` · ${item.location}` : ""}
                        </small>
                      </span>
                      <Dial dueAt={item.start} done={item.done} showLabel={false} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <section className="nm-section">
        <div className="nm-section-head">
          <h2 className="nm-section-title">My to-do</h2>
          <Link className="nm-section-actions nm-link" href="/tasks">
            All tasks <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
        <div className="nm-card">
          <div className="nm-card-bd">
            <TodoComposer mode={mode} onModeChange={setMode} />
            {digest.length === 0 ? (
              <EmptyState
                compact
                icon="fa-list-check"
                title="Your list is clear"
                body="Add today’s three things above."
              />
            ) : (
              <ul className="nm-tasklist nm-tasklist--compact">
                {digest.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    hideGroup
                    timeOnly={task.dueAt !== null && daysUntil(task.dueAt, now) <= 0}
                    showDial={task.dueAt !== null}
                    onOpen={setEditing}
                  />
                ))}
              </ul>
            )}
            {groupDue.length ? (
              <div className="nm-todo-groupdue">
                <p className="nm-side-note nm-mono">From your groups</p>
                <ul className="nm-tasklist nm-tasklist--compact">
                  {groupDue.map((task) => (
                    <TaskRow key={task.id} task={task} onOpen={setEditing} />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="nm-section">
        <div className="nm-section-head">
          <h2 className="nm-section-title">Your groups</h2>
          <Link className="nm-section-actions nm-link" href="/groups">
            All groups <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Link>
        </div>
        {store.groups.length === 0 ? (
          <EmptyState
            icon="fa-users"
            title="No groups yet"
            body="Group projects live here: shared tasks, shared notes, one deadline list."
            action={
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => setNewGroup(true)}>
                Create a group
              </button>
            }
          />
        ) : (
          <div className="nm-pulse-grid">
            {store.groups.map((group) => {
              const stats = store.groupStats(group.id);
              const study = store.studyStats(group.id);
              return (
                <Link key={group.id} href={`/groups/${group.id}`} className={`nm-pulse nm-mk-${group.color}`}>
                  <div className="nm-pulse-top">
                    <span className="nm-chip nm-chip--sm nm-chip--muted">
                      <i
                        className={`fa-solid ${group.kind === "study" ? "fa-note-sticky" : "fa-list-check"}`}
                        aria-hidden="true"
                      />
                      {group.kind === "study" ? "Study" : "Project"}
                    </span>
                    {group.subject ? <MarkerChip name={group.subject} markerKey={group.color} small /> : null}
                    {group.kind === "study" && study.openRequests > 0 ? (
                      <span className="nm-chip nm-chip--sm nm-chip--warn">
                        <i className="fa-solid fa-circle-question" aria-hidden="true" />
                        {study.openRequests} waiting
                      </span>
                    ) : null}
                    {group.kind === "project" && stats.overdue > 0 ? (
                      <span className="nm-chip nm-chip--sm nm-chip--danger">
                        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                        {stats.overdue} overdue
                      </span>
                    ) : null}
                  </div>
                  <h3 className="nm-pulse-title">{group.name}</h3>
                  <p className="nm-pulse-next">
                    {group.kind === "study" ? (
                      <>
                        {study.notes} shared note{study.notes === 1 ? "" : "s"}
                        {study.nextSession ? ` · session ${fmtRelative(study.nextSession.startsAt, now)}` : ""}
                      </>
                    ) : stats.next ? (
                      <>
                        Next: {stats.next.title.slice(0, 40)}{" "}
                        <span className="nm-mono">{fmtRelative(stats.next.dueAt ?? now, now)}</span>
                      </>
                    ) : (
                      "No open tasks"
                    )}
                  </p>
                  <div className="nm-pulse-ft">
                    {group.kind === "study" ? (
                      <span className="nm-inline-actions">
                        {group.topics.slice(0, 3).map((topic) => (
                          <MarkerChip key={topic.id} name={topic.name} markerKey={topic.color} small />
                        ))}
                        {group.topics.length === 0 ? (
                          <span className="nm-mono nm-meta">no subjects yet</span>
                        ) : null}
                      </span>
                    ) : (
                      <>
                        <Progress pct={stats.pct} markerKey={group.color} label={`${group.name} progress`} />
                        <span className="nm-mono nm-pulse-pct">{stats.pct}%</span>
                      </>
                    )}
                    <span className="nm-avatars">
                      {group.members.slice(0, 4).map((member) => (
                        <Avatar
                          key={member.id}
                          name={member.name}
                          email={member.email}
                          color={member.color}
                          size={26}
                        />
                      ))}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {newGroup ? <NewGroupModal onClose={() => setNewGroup(false)} /> : null}
      {newTask ? <TaskModal onClose={() => setNewTask(false)} /> : null}
      {editing ? <TaskModal task={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
