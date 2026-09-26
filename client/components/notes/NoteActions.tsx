"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShareToGroupModal } from "@/components/notes/ShareToGroupModal";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";

/** One overflow menu + share modal for every note surface (cards, rows, the
 * editor). The menu is positioned from the trigger's rect so it lands next to
 * whatever was clicked instead of a fixed corner. */
export function useNoteActions(
  note: Note | null,
  options: { onChange?: () => void; onDelete?: () => void } = {},
) {
  const store = useStore();
  const router = useRouter();
  const { toast, prompt, confirm } = useOverlays();
  const [menuAt, setMenuAt] = useState<{ right: number; top: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  function openMenu(event: React.MouseEvent<HTMLElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAt({
      right: Math.max(12, window.innerWidth - rect.right),
      top: Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 260)),
    });
  }

  async function rename() {
    if (!note) return;
    const name = await prompt({ title: "Rename item", label: "Title", value: note.title, confirmLabel: "Rename" });
    if (!name || !name.trim()) return;
    try {
      await store.updateNote(note.id, { title: name.trim() });
      options.onChange?.();
    } catch {
      // The store rolls back and toasts.
    }
  }

  async function remove() {
    if (!note) return;
    const ok = await confirm({
      title: `Delete “${note.title}”?`,
      message: note.groupId ? "This removes the shared note for everyone in the group." : "This removes it from your notes.",
      confirmLabel: "Delete item",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await store.deleteNote(note.id);
      toast("Deleted", { kind: "info" });
      if (options.onDelete) options.onDelete();
      else if (note.groupId) router.push(`/groups/${note.groupId}?tab=notes`);
      else options.onChange?.();
    } catch {
      // The store puts the note back and toasts.
    }
  }

  const overlays = (
    <>
      {note && menuAt ? (
        <Menu
          label="Item actions"
          onClose={() => setMenuAt(null)}
          style={{ position: "fixed", right: menuAt.right, top: menuAt.top }}
          items={[
            { label: "Open", icon: "fa-arrow-up-right-from-square", onSelect: () => router.push(`/vault/${note.id}`) },
            {
              label: note.pinned ? "Unpin" : "Pin to top",
              icon: "fa-thumbtack",
              onSelect: () => {
                void store
                  .updateNote(note.id, { pinned: !note.pinned })
                  .then(() => options.onChange?.())
                  .catch(() => {});
              },
            },
            { label: "Rename", icon: "fa-pen", onSelect: () => void rename() },
            ...(note.groupId
              ? []
              : [{ label: "Share to group", icon: "fa-share-nodes", onSelect: () => setShareOpen(true) }]),
            { separator: true },
            { label: "Delete item", icon: "fa-trash", danger: true, onSelect: () => void remove() },
          ]}
        />
      ) : null}
      {note && shareOpen ? <ShareToGroupModal note={note} onClose={() => setShareOpen(false)} /> : null}
    </>
  );

  return {
    openMenu,
    overlays,
    share: () => note && setShareOpen(true),
    remove,
  };
}
