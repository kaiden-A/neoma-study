"use client";

import { useState } from "react";

import { Avatar, Field } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { domainOf, fromInputValue, toInputValue } from "@/lib/dates";
import { PRIORITY_LABEL, REMINDER_OPTIONS, STATUS_LABEL } from "@/lib/markers";
import { useStore, type SubtaskInput, type TaskLinkInput } from "@/lib/store";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

export interface TaskModalDefaults {
  groupId?: string;
  dueAt?: number | null;
  assigneeIds?: string[];
}

export function TaskModal({
  task,
  defaults,
  onClose,
}: {
  task?: Task;
  defaults?: TaskModalDefaults;
  onClose: () => void;
}) {
  const store = useStore();
  const { toast, confirm } = useOverlays();
  const editing = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueAt, setDueAt] = useState(toInputValue(task?.dueAt ?? defaults?.dueAt ?? null));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "med");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [reminder, setReminder] = useState(task?.reminderMinutes ?? 60);
  const [groupId, setGroupId] = useState(task?.groupId ?? defaults?.groupId ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assigneeIds ?? defaults?.assigneeIds ?? [],
  );
  const [subtasks, setSubtasks] = useState<SubtaskInput[]>(
    (task?.subtasks ?? []).map((item) => ({ id: item.id, title: item.title, done: item.done })),
  );
  const [links, setLinks] = useState<TaskLinkInput[]>(
    (task?.links ?? []).map((item) => ({ id: item.id, label: item.label, url: item.url })),
  );
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const members = groupId ? store.membersOf(groupId) : [];

  function changeGroup(next: string) {
    setGroupId(next);
    if (!next) setAssigneeIds([]);
  }

  function addSubtask() {
    const clean = subtaskDraft.trim();
    if (!clean) return;
    setSubtasks((current) => [...current, { title: clean, done: false }]);
    setSubtaskDraft("");
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setLinks((current) => [
      ...current,
      { label: linkLabel.trim() || domainOf(url), url },
    ]);
    setLinkLabel("");
    setLinkUrl("");
  }

  async function save() {
    if (!title.trim()) {
      setError("Give the task a name so people know what it is.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim(),
      dueAt: fromInputValue(dueAt),
      priority,
      status,
      reminderMinutes: reminder,
      groupId: groupId || null,
      assigneeIds: groupId ? assigneeIds : [],
      subtasks: subtasks.map((item) => ({ title: item.title, done: item.done })),
      links,
    };
    try {
      if (task) {
        const wasDone = task.status === "done";
        await store.updateTask(task.id, payload);
        toast(status === "done" && !wasDone ? "Nice — task closed" : "Task updated", { kind: "success" });
      } else {
        await store.createTask(payload);
        toast("Task created", { kind: "success", icon: "fa-plus" });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task) return;
    const ok = await confirm({
      title: "Delete this task?",
      message: `“${task.title}” will be removed from the board and from everyone’s deadlines.`,
      confirmLabel: "Delete task",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteTask(task.id);
      toast("Task deleted", { kind: "info" });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the task.");
    }
  }

  return (
    <Modal
      title={editing ? "Edit task" : "New task"}
      subtitle={editing ? `Created by ${store.userName(task?.createdBy)}` : "Give it a due date so reminders can fire"}
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <button type="button" className="nm-btn nm-btn--danger nm-btn--ghost" onClick={() => void remove()}>
              Delete task
            </button>
          ) : null}
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nm-btn nm-btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save task" : "Create task"}
          </button>
        </>
      }
    >
      <Field label="Task" htmlFor="tm-title" required error={error ?? undefined} full>
        <input
          id="tm-title"
          className="nm-input"
          value={title}
          placeholder="What needs doing?"
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
        />
      </Field>

      <Field label="Details" htmlFor="tm-desc" full>
        <textarea
          id="tm-desc"
          className="nm-textarea"
          rows={3}
          value={description}
          placeholder="Scope, links to the brief, acceptance notes…"
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="nm-form-grid">
        <Field label="Due" htmlFor="tm-due">
          <input
            id="tm-due"
            type="datetime-local"
            className="nm-input"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </Field>
        <Field label="Priority" htmlFor="tm-priority">
          <select
            id="tm-priority"
            className="nm-select"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
          >
            {(["low", "med", "high"] as const).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="tm-status">
          <select
            id="tm-status"
            className="nm-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
          >
            {(["todo", "doing", "done"] as const).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reminder" htmlFor="tm-reminder">
          <select
            id="tm-reminder"
            className="nm-select"
            value={String(reminder)}
            onChange={(event) => setReminder(Number(event.target.value))}
          >
            {REMINDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group" htmlFor="tm-group">
          <select
            id="tm-group"
            className="nm-select"
            value={groupId}
            onChange={(event) => changeGroup(event.target.value)}
          >
            <option value="">Personal task</option>
            {store.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.subject ? ` · ${group.subject}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="nm-field nm-field--full">
        <span className="nm-label">Assign to</span>
        {!groupId ? (
          <p className="nm-help">Pick a group to assign this task to people.</p>
        ) : members.length === 0 ? (
          <p className="nm-help">No members yet — invite someone from the Members tab.</p>
        ) : (
          <div className="nm-checkgrid">
            {members.map((member) => (
              <label className="nm-check nm-check--card" key={member.id}>
                <input
                  type="checkbox"
                  checked={assigneeIds.includes(member.id)}
                  onChange={(event) =>
                    setAssigneeIds((current) =>
                      event.target.checked
                        ? [...current, member.id]
                        : current.filter((id) => id !== member.id),
                    )
                  }
                />
                <Avatar name={member.name} email={member.email} color={member.color} size={22} />
                <span>
                  {member.name}
                  {member.id === store.user?.id ? " (you)" : ""}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="nm-field nm-field--full">
        <span className="nm-label">Checklist</span>
        {subtasks.length ? (
          <div className="nm-sublist">
            {subtasks.map((item, index) => (
              <div className="nm-subrow" key={`${item.title}-${index}`}>
                <label className="nm-check">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) =>
                      setSubtasks((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, done: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  <span>{item.title}</span>
                </label>
                <button
                  type="button"
                  className="nm-iconbtn nm-iconbtn--sm"
                  aria-label="Remove step"
                  onClick={() => setSubtasks((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="nm-inline-add">
          <input
            className="nm-input"
            placeholder="Add a step and press Enter"
            value={subtaskDraft}
            onChange={(event) => setSubtaskDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addSubtask();
              }
            }}
          />
          <button type="button" className="nm-btn nm-btn--secondary" onClick={addSubtask}>
            Add step
          </button>
        </div>
      </div>

      <div className="nm-field nm-field--full">
        <span className="nm-label">Links</span>
        {links.length ? (
          <div className="nm-linklist">
            {links.map((item, index) => (
              <div className="nm-linkrow" key={`${item.url}-${index}`}>
                <i className="fa-solid fa-link" aria-hidden="true" />
                <a className="nm-linkrow-label" href={item.url} target="_blank" rel="noopener">
                  {item.label}
                </a>
                <span className="nm-linkrow-url nm-mono">{item.url}</span>
                <button
                  type="button"
                  className="nm-iconbtn nm-iconbtn--sm"
                  aria-label="Remove link"
                  onClick={() => setLinks((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="nm-inline-add">
          <input
            className="nm-input"
            placeholder="Label"
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
          />
          <input
            className="nm-input"
            placeholder="https://…"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
          <button type="button" className="nm-btn nm-btn--secondary" onClick={addLink}>
            Attach link
          </button>
        </div>
      </div>
    </Modal>
  );
}
