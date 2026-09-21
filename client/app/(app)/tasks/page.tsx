"use client";

import { useState } from "react";

import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TodoComposer, type AddMode } from "@/components/tasks/TodoComposer";
import { EmptyState } from "@/components/ui/bits";
import { daysUntil, isSameDay } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import type { Task } from "@/lib/types";

type BucketId = "overdue" | "today" | "tomorrow" | "soon" | "later" | "nodate" | "done";

const BUCKET_LABELS: { id: BucketId; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "soon", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "nodate", label: "No date" },
  { id: "done", label: "Done" },
];

export default function TodoPage() {
  const store = useStore();
  const now = useNow();
  const [mode, setMode] = useState<AddMode>("today");
  const [includeGroup, setIncludeGroup] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);

  const personal = store.personalTasks();
  const source = includeGroup ? store.tasks : personal;
  const openCount = personal.filter((task) => task.status !== "done").length;
  const doneToday = personal.filter(
    (task) => task.status === "done" && task.completedAt !== null && isSameDay(task.completedAt, now),
  ).length;
  const hiddenGroupTasks = store.tasks.filter((task) => task.groupId !== null && task.status !== "done").length;

  const buckets: Record<BucketId, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    soon: [],
    later: [],
    nodate: [],
    done: [],
  };
  for (const task of source) {
    if (task.status === "done") {
      buckets.done.push(task);
      continue;
    }
    if (task.dueAt === null) {
      buckets.nodate.push(task);
      continue;
    }
    const days = daysUntil(task.dueAt, now);
    if (days < 0) buckets.overdue.push(task);
    else if (days === 0) buckets.today.push(task);
    else if (days === 1) buckets.tomorrow.push(task);
    else if (days <= 7) buckets.soon.push(task);
    else buckets.later.push(task);
  }
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER));
  }
  const doneShown = showAllDone
    ? buckets.done
    : buckets.done.filter((task) => task.completedAt !== null && isSameDay(task.completedAt, now));
  const total =
    buckets.overdue.length +
    buckets.today.length +
    buckets.tomorrow.length +
    buckets.soon.length +
    buckets.later.length +
    buckets.nodate.length +
    buckets.done.length;

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            My to-do · <span className="nm-mono">{openCount} open</span>
            {doneToday > 0 ? (
              <>
                {" · "}
                <span className="nm-mono">{doneToday} done today</span>
              </>
            ) : null}
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            My to-do
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setCreating(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              New task
            </button>
          </div>
        </div>
        <p className="nm-meta">Personal tasks only — group work stays on its group board.</p>
      </div>

      <div className="nm-card">
        <div className="nm-card-bd">
          <TodoComposer mode={mode} onModeChange={setMode} />
        </div>
      </div>

      <div className="nm-todo-toggle">
        <label className="nm-check nm-check--switch">
          <input
            type="checkbox"
            checked={includeGroup}
            onChange={(event) => setIncludeGroup(event.target.checked)}
          />
          <span>Include group work</span>
        </label>
        <span className="nm-mono nm-meta">
          {includeGroup
            ? `showing ${hiddenGroupTasks} open group task${hiddenGroupTasks === 1 ? "" : "s"}`
            : `${hiddenGroupTasks} open group task${hiddenGroupTasks === 1 ? "" : "s"} hidden`}
        </span>
      </div>

      {total === 0 ? (
        <EmptyState
          icon="fa-list-check"
          title="Your list is empty"
          body="Add today’s three things above — or flip on “Include group work” to see everything you owe this week."
          action={
            <button
              type="button"
              className="nm-btn nm-btn--secondary"
              onClick={() => document.querySelector<HTMLInputElement>(".nm-todo-input")?.focus()}
            >
              Add a to-do
            </button>
          }
        />
      ) : (
        BUCKET_LABELS.map((bucket) => {
          const items = bucket.id === "done" ? doneShown : buckets[bucket.id];
          const isDone = bucket.id === "done";
          if (!isDone && items.length === 0) return null;
          if (isDone && buckets.done.length === 0 && doneShown.length === 0) return null;
          return (
            <section
              className={`nm-todo-section${bucket.id === "overdue" ? " nm-todo-section--danger" : ""}${
                isDone ? " nm-todo-section--done" : ""
              }`}
              key={bucket.id}
            >
              <div className="nm-todo-heading">
                <span>{bucket.label}</span>
                <span className="nm-mono">{items.length}</span>
                {isDone ? (
                  <button
                    type="button"
                    className="nm-btn nm-btn--ghost nm-btn--sm nm-todo-donetoggle"
                    onClick={() => setShowAllDone((current) => !current)}
                  >
                    {showAllDone ? "Show today only" : `Show all ${buckets.done.length}`}
                  </button>
                ) : null}
              </div>
              {isDone && items.length === 0 ? <p className="nm-help">Nothing finished today yet.</p> : null}
              <ul className="nm-tasklist">
                {items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    menu
                    hideGroup={!includeGroup}
                    timeOnly={bucket.id === "overdue" || bucket.id === "today"}
                    showDial={bucket.id !== "nodate" && bucket.id !== "done"}
                    showUnassigned={includeGroup}
                    onOpen={setEditing}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {creating ? <TaskModal onClose={() => setCreating(false)} /> : null}
      {editing ? <TaskModal task={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
