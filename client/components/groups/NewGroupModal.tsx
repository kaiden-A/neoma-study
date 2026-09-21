"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/bits";
import { useOverlays } from "@/components/ui/Overlays";
import { MARKERS } from "@/lib/markers";
import { useStore } from "@/lib/store";
import type { GroupKind } from "@/lib/types";

export function NewGroupModal({
  defaultKind = "project",
  onClose,
}: {
  defaultKind?: GroupKind;
  onClose: () => void;
}) {
  const { createGroup } = useStore();
  const { toast } = useOverlays();
  const router = useRouter();
  const [kind, setKind] = useState<GroupKind>(defaultKind);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(defaultKind === "study" ? "violet" : "sky");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      setError("Name the group so members recognise the invite.");
      return;
    }
    setSaving(true);
    try {
      const group = await createGroup({
        kind,
        name: name.trim(),
        subject: subject.trim(),
        description: description.trim(),
        color,
        topics:
          kind === "study"
            ? topics
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean)
            : [],
      });
      toast(kind === "study" ? "Study group created" : "Group created", {
        kind: "success",
        icon: kind === "study" ? "fa-note-sticky" : "fa-users",
        body:
          kind === "study"
            ? "Share a note or invite the crew from Members."
            : "Invite members from the Members tab.",
      });
      onClose();
      router.push(`/groups/${group.id}?tab=${kind === "study" ? "notes" : "members"}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the group.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New group"
      subtitle="A project group runs a task board. A study group trades notes and books sessions."
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nm-btn nm-btn--primary" onClick={save} disabled={saving}>
            {saving ? "Creating…" : "Create group"}
          </button>
        </>
      }
    >
      <div className="nm-seg nm-seg--wide" role="tablist" aria-label="Group kind">
        <button
          type="button"
          role="tab"
          aria-selected={kind === "project"}
          className={`nm-seg-btn${kind === "project" ? " is-active" : ""}`}
          onClick={() => {
            setKind("project");
            setColor("sky");
          }}
        >
          <i className="fa-solid fa-list-check" aria-hidden="true" />
          Project group
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={kind === "study"}
          className={`nm-seg-btn${kind === "study" ? " is-active" : ""}`}
          onClick={() => {
            setKind("study");
            setColor("violet");
          }}
        >
          <i className="fa-solid fa-note-sticky" aria-hidden="true" />
          Study group
        </button>
      </div>
      <p className="nm-help mb-3">
        {kind === "study"
          ? "Notes come first: shared subjects, note requests and study sessions."
          : "Tasks come first: a board, deadlines and reminders for the group."}
      </p>

      <Field label="Group name" htmlFor="ng-name" required error={error ?? undefined}>
        <input
          id="ng-name"
          className="nm-input"
          value={name}
          placeholder={kind === "study" ? "e.g. Finals crew — mixed units" : "e.g. Capstone — Sensor Dashboard"}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </Field>

      {kind === "study" ? (
        <Field
          label="Topics"
          htmlFor="ng-topics"
          help="Comma separated. Members file shared notes under these, and can filter by them."
        >
          <input
            id="ng-topics"
            className="nm-input"
            value={topics}
            placeholder="CS301, CHEM210, MATH201"
            onChange={(event) => setTopics(event.target.value)}
          />
        </Field>
      ) : (
        <Field label="Subject / unit" htmlFor="ng-subject">
          <input
            id="ng-subject"
            className="nm-input"
            value={subject}
            placeholder="CS301"
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
      )}

      <Field label="What is it for?" htmlFor="ng-desc">
        <textarea
          id="ng-desc"
          className="nm-textarea"
          rows={2}
          value={description}
          placeholder={
            kind === "study"
              ? "Who is in it, what you trade, when you meet…"
              : "Deadline, brief, what the group is delivering…"
          }
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="nm-field">
        <span className="nm-label">Colour</span>
        <div className="nm-swatches" role="radiogroup" aria-label="Group colour">
          {MARKERS.map((item) => (
            <label
              key={item.key}
              className={`nm-swatch nm-mk-${item.key}${color === item.key ? " is-selected" : ""}`}
              title={item.label}
            >
              <input
                type="radio"
                name="group-color"
                value={item.key}
                checked={color === item.key}
                onChange={() => setColor(item.key)}
              />
              <span className="nm-swatch-dot" />
              <span className="nm-sr">{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
