"use client";

import { useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDay, fmtTime } from "@/lib/dates";
import { useStore, type TaskCreateInput } from "@/lib/store";
import type { Task, WeekPlan, WeekPlanItem } from "@/lib/types";

function itemKey(dayIndex: number, itemIndex: number): string {
  return `${dayIndex}:${itemIndex}`;
}

function planMarkdown(plan: WeekPlan): string {
  const lines = [`# ${plan.title}`, "", (plan.summary || "").trim(), ""];
  for (const day of plan.days) {
    lines.push(`## ${day.label || day.date}`, "");
    for (const item of day.items) {
      const meta = [
        item.dueAt ? fmtTime(item.dueAt) : "",
        item.minutes ? `${item.minutes} min` : "",
        item.reason,
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- [ ] ${item.title}${meta ? ` — ${meta}` : ""}`);
      for (const subtask of item.subtasks) lines.push(`    - ${subtask}`);
      if (item.tip) lines.push(`    > ${item.tip}`);
    }
    lines.push("");
  }
  if (plan.deferred.length) {
    lines.push("## Deferred", "");
    for (const item of plan.deferred) lines.push(`- ${item.title} — ${item.reason}`);
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function createInput(item: WeekPlanItem): TaskCreateInput {
  const description = [
    item.reason,
    item.minutes ? `Estimated ${item.minutes} min.` : "",
    item.tip ? `Tip: ${item.tip}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    title: item.title,
    description,
    dueAt: item.dueAt !== null && item.dueAt > Date.now() ? item.dueAt : null,
    priority: item.priority,
    subtasks: item.subtasks.map((title) => ({ title, done: false })),
  };
}

export function PlanModal({
  plan,
  onClose,
  onCreated,
}: {
  plan: WeekPlan;
  onClose: () => void;
  onCreated?: (created: Task[], keys: string[]) => void;
}) {
  const store = useStore();
  const { toast } = useOverlays();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingIds = useMemo(() => new Set(store.tasks.map((task) => task.id)), [store.tasks]);
  const existingById = useMemo(
    () => new Map(store.tasks.map((task) => [task.id, task])),
    [store.tasks],
  );
  const rows = useMemo(
    () =>
      plan.days.flatMap((day, dayIndex) =>
        day.items.map((item, itemIndex) => {
          const key = itemKey(dayIndex, itemIndex);
          const existing = item.taskId !== null && existingIds.has(item.taskId);
          return { key, day, item, existing };
        }),
      ),
    [existingIds, plan.days],
  );
  const newRows = rows.filter((row) => !row.existing);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(newRows.map((row) => row.key)),
  );
  const selected = rows.filter((row) => !row.existing && picked.has(row.key));
  const selectedMinutes = selected.reduce((total, row) => total + row.item.minutes, 0);

  function toggle(key: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function createTasks() {
    if (selected.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await store.createTasks(selected.map((row) => createInput(row.item)));
      onCreated?.(
        created,
        selected.map((row) => row.key),
      );
      toast(`${created.length} task${created.length === 1 ? "" : "s"} added to your list`, {
        kind: "success",
        icon: "fa-list-check",
        route: "/today",
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add those tasks.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const note = await store.createNote({ title: plan.title, body: planMarkdown(plan) });
      toast("Plan saved to your vault", {
        kind: "success",
        icon: "fa-note-sticky",
        route: `/vault/${note.id}`,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the plan.");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button
        type="button"
        className="nm-btn nm-btn--ghost"
        onClick={() => void saveNote()}
        disabled={saving}
      >
        <i className="fa-solid fa-note-sticky" aria-hidden="true" />
        Save as note
      </button>
      <div className="nm-spacer" />
      <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="nm-btn nm-btn--primary"
        onClick={() => void createTasks()}
        disabled={saving || selected.length === 0}
      >
        {saving
          ? "Adding…"
          : `Add ${selected.length} task${selected.length === 1 ? "" : "s"}${
              selectedMinutes ? ` · ${selectedMinutes} min` : ""
            }`}
      </button>
    </>
  );

  return (
    <Modal
      title="Your week"
      subtitle={plan.title}
      size="lg"
      onClose={onClose}
      dismissible={!saving}
      footer={footer}
    >
      {plan.summary ? <p className="nm-body-text">{plan.summary}</p> : null}
      <p className="nm-help nm-plan-note">
        New blocks are checked by default; uncheck any you do not want. Existing tasks stay where
        they are — nothing moves a deadline.
      </p>

      {plan.days.map((day, dayIndex) => {
        const dayMinutes = day.items.reduce((total, item) => total + item.minutes, 0);
        return (
          <section className="nm-plan-day" key={`${day.date}-${dayIndex}`}>
            <div className="nm-plan-day-hd">
              <span className="nm-eyebrow">{day.label || day.date}</span>
              {dayMinutes ? <span className="nm-mono nm-meta">{dayMinutes} min</span> : null}
            </div>
            <ul className="nm-plan-list">
              {day.items.map((item, itemIndex) => {
                const key = itemKey(dayIndex, itemIndex);
                const existing = item.taskId !== null && existingIds.has(item.taskId);
                const existingTask = item.taskId ? existingById.get(item.taskId) : undefined;
                const dueLabel = existingTask?.dueAt
                  ? `due ${fmtDay(existingTask.dueAt)} ${fmtTime(existingTask.dueAt)}`
                  : !existing && item.dueAt
                    ? fmtTime(item.dueAt)
                    : "";
                return (
                  <li key={key} className={`nm-plan-item${existing ? " is-existing" : ""}`}>
                    <div className="nm-plan-item-hd">
                      {existing ? (
                        <span className="nm-plan-existing">
                          <i className="fa-solid fa-circle-check" aria-hidden="true" />
                          <span className="nm-plan-item-title">{item.title}</span>
                        </span>
                      ) : (
                        <label className="nm-check">
                          <input
                            type="checkbox"
                            checked={picked.has(key)}
                            onChange={() => toggle(key)}
                          />
                          <span className="nm-plan-item-title">{item.title}</span>
                        </label>
                      )}
                      <span className="nm-mono nm-plan-item-meta">
                        {dueLabel ? `${dueLabel} · ` : ""}
                        {item.minutes} min · {item.priority}
                      </span>
                    </div>
                    {existing ? (
                      <span className="nm-chip nm-chip--sm nm-chip--muted">already in your list</span>
                    ) : null}
                    {item.reason ? <p className="nm-help">{item.reason}</p> : null}
                    {item.tip ? (
                      <p className="nm-help nm-plan-tip">
                        <i className="fa-solid fa-lightbulb" aria-hidden="true" />
                        {item.tip}
                      </p>
                    ) : null}
                    {item.subtasks.length ? (
                      <ul className="nm-plan-subs">
                        {item.subtasks.map((subtask) => (
                          <li key={subtask}>{subtask}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {plan.deferred.length ? (
        <section className="nm-plan-day">
          <div className="nm-plan-day-hd">
            <span className="nm-eyebrow">Deferred</span>
          </div>
          <ul className="nm-plan-list">
            {plan.deferred.map((item, index) => (
              <li key={`${item.taskId ?? item.title}-${index}`} className="nm-plan-item">
                <div className="nm-plan-item-hd">
                  <span className="nm-plan-item-title">{item.title}</span>
                  {item.taskId && existingIds.has(item.taskId) ? (
                    <span className="nm-chip nm-chip--sm nm-chip--muted">already in your list</span>
                  ) : null}
                </div>
                {item.reason ? <p className="nm-help">{item.reason}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="nm-error">{error}</p> : null}
    </Modal>
  );
}
