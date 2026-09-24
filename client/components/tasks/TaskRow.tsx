"use client";

import { useState } from "react";

import { Avatar, Dial } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDateTime, fmtTime } from "@/lib/dates";
import { PRIORITY_LABEL } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Task } from "@/lib/types";

export function TaskRow({
  task,
  hideGroup = false,
  timeOnly = false,
  showDial = true,
  showUnassigned = false,
  menu = false,
  onOpen,
}: {
  task: Task;
  hideGroup?: boolean;
  timeOnly?: boolean;
  showDial?: boolean;
  showUnassigned?: boolean;
  menu?: boolean;
  onOpen?: (task: Task) => void;
}) {
  const store = useStore();
  const { toast, confirm } = useOverlays();
  const [menuOpen, setMenuOpen] = useState(false);
  const done = task.status === "done";
  const group = task.groupId ? store.groupById(task.groupId) : null;

  function toggle() {
    const next = done ? "todo" : "done";
    void store.updateTask(task.id, { status: next }).catch(() => {});
    if (next === "done") {
      toast(`“${task.title.slice(0, 30)}” done`, {
        kind: "success",
        icon: "fa-check",
        actionLabel: "Undo",
        onAction: () => void store.updateTask(task.id, { status: task.status }).catch(() => {}),
      });
    }
  }

  function postpone() {
    const before = task.dueAt;
    void store.postponeTask(task.id).catch(() => {});
    toast("Moved to tomorrow", {
      kind: "success",
      actionLabel: "Undo",
      onAction: () => void store.updateTask(task.id, { dueAt: before }).catch(() => {}),
    });
  }

  async function duplicate() {
    try {
      const copy = await store.duplicateTask(task.id);
      toast("Duplicated", {
        kind: "success",
        actionLabel: "Open",
        onAction: () => onOpen?.(copy),
      });
    } catch {
      toast("Could not duplicate that task", { kind: "danger" });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${task.title}”?`,
      message: "It disappears from your list, the calendar and reminders.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteTask(task.id);
      toast("Deleted", { kind: "info" });
    } catch {
      // The store rolls the row back and says what went wrong.
    }
  }

  const assignees = task.assigneeIds
    .map((id) => store.userById(id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member));

  return (
    <li className={`nm-task${done ? " is-done" : ""}`}>
      <button
        type="button"
        className="nm-task-check"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        onClick={() => void toggle()}
      >
        <i className="fa-solid fa-check" aria-hidden="true" />
      </button>

      <div className="nm-task-main">
        <div className="nm-task-title">
          <button type="button" className="nm-link" onClick={() => onOpen?.(task)}>
            <span className="nm-task-text">{task.title}</span>
          </button>
          {task.description ? (
            <i className="fa-solid fa-align-left nm-meta" title="Has a note" aria-hidden="true" />
          ) : null}
        </div>
        <div className="nm-task-meta">
          {!hideGroup ? (
            group ? (
              <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`}>
                <span className="nm-dot" />
                {group.name}
              </span>
            ) : (
              <span className="nm-chip nm-chip--sm nm-chip--muted">No group</span>
            )
          ) : null}
          {task.dueAt ? (
            <span className="nm-mono">{timeOnly ? fmtTime(task.dueAt) : fmtDateTime(task.dueAt)}</span>
          ) : null}
          {task.priority === "high" && !done ? (
            <span className="nm-chip nm-chip--sm nm-chip--danger">{PRIORITY_LABEL.high}</span>
          ) : null}
        </div>
      </div>

      <div className="nm-task-side">
        {showDial && task.dueAt ? <Dial dueAt={task.dueAt} done={done} /> : null}
        {assignees.length ? (
          <span className="nm-avatars">
            {assignees.slice(0, 3).map((member) => (
              <Avatar key={member.id} name={member.name} email={member.email} color={member.color} size={24} />
            ))}
          </span>
        ) : showUnassigned ? (
          <span className="nm-chip nm-chip--sm nm-chip--muted">Unassigned</span>
        ) : null}
        {menu ? (
          <button
            type="button"
            className="nm-iconbtn nm-iconbtn--sm"
            aria-label="Task actions"
            onClick={() => setMenuOpen(true)}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {menuOpen ? (
        <Menu
          label="Task actions"
          onClose={() => setMenuOpen(false)}
          style={{ position: "fixed", right: 24, top: 120 }}
          items={[
            { label: "Edit", icon: "fa-pen", onSelect: () => onOpen?.(task) },
            { label: "Postpone to tomorrow", icon: "fa-calendar-plus", onSelect: () => void postpone() },
            { label: "Duplicate", icon: "fa-clone", onSelect: () => void duplicate() },
            { separator: true },
            { label: "Delete", icon: "fa-trash", danger: true, onSelect: () => void remove() },
          ]}
        />
      ) : null}
    </li>
  );
}
