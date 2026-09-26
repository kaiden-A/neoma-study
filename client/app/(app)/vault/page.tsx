"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { AddItemModal } from "@/components/notes/AddItemModal";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteRow } from "@/components/notes/NoteRow";
import { EmptyState } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { Menu } from "@/components/ui/Menu";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { useIsPhone } from "@/lib/useMediaQuery";
import { getServerVaultView, getVaultView, setVaultView, subscribeVaultView, type VaultView } from "@/lib/vaultView";

type FilterId = "all" | "notes" | "files" | "links";

const FILTERS: { id: FilterId; label: string; icon: string; marker?: string }[] = [
  { id: "all", label: "Everything", icon: "fa-layer-group" },
  { id: "notes", label: "Notes", icon: "fa-note-sticky", marker: "amber" },
  { id: "files", label: "Files", icon: "fa-paperclip", marker: "sky" },
  { id: "links", label: "Links", icon: "fa-link", marker: "mint" },
];

const FILE_TYPES = new Set(["handwritten", "slides", "paper"]);

export default function VaultPage() {
  const store = useStore();
  const router = useRouter();
  const { toast, prompt } = useOverlays();
  const [subjectId, setSubjectId] = useState<string>("all");
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [subjectModal, setSubjectModal] = useState<"new" | null>(null);
  const [subjectName, setSubjectName] = useState("");
  const [subjectMenu, setSubjectMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const view = useSyncExternalStore(subscribeVaultView, getVaultView, getServerVaultView);
  const isPhone = useIsPhone();
  // Rows are the only layout that works on a phone; a grid preference saved on
  // a desktop must not turn phones into one giant card per row.
  const effectiveView: VaultView = isPhone ? "list" : view;

  const notes = store.personalNotes();
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return notes
      .filter((note) => (subjectId === "all" ? true : note.subjectId === subjectId))
      .filter((note) => {
        if (filter === "notes") return note.type === "note";
        if (filter === "files") return FILE_TYPES.has(note.type);
        if (filter === "links") return note.type === "link";
        return true;
      })
      .filter((note) => {
        if (!needle) return true;
        return (
          note.title.toLowerCase().includes(needle) ||
          note.body.toLowerCase().includes(needle) ||
          note.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notes, subjectId, filter, query]);

  const counts = {
    all: notes.length,
    notes: notes.filter((note) => note.type === "note").length,
    files: notes.filter((note) => FILE_TYPES.has(note.type)).length,
    links: notes.filter((note) => note.type === "link").length,
  };

  const selectedSubject = subjectId === "all" ? null : store.subjectById(subjectId);
  const filtering = Boolean(query.trim()) || filter !== "all";

  function openNote(note: Note) {
    router.push(`/vault/${note.id}`);
  }

  async function createSubject() {
    if (!subjectName.trim()) return;
    await store.createSubject(subjectName.trim());
    setSubjectName("");
    setSubjectModal(null);
    toast("Subject created", { kind: "success" });
  }

  async function renameSubject(id: string, current: string) {
    const name = await prompt({ title: "Rename subject", label: "Name", value: current, confirmLabel: "Rename" });
    if (name && name.trim()) await store.updateSubject(id, { name: name.trim() });
  }

  async function removeSubject() {
    if (!deleteSubject) return;
    await store.deleteSubject(deleteSubject, moveTo || null);
    if (subjectId === deleteSubject) setSubjectId("all");
    setDeleteSubject(null);
    setMoveTo("");
    toast("Subject deleted", { kind: "info" });
  }

  return (
    <div className="nm-page nm-page--vault">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Notes · <span className="nm-mono">{notes.length} items</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Your study notes
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--primary" onClick={() => setAdding(true)}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              Add
            </button>
          </div>
        </div>
        <p className="nm-meta nm-vault-tagline">
          Typed notes, photos of your handwriting, slide decks, past papers and links — all searchable, all yours.
        </p>
      </div>

      <div className="nm-vault-layout">
        <aside className="nm-vault-side">
          <nav className="nm-vault-nav" aria-label="Subjects">
            <button
              type="button"
              className={`nm-folders${subjectId === "all" ? " is-active" : ""}`}
              onClick={() => setSubjectId("all")}
            >
              <i className="fa-solid fa-layer-group" aria-hidden="true" />
              <span>All notes</span>
              <span className="nm-mono nm-folder-count">{notes.length}</span>
            </button>
            {store.subjects.map((subject) => {
              const count = notes.filter((note) => note.subjectId === subject.id).length;
              return (
                <div className={`nm-folderrow${subjectId === subject.id ? " is-active" : ""}`} key={subject.id}>
                  <button
                    type="button"
                    className={`nm-folders${subjectId === subject.id ? " is-active" : ""}`}
                    title={subject.name}
                    onClick={() => setSubjectId(subject.id)}
                  >
                    <span className={`nm-dot nm-mk-${subject.color}`} />
                    <span>{subject.name}</span>
                    <span className="nm-mono nm-folder-count">{count}</span>
                  </button>
                  <button
                    type="button"
                    className="nm-iconbtn nm-iconbtn--sm"
                    aria-label="Subject options"
                    title="Subject options"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setSubjectMenu({
                        id: subject.id,
                        left: Math.max(12, Math.min(rect.left, window.innerWidth - 200)),
                        top: Math.min(rect.bottom + 6, window.innerHeight - 200),
                      });
                    }}
                  >
                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            <button type="button" className="nm-folders nm-folders--add" onClick={() => setSubjectModal("new")}>
              <i className="fa-solid fa-plus" aria-hidden="true" />
              <span>New subject</span>
            </button>
          </nav>
        </aside>

        <div className="nm-vault-main">
          <div className="nm-vault-toolbar">
            <div className="nm-search">
              <i className="fa-solid fa-magnifying-glass nm-search-icon" aria-hidden="true" />
              <input
                className="nm-input nm-search-input"
                placeholder="Search titles, notes and tags…"
                aria-label="Search notes"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" className="nm-search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="nm-viewtoggle" role="group" aria-label="Layout">
              {(["list", "grid"] as VaultView[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`nm-viewtoggle-btn${view === item ? " is-active" : ""}`}
                  aria-pressed={view === item}
                  aria-label={item === "list" ? "List view" : "Grid view"}
                  title={item === "list" ? "List view" : "Grid view"}
                  onClick={() => setVaultView(item)}
                >
                  <i className={`fa-solid ${item === "list" ? "fa-list" : "fa-table-cells-large"}`} aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>

          <div className="nm-seg nm-vault-filters" role="tablist" aria-label="Filter notes">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={`nm-seg-btn${filter === item.id ? " is-active" : ""}`}
                onClick={() => setFilter(item.id)}
              >
                <i className={`fa-solid ${item.icon}${item.marker ? ` nm-filter-icon nm-mk-${item.marker}` : ""}`} aria-hidden="true" />
                {item.label}
                <span className="nm-mono nm-filter-count">{counts[item.id]}</span>
              </button>
            ))}
          </div>

          <div className="nm-vault-head">
            <h2 className="nm-section-title">{selectedSubject?.name ?? "All notes"}</h2>
            <span className="nm-mono nm-meta">
              {visible.length} item{visible.length === 1 ? "" : "s"}
            </span>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={query ? "fa-magnifying-glass" : "fa-note-sticky"}
              title={
                query
                  ? `No matches for “${query}”`
                  : selectedSubject
                    ? `Nothing in ${selectedSubject.name} yet`
                    : filter !== "all"
                      ? `No ${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} here yet`
                      : "No notes here yet"
              }
              body={
                query || filter !== "all"
                  ? "Try a tag, a subject name, or a word from the notes."
                  : "Write a note, photograph your handwriting, or drop in a slide deck or past paper."
              }
              action={
                filtering ? (
                  <button
                    type="button"
                    className="nm-btn nm-btn--secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear search and filters
                  </button>
                ) : (
                  <button type="button" className="nm-btn nm-btn--primary" onClick={() => setAdding(true)}>
                    Add something
                  </button>
                )
              }
            />
          ) : effectiveView === "grid" ? (
            <div className="nm-notegrid">
              {visible.map((note) => (
                <NoteCard key={note.id} note={note} onOpen={openNote} />
              ))}
            </div>
          ) : (
            <div className="nm-notelist">
              {visible.map((note) => (
                <NoteRow key={note.id} note={note} onOpen={openNote} />
              ))}
            </div>
          )}
        </div>
      </div>

      {adding ? (
        <AddItemModal
          defaultSubjectId={subjectId === "all" ? null : subjectId}
          onClose={() => setAdding(false)}
          onCreated={(id) => router.push(`/vault/${id}`)}
        />
      ) : null}

      {subjectModal === "new" ? (
        <Modal
          title="New subject"
          size="sm"
          onClose={() => setSubjectModal(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setSubjectModal(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void createSubject()}>
                Create subject
              </button>
            </>
          }
        >
          <label className="nm-label" htmlFor="subject-name">
            Subject name
          </label>
          <input
            id="subject-name"
            className="nm-input"
            placeholder="e.g. Thermodynamics"
            value={subjectName}
            onChange={(event) => setSubjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createSubject();
            }}
          />
        </Modal>
      ) : null}

      {subjectMenu ? (
        <Menu
          label="Subject options"
          onClose={() => setSubjectMenu(null)}
          style={{ position: "fixed", left: subjectMenu.left, top: subjectMenu.top }}
          items={[
            {
              label: "Rename",
              icon: "fa-pen",
              onSelect: () => {
                const subject = store.subjectById(subjectMenu.id);
                if (subject) void renameSubject(subject.id, subject.name);
              },
            },
            { label: "Delete", icon: "fa-trash", danger: true, onSelect: () => setDeleteSubject(subjectMenu.id) },
          ]}
        />
      ) : null}

      {deleteSubject ? (
        <Modal
          title={`Delete “${store.subjectById(deleteSubject)?.name ?? "subject"}”?`}
          size="sm"
          onClose={() => setDeleteSubject(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setDeleteSubject(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--danger" onClick={() => void removeSubject()}>
                Delete subject
              </button>
            </>
          }
        >
          <p className="nm-body-text mb-3">Items inside are kept. Choose where they should go:</p>
          <label className="nm-label" htmlFor="move-to">
            Move items to
          </label>
          <select
            id="move-to"
            className="nm-select"
            value={moveTo}
            onChange={(event) => setMoveTo(event.target.value)}
          >
            <option value="">No subject</option>
            {store.subjects
              .filter((subject) => subject.id !== deleteSubject)
              .map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
          </select>
        </Modal>
      ) : null}
    </div>
  );
}
