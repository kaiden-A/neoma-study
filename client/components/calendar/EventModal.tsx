"use client";

import { useState } from "react";

import { Field } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { fromInputValue, toInputValue } from "@/lib/dates";
import { EVENT_TYPES, REMINDER_OPTIONS } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { CalendarEvent, EventType } from "@/lib/types";

export interface EventModalDefaults {
  type?: EventType;
  groupId?: string;
  start?: number;
  title?: string;
}

export function EventModal({
  event,
  defaults,
  onClose,
  onCreated,
}: {
  event?: CalendarEvent;
  defaults?: EventModalDefaults;
  onClose: () => void;
  onCreated?: (event: CalendarEvent) => void;
}) {
  const store = useStore();
  const { toast, confirm } = useOverlays();
  const editing = Boolean(event);

  const [title, setTitle] = useState(event?.title ?? defaults?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? defaults?.type ?? "session");
  const [groupId, setGroupId] = useState(event?.groupId ?? defaults?.groupId ?? "");
  const [startsAt, setStartsAt] = useState(() =>
    toInputValue(event?.startsAt ?? defaults?.start ?? Date.now() + 3_600_000),
  );
  const [endsAt, setEndsAt] = useState(() =>
    toInputValue(event?.endsAt ?? (event?.startsAt ?? defaults?.start ?? Date.now() + 3_600_000) + 3_600_000),
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [reminder, setReminder] = useState(event?.reminderMinutes ?? 60);
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("Give the event a title.");
      return;
    }
    const startMs = fromInputValue(startsAt);
    if (startMs === null) {
      setError("Pick a start time.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      type,
      groupId: groupId || null,
      startsAt: startMs,
      endsAt: fromInputValue(endsAt),
      location: location.trim(),
      reminderMinutes: reminder,
      notes: notes.trim(),
    };
    try {
      if (event) {
        await store.updateEvent(event.id, payload);
        toast("Event updated", { kind: "success" });
        onClose();
      } else {
        const created = await store.createEvent(payload);
        toast("Added to the calendar", { kind: "success", icon: "fa-calendar-plus" });
        onClose();
        onCreated?.(created);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the event.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!event) return;
    const ok = await confirm({
      title: `Delete “${event.title}”?`,
      message: "It disappears from the calendar and reminders stop.",
      confirmLabel: "Delete event",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteEvent(event.id);
      toast("Event deleted", { kind: "info" });
      onClose();
    } catch {
      // The store puts the event back and says what went wrong.
    }
  }

  async function google() {
    if (!event) return;
    const url = await store.eventGoogleUrl(event.id);
    window.open(url, "_blank", "noopener");
  }

  return (
    <Modal
      title={editing ? "Edit event" : "New event"}
      subtitle="Events and reminders live alongside your group deadlines."
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <>
              <button type="button" className="nm-btn nm-btn--danger nm-btn--ghost" onClick={() => void remove()}>
                Delete
              </button>
              <a className="nm-btn nm-btn--ghost" href={`/api/events/${event?.id}/ics`}>
                <i className="fa-solid fa-file-arrow-down" aria-hidden="true" />
                Download .ics
              </a>
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => void google()}>
                <i className="fa-solid fa-calendar-plus" aria-hidden="true" />
                Add to Google
              </button>
            </>
          ) : null}
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nm-btn nm-btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save event" : "Add to calendar"}
          </button>
        </>
      }
    >
      <Field label="Title" htmlFor="ev-title" required error={error ?? undefined} full>
        <input
          id="ev-title"
          className="nm-input"
          placeholder="e.g. Physics revision block"
          value={title}
          onChange={(event_) => {
            setTitle(event_.target.value);
            setError(null);
          }}
        />
      </Field>

      <div className="nm-form-grid">
        <Field label="Type" htmlFor="ev-type">
          <select
            id="ev-type"
            className="nm-select"
            value={type}
            onChange={(event_) => setType(event_.target.value as EventType)}
          >
            {Object.entries(EVENT_TYPES).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group (optional)" htmlFor="ev-group">
          <select
            id="ev-group"
            className="nm-select"
            value={groupId}
            onChange={(event_) => setGroupId(event_.target.value)}
          >
            <option value="">No group</option>
            {store.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starts" htmlFor="ev-start">
          <input
            id="ev-start"
            type="datetime-local"
            className="nm-input"
            value={startsAt}
            onChange={(event_) => setStartsAt(event_.target.value)}
          />
        </Field>
        <Field label="Ends" htmlFor="ev-end">
          <input
            id="ev-end"
            type="datetime-local"
            className="nm-input"
            value={endsAt}
            onChange={(event_) => setEndsAt(event_.target.value)}
          />
        </Field>
        <Field label="Location" htmlFor="ev-location">
          <input
            id="ev-location"
            className="nm-input"
            placeholder="Room, hall, link…"
            value={location}
            onChange={(event_) => setLocation(event_.target.value)}
          />
        </Field>
        <Field label="Reminder" htmlFor="ev-reminder">
          <select
            id="ev-reminder"
            className="nm-select"
            value={String(reminder)}
            onChange={(event_) => setReminder(Number(event_.target.value))}
          >
            {REMINDER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notes" htmlFor="ev-notes" full>
        <textarea
          id="ev-notes"
          className="nm-textarea"
          rows={2}
          placeholder="What to bring, what to cover…"
          value={notes}
          onChange={(event_) => setNotes(event_.target.value)}
        />
      </Field>
    </Modal>
  );
}
