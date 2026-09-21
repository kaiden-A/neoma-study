"use client";

import { useState } from "react";

import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";

export type AddMode = "today" | "tomorrow" | "none";

/** The inline add row shared by Home and My to-do. */
export function TodoComposer({
  mode,
  onModeChange,
  onAdded,
}: {
  mode: AddMode;
  onModeChange: (mode: AddMode) => void;
  onAdded?: () => void;
}) {
  const store = useStore();
  const { toast } = useOverlays();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    const clean = title.trim();
    if (!clean || saving) return;
    setSaving(true);
    try {
      let dueAt: number | null = null;
      const now = new Date();
      if (mode === "today") {
        const when = new Date(now);
        when.setHours(18, 0, 0, 0);
        dueAt = when.getTime();
      } else if (mode === "tomorrow") {
        const when = new Date(now);
        when.setDate(when.getDate() + 1);
        when.setHours(9, 0, 0, 0);
        dueAt = when.getTime();
      }
      await store.createTask({ title: clean, groupId: null, dueAt, priority: "med" });
      setTitle("");
      toast("Added to your list", { kind: "success", icon: "fa-list-check" });
      onAdded?.();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not add that.", { kind: "danger" });
    } finally {
      setSaving(false);
    }
  }

  const modes: { id: AddMode; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "tomorrow", label: "Tomorrow" },
    { id: "none", label: "No date" },
  ];

  return (
    <div className="nm-todo-add">
      <input
        className="nm-input nm-todo-input"
        placeholder="Add something to your list…"
        aria-label="Add a to-do"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void add();
        }}
      />
      <div className="nm-todo-modes" role="group" aria-label="When">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            className={`nm-chip nm-chip--sm nm-chip--link${mode === item.id ? " is-active" : ""}`}
            onClick={() => onModeChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="nm-btn nm-btn--primary nm-btn--sm" onClick={() => void add()} disabled={saving}>
        <i className="fa-solid fa-plus" aria-hidden="true" />
        Add
      </button>
    </div>
  );
}
