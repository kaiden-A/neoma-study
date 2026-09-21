"use client";

import { useState } from "react";

import { TaskModal } from "@/components/tasks/TaskModal";
import { Avatar, Dial, EmptyState, Progress } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDateTime } from "@/lib/dates";
import { PRIORITY_ICON, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { Group, Task, TaskStatus } from "@/lib/types";

const COLUMNS: { id: TaskStatus; empty: string }[] = [
  { id: "todo", empty: "New work lands here." },
  { id: "doing", empty: "Drag a card in when you start it." },
  { id: "done", empty: "Finished work piles up here." },
];

export function TasksPanel({ group }: { group: Group }) {
  const store = useStore();
  const { toast } = useOverlays();
  const [view, setView] = useState<"board" | "list">("board");
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  const tasks = store.tasksForGroup(group.id);

  async function setStatus(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    const previous = task.status;
    await store.updateTask(task.id, { status });
    if (status === "done") {
      toast(`“${task.title.slice(0, 28)}” done`, {
        kind: "success",
        icon: "fa-check",
        actionLabel: "Undo",
        onAction: () => void store.updateTask(task.id, { status: previous }),
      });
    } else {
      toast(`Moved to ${STATUS_LABEL[status]}`, {
        kind: "success",
        actionLabel: "Undo",
        onAction: () => void store.updateTask(task.id, { status: previous }),
      });
    }
  }

  async function remove(task: Task) {
    await store.deleteTask(task.id);
    toast("Task deleted", { kind: "info" });
  }

  return (
    <>
      <div className="nm-toolbar">
        <div className="nm-seg" role="tablist" aria-label="Task view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "board"}
            className={`nm-seg-btn${view === "board" ? " is-active" : ""}`}
            onClick={() => setView("board")}
          >
            <i className="fa-solid fa-table-columns" aria-hidden="true" />
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "list"}
            className={`nm-seg-btn${view === "list" ? " is-active" : ""}`}
            onClick={() => setView("list")}
          >
            <i className="fa-solid fa-list" aria-hidden="true" />
            List
          </button>
        </div>
        <div className="nm-toolbar-spacer" />
        <button type="button" className="nm-btn nm-btn--primary" onClick={() => setCreating(true)}>
          <i className="fa-solid fa-plus" aria-hidden="true" />
          {group.kind === "study" ? "Add goal" : "Add task"}
        </button>
      </div>

      {group.kind === "study" ? (
        <p className="nm-help mb-3">
          Optional. Notes and sessions are the point — this is just somewhere to park reading goals.
        </p>
      ) : null}

      {view === "board" ? (
        <div className="nm-board">
          {COLUMNS.map((column) => {
            const items = tasks.filter((task) => task.status === column.id);
            return (
              <div className="nm-col" key={column.id}>
                <div className="nm-col-hd">
                  <span className="nm-col-title">{STATUS_LABEL[column.id]}</span>
                  <span className="nm-chip nm-chip--sm nm-chip--muted">{items.length}</span>
                </div>
                <div
                  className={`nm-col-bd${dragOver === column.id ? " is-dragover" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(column.id);
                  }}
                  onDragLeave={() => setDragOver((current) => (current === column.id ? null : current))}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(null);
                    const taskId = event.dataTransfer.getData("text/plain");
                    const task = tasks.find((item) => item.id === taskId);
                    if (task) void setStatus(task, column.id);
                    setDragging(null);
                  }}
                >
                  {items.length === 0 ? <p className="nm-col-empty">{column.empty}</p> : null}
                  {items.map((task) => (
                    <BoardCard
                      key={task.id}
                      task={task}
                      group={group}
                      dragging={dragging === task.id}
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => setDragging(null)}
                      onOpen={() => setEditing(task)}
                      onDelete={() => void remove(task)}
                      onStatus={(status) => void setStatus(task, status)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="nm-table" role="table" aria-label="Tasks">
          <div className="nm-table-hd" role="row">
            <span>Task</span>
            <span>Assignee</span>
            <span>Due</span>
            <span>Status</span>
            <span />
          </div>
          {tasks.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState
                compact
                icon="fa-list-check"
                title="No tasks yet"
                body="Add the first one so deadlines start counting."
              />
            </div>
          ) : null}
          {tasks.map((task) => (
            <div className={`nm-table-row${task.status === "done" ? " is-done" : ""}`} role="row" key={task.id}>
              <span className="nm-table-task">
                <button
                  type="button"
                  className="nm-task-check"
                  aria-label="Toggle complete"
                  onClick={() => void setStatus(task, task.status === "done" ? "doing" : "done")}
                >
                  <i className="fa-solid fa-check" aria-hidden="true" />
                </button>
                <button type="button" className="nm-link" onClick={() => setEditing(task)}>
                  <span className="nm-task-text">{task.title}</span>
                </button>
                {task.priority === "high" && task.status !== "done" ? (
                  <span className="nm-chip nm-chip--sm nm-chip--danger">High</span>
                ) : null}
              </span>
              <span>
                {task.assigneeIds.length ? (
                  <span className="nm-avatars">
                    {task.assigneeIds.slice(0, 3).map((id) => {
                      const member = store.userById(id);
                      return member ? (
                        <Avatar
                          key={id}
                          name={member.name}
                          email={member.email}
                          color={member.color}
                          size={24}
                        />
                      ) : null;
                    })}
                  </span>
                ) : (
                  <span className="nm-chip nm-chip--sm nm-chip--muted">Nobody</span>
                )}
              </span>
              <span className="nm-mono">{task.dueAt ? fmtDateTime(task.dueAt) : "—"}</span>
              <span>
                <select
                  className="nm-select nm-select--sm"
                  aria-label={`Status for ${task.title}`}
                  value={task.status}
                  onChange={(event) => void setStatus(task, event.target.value as TaskStatus)}
                >
                  {(["todo", "doing", "done"] as const).map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </option>
                  ))}
                </select>
              </span>
              <span>{task.dueAt ? <Dial dueAt={task.dueAt} done={task.status === "done"} showLabel={false} /> : null}</span>
            </div>
          ))}
        </div>
      )}

      <p className="nm-board-hint nm-help">
        <i className="fa-solid fa-hand-pointer" aria-hidden="true" />
        Drag cards between columns, or use the card menu.
      </p>

      {creating ? <TaskModal defaults={{ groupId: group.id }} onClose={() => setCreating(false)} /> : null}
      {editing ? <TaskModal task={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function BoardCard({
  task,
  group,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onDelete,
  onStatus,
}: {
  task: Task;
  group: Group;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onStatus: (status: TaskStatus) => void;
}) {
  const store = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const done = task.status === "done";
  const doneSubs = task.subtasks.filter((item) => item.done).length;
  const assignees = task.assigneeIds
    .map((id) => store.userById(id))
    .filter((member): member is NonNullable<typeof member> => Boolean(member));

  return (
    <article
      className={`nm-boardcard nm-mk-${group.color}${dragging ? " is-dragging" : ""}${done ? " is-done" : ""}`}
      draggable
      tabIndex={0}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="nm-boardcard-top">
        <span
          className={`nm-chip nm-chip--sm nm-chip--${
            task.priority === "high" ? "danger" : task.priority === "med" ? "warn" : "muted"
          }`}
          title={`Priority: ${PRIORITY_LABEL[task.priority]}`}
        >
          <i className={`fa-solid ${PRIORITY_ICON[task.priority]}`} aria-hidden="true" />
          {PRIORITY_LABEL[task.priority]}
        </span>
        {task.dueAt ? (
          <span className="nm-dial-wrap">
            <Dial dueAt={task.dueAt} done={done} showLabel={false} />
          </span>
        ) : null}
      </div>
      <div className="nm-boardcard-title">
        <span className="nm-task-text">{task.title}</span>
      </div>
      {task.description ? (
        <p className="nm-boardcard-desc">{task.description.length > 84 ? `${task.description.slice(0, 84)}…` : task.description}</p>
      ) : null}
      {task.subtasks.length ? (
        <div className="nm-boardcard-subs">
          <span className="nm-mono">
            {doneSubs}/{task.subtasks.length}
          </span>
          <Progress pct={Math.round((doneSubs / task.subtasks.length) * 100)} markerKey={group.color} />
        </div>
      ) : null}
      <div className="nm-boardcard-ft">
        {done ? <span className="nm-chip nm-chip--sm nm-chip--ok">Done</span> : null}
        {assignees.length ? (
          <span className="nm-avatars">
            {assignees.slice(0, 3).map((member) => (
              <Avatar key={member.id} name={member.name} email={member.email} color={member.color} size={24} />
            ))}
          </span>
        ) : (
          <span className="nm-chip nm-chip--sm nm-chip--muted">Unassigned</span>
        )}
        <button
          type="button"
          className="nm-iconbtn nm-iconbtn--sm"
          aria-label="Task actions"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen(true);
          }}
        >
          <i className="fa-solid fa-ellipsis" aria-hidden="true" />
        </button>
      </div>
      {menuOpen ? (
        <Menu
          label="Task actions"
          onClose={() => setMenuOpen(false)}
          style={{ position: "fixed", right: 24, top: 140 }}
          items={[
            { header: "Move to" },
            { label: STATUS_LABEL.todo, icon: "fa-circle", disabled: task.status === "todo", onSelect: () => onStatus("todo") },
            { label: STATUS_LABEL.doing, icon: "fa-play", disabled: task.status === "doing", onSelect: () => onStatus("doing") },
            { label: STATUS_LABEL.done, icon: "fa-check", disabled: done, onSelect: () => onStatus("done") },
            { separator: true },
            { label: "Edit task", icon: "fa-pen", onSelect: onOpen },
            { label: "Delete task", icon: "fa-trash", danger: true, onSelect: onDelete },
          ]}
        />
      ) : null}
    </article>
  );
}
