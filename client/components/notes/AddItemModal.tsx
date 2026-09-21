"use client";

import { useState } from "react";

import { Field } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { domainOf } from "@/lib/dates";
import { MAX_FILE_BYTES, compressImage, fmtBytes, parseTags, typeFromFile } from "@/lib/files";
import { useStore } from "@/lib/store";
import type { NoteType } from "@/lib/types";

type Mode = "note" | "upload" | "link";

const UPLOAD_TYPES: { value: NoteType; label: string }[] = [
  { value: "handwritten", label: "Handwritten notes (photo)" },
  { value: "slides", label: "Presentation slides" },
  { value: "paper", label: "Question paper / past paper" },
  { value: "note", label: "Typed document" },
];

export function AddItemModal({
  defaultSubjectId,
  onClose,
  onCreated,
}: {
  defaultSubjectId?: string | null;
  onClose: () => void;
  onCreated?: (noteId: string) => void;
}) {
  const store = useStore();
  const { toast } = useOverlays();
  const [mode, setMode] = useState<Mode>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? store.subjects[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<NoteType>("handwritten");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pickFile(picked: File | null) {
    setFile(picked);
    setError(null);
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      toast("That file is over 15 MB", {
        kind: "danger",
        body: "Keep big decks in Drive and save a link instead.",
      });
      setFile(null);
      return;
    }
    setFileType(typeFromFile(picked));
    if (!title) {
      setTitle(picked.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (mode === "note") {
        if (!title.trim() && !body.trim()) {
          setError("A title or some notes, so future-you knows what this is.");
          setSaving(false);
          return;
        }
        const note = await store.createNote({
          type: "note",
          title: title.trim(),
          body,
          subjectId: subjectId || null,
          tags: parseTags(tags),
        });
        toast("Note saved", { kind: "success", icon: "fa-note-sticky", actionLabel: "Open", onAction: () => onCreated?.(note.id) });
        onClose();
        onCreated?.(note.id);
        return;
      }

      if (mode === "upload") {
        if (!file) {
          toast("Choose a file first", { kind: "danger" });
          setSaving(false);
          return;
        }
        const prepared = file.type.startsWith("image/")
          ? await compressImage(file)
          : { full: file, thumb: null };
        const upload = await store.uploadFile(prepared.full, file.name, prepared.thumb);
        const note = await store.createNote({
          type: fileType,
          title: title.trim() || file.name,
          body,
          subjectId: subjectId || null,
          tags: parseTags(tags),
          fileId: upload.id,
        });
        toast("Saved to your notes", {
          kind: "success",
          icon: "fa-arrow-up-from-bracket",
          actionLabel: "Open",
          onAction: () => onCreated?.(note.id),
        });
        onClose();
        onCreated?.(note.id);
        return;
      }

      if (!/^https?:\/\//i.test(url.trim())) {
        toast("Links need to start with http:// or https://", { kind: "danger" });
        setSaving(false);
        return;
      }
      const note = await store.createNote({
        type: "link",
        title: title.trim() || domainOf(url.trim()),
        body,
        url: url.trim(),
        subjectId: subjectId || null,
        tags: parseTags(tags),
      });
      toast("Link saved", { kind: "success", icon: "fa-link", actionLabel: "Open", onAction: () => onCreated?.(note.id) });
      onClose();
      onCreated?.(note.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that.");
      setSaving(false);
    }
  }

  const modes: { id: Mode; label: string; icon: string }[] = [
    { id: "note", label: "Write a note", icon: "fa-pen" },
    { id: "upload", label: "Upload a file", icon: "fa-arrow-up-from-bracket" },
    { id: "link", label: "Save a link", icon: "fa-link" },
  ];

  return (
    <Modal
      title="Add to your notes"
      subtitle="Notes, photos, slides, past papers and links — all searchable in one place."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="nm-btn nm-btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="nm-seg nm-seg--wide" role="tablist" aria-label="Item type">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={`nm-seg-btn${mode === item.id ? " is-active" : ""}`}
            onClick={() => {
              setMode(item.id);
              setError(null);
            }}
          >
            <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <>
          <Field
            label="File"
            htmlFor="ai-file"
            help="Photos of handwritten notes are compressed automatically. Files up to 15 MB are stored in your Neoma storage."
          >
            <input
              id="ai-file"
              type="file"
              className="nm-input nm-file"
              accept="image/*,.pdf,.ppt,.pptx,.doc,.docx,.txt"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          {file ? (
            <p className="nm-mono nm-help">
              {file.name} · {fmtBytes(file.size)}
            </p>
          ) : null}
          <Field label="What is it?" htmlFor="ai-type">
            <select
              id="ai-type"
              className="nm-select"
              value={fileType}
              onChange={(event) => setFileType(event.target.value as NoteType)}
            >
              {UPLOAD_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      ) : null}

      {mode === "link" ? (
        <Field label="Link" htmlFor="ai-url" required>
          <input
            id="ai-url"
            className="nm-input"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Title" htmlFor="ai-title" error={error ?? undefined}>
        <input
          id="ai-title"
          className="nm-input"
          placeholder={
            mode === "note"
              ? "e.g. Big-O cheat sheet"
              : mode === "link"
                ? "e.g. Khan Academy — Recursion"
                : "Leave blank to use the file name"
          }
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      {mode === "note" ? (
        <Field label="Your notes" htmlFor="ai-body" full>
          <textarea
            id="ai-body"
            className="nm-textarea"
            rows={8}
            placeholder="Write freely — plain text, one thought per line."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
      ) : null}

      {mode === "link" ? (
        <Field label="Why it matters" htmlFor="ai-linkbody" full>
          <textarea
            id="ai-linkbody"
            className="nm-textarea"
            rows={3}
            placeholder="Two lines so future-you remembers why you saved it."
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
      ) : null}

      <div className="nm-form-grid">
        <Field label="Subject" htmlFor="ai-folder">
          <select
            id="ai-folder"
            className="nm-select"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="">No subject</option>
            {store.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Tags"
          htmlFor="ai-tags"
          help="Comma separated. Tags are searchable and filterable."
        >
          <input
            id="ai-tags"
            className="nm-input"
            placeholder={mode === "link" ? "video" : mode === "upload" ? "exam, practice" : "exam, complexity"}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
