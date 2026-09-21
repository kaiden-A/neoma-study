"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** Shared by the note editor and the notes grid. Copies the note into a group;
 * a file attachment is copied too when the note has one. */
export function ShareToGroupModal({ note, onClose }: { note: Note; onClose: () => void }) {
  const store = useStore();
  const router = useRouter();
  const { toast } = useOverlays();
  const [groupId, setGroupId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [includeFile, setIncludeFile] = useState(true);
  const [sharing, setSharing] = useState(false);

  const group = groupId ? store.groupById(groupId) : null;
  const groups = store.groups;

  async function share() {
    if (!groupId || sharing) return;
    setSharing(true);
    try {
      await store.shareNote(note.id, groupId, topicId || null, includeFile);
      onClose();
      toast(`Shared to ${store.groupById(groupId)?.name ?? "the group"}`, {
        kind: "success",
        icon: "fa-share-nodes",
        actionLabel: "View",
        onAction: () => router.push(`/groups/${groupId}?tab=notes`),
      });
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not share that.", { kind: "danger" });
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal
      title="Share to a group"
      subtitle="This copies the note into the group’s shared notes. Your copy stays yours."
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="nm-spacer" />
          <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nm-btn nm-btn--primary"
            onClick={() => void share()}
            disabled={!groupId || sharing}
          >
            {sharing ? "Sharing…" : "Share"}
          </button>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="nm-help">No groups to share with yet. Create a group first, then share notes into it.</p>
      ) : (
        <>
          <div className="nm-field">
            <label className="nm-label" htmlFor="share-group">
              Group
            </label>
            <select
              id="share-group"
              className="nm-select"
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value);
                setTopicId("");
              }}
            >
              <option value="">Pick a group…</option>
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.kind === "study" ? " · study group" : ""}
                </option>
              ))}
            </select>
          </div>
          {group && group.topics.length ? (
            <div className="nm-field">
              <label className="nm-label" htmlFor="share-topic">
                {group.kind === "study" ? "Subject" : "Topic"}
              </label>
              <select
                id="share-topic"
                className="nm-select"
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
              >
                <option value="">General</option>
                {group.topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {note.fileId ? (
            <label className="nm-toggle">
              <input
                type="checkbox"
                checked={includeFile}
                onChange={(event) => setIncludeFile(event.target.checked)}
              />
              <span className="nm-toggle-bd">
                <span className="nm-toggle-label">Copy the attached file too</span>
                <span className="nm-toggle-help">
                  Group members get their own preview; deleting either copy leaves the other alone.
                </span>
              </span>
            </label>
          ) : null}
        </>
      )}
    </Modal>
  );
}
