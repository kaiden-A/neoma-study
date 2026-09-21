"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { EventModal } from "@/components/calendar/EventModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { fromInputValue, toInputValue } from "@/lib/dates";
import { useStore } from "@/lib/store";

type Mode = "note" | "task" | "event";

/** The topbar feather: one field, filed where it belongs. */
export function QuickCapture({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const router = useRouter();
  const { toast } = useOverlays();
  const [mode, setMode] = useState<Mode>("note");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [due, setDue] = useState(() => toInputValue(Date.now() + 3 * 86_400_000));
  const [eventType, setEventType] = useState<"exam" | "session" | "meeting" | "personal">("session");
  const [when, setWhen] = useState(() => toInputValue(Date.now() + 86_400_000));
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  async function capture() {
    const clean = title.trim();
    if (!clean) return;
    try {
      if (mode === "note") {
        const note = await store.createNote({ type: "note", title: clean, subjectId: subjectId || null });
        toast("Captured to your notes", {
          kind: "success",
          icon: "fa-note-sticky",
          actionLabel: "Open",
          onAction: () => router.push(`/vault/${note.id}`),
        });
      } else if (mode === "task") {
        const task = await store.createTask({
          title: clean,
          groupId: groupId || null,
          assigneeIds: groupId && store.user ? [store.user.id] : [],
          dueAt: fromInputValue(due),
        });
        toast(groupId ? "Task added to the group" : "Added to your to-do", {
          kind: "success",
          icon: "fa-list-check",
          actionLabel: "Open",
          onAction: () => router.push(task.groupId ? `/groups/${task.groupId}?tab=tasks` : "/tasks"),
        });
      } else {
        await store.createEvent({
          title: clean,
          type: eventType,
          startsAt: fromInputValue(when) ?? Date.now(),
        });
        toast("Event added", {
          kind: "success",
          icon: "fa-calendar-plus",
          actionLabel: "Open",
          onAction: () => router.push("/calendar"),
        });
      }
      onClose();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not capture that.", { kind: "danger" });
    }
  }

  return (
    <Modal
      title="Quick capture"
      subtitle="One field. Neoma files it where it belongs."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nm-btn nm-btn--primary" onClick={() => void capture()}>
            Capture
          </button>
        </>
      }
    >
      <div className="nm-seg nm-seg--wide" role="tablist" aria-label="Capture type">
        {(
          [
            { id: "note", label: "Note", icon: "fa-note-sticky" },
            { id: "task", label: "Task", icon: "fa-list-check" },
            { id: "event", label: "Event", icon: "fa-calendar-plus" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={`nm-seg-btn${mode === item.id ? " is-active" : ""}`}
            onClick={() => setMode(item.id)}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="nm-field">
        <label className="nm-label" htmlFor="qc-title">
          What is it?
        </label>
        <input
          id="qc-title"
          className="nm-input"
          placeholder="Say it in one line"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void capture();
          }}
        />
      </div>

      {mode === "note" ? (
        <div className="nm-field">
          <label className="nm-label" htmlFor="qc-folder">
            File under
          </label>
          <select id="qc-folder" className="nm-select" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            <option value="">No subject</option>
            {store.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {mode === "task" ? (
        <div className="nm-form-grid">
          <div className="nm-field">
            <label className="nm-label" htmlFor="qc-group">
              List
            </label>
            <select id="qc-group" className="nm-select" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              <option value="">My to-do (personal)</option>
              {store.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="nm-field">
            <label className="nm-label" htmlFor="qc-due">
              Due
            </label>
            <input
              id="qc-due"
              type="datetime-local"
              className="nm-input"
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {mode === "event" ? (
        <div className="nm-form-grid">
          <div className="nm-field">
            <label className="nm-label" htmlFor="qc-etype">
              Type
            </label>
            <select
              id="qc-etype"
              className="nm-select"
              value={eventType}
              onChange={(event) => setEventType(event.target.value as typeof eventType)}
            >
              <option value="exam">Exam</option>
              <option value="session">Study session</option>
              <option value="meeting">Meeting</option>
              <option value="personal">Personal</option>
            </select>
          </div>
          <div className="nm-field">
            <label className="nm-label" htmlFor="qc-estart">
              When
            </label>
            <input
              id="qc-estart"
              type="datetime-local"
              className="nm-input"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="nm-inline-actions">
        <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => setTaskModalOpen(true)}>
          More options — task
        </button>
        <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => setEventModalOpen(true)}>
          More options — event
        </button>
      </div>

      {taskModalOpen ? <TaskModal onClose={() => setTaskModalOpen(false)} /> : null}
      {eventModalOpen ? <EventModal onClose={() => setEventModalOpen(false)} /> : null}
    </Modal>
  );
}
