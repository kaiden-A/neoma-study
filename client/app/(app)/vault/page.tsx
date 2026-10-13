"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { AddItemModal } from "@/components/notes/AddItemModal";
import { FolderGlyph } from "@/components/notes/FolderGlyph";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteRow } from "@/components/notes/NoteRow";
import { StudyDashboard } from "@/components/notes/StudyDashboard";
import { VaultHome } from "@/components/notes/VaultHome";
import { EmptyState } from "@/components/ui/bits";
import { Menu } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { Note } from "@/lib/types";
import { useIsPhone } from "@/lib/useMediaQuery";
import { getServerVaultView, getVaultView, setVaultView, subscribeVaultView, type VaultView } from "@/lib/vaultView";

type FilterId = "all" | "notes" | "files" | "links";

type Listing = "home" | "all" | "folder" | "unsorted";

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
  const searchParams = useSearchParams();
  const { toast, prompt } = useOverlays();
  // Home is the folder grid; ?subject= opens one folder (or the unsorted
  // bucket) and ?view=all is the flat list. A stale subject id falls home.
  const folderParam = searchParams.get("subject");
  const subjectId =
    folderParam === "unsorted"
      ? "unsorted"
      : folderParam && store.subjects.some((subject) => subject.id === folderParam)
        ? folderParam
        : null;
  const listing: Listing = subjectId === "unsorted" ? "unsorted" : subjectId ? "folder" : searchParams.get("view") === "all" ? "all" : "home";
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<Note[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [folderModal, setFolderModal] = useState<"new" | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderMenu, setFolderMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const [switcher, setSwitcher] = useState<{ left: number; top: number } | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const view = useSyncExternalStore(subscribeVaultView, getVaultView, getServerVaultView);
  const isPhone = useIsPhone();
  // Rows are the only layout that works on a phone; a grid preference saved on
  // a desktop must not turn phones into one giant card per row.
  const effectiveView: VaultView = isPhone ? "list" : view;

  const notes = store.personalNotes();
  const searchingNow = Boolean(query.trim());
  const showResults = listing === "home" && searchingNow;
  const renderHome = listing === "home" && !searchingNow;
  // The type chips only exist in the listing views; a filter left over from
  // one must not quietly narrow a home search.
  const activeFilter: FilterId = listing === "home" ? "all" : filter;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Server results (file text, group notes) replace the local list once the
    // "Search inside files" run lands; the folder/type filters still apply.
    const source = remote ?? notes;
    return source
      .filter((note) => {
        if (subjectId === null) return true;
        if (subjectId === "unsorted") return note.subjectId === null;
        return note.subjectId === subjectId;
      })
      .filter((note) => {
        if (activeFilter === "notes") return note.type === "note";
        if (activeFilter === "files") return FILE_TYPES.has(note.type);
        if (activeFilter === "links") return note.type === "link";
        return true;
      })
      .filter((note) => {
        if (remote || !needle) return true;
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
  }, [notes, remote, subjectId, activeFilter, query]);

  // The filter counts describe the open folder, not the whole vault.
  const scopedNotes = useMemo(
    () =>
      subjectId === null
        ? notes
        : notes.filter((note) =>
            subjectId === "unsorted" ? note.subjectId === null : note.subjectId === subjectId,
          ),
    [notes, subjectId],
  );

  const counts = {
    all: scopedNotes.length,
    notes: scopedNotes.filter((note) => note.type === "note").length,
    files: scopedNotes.filter((note) => FILE_TYPES.has(note.type)).length,
    links: scopedNotes.filter((note) => note.type === "link").length,
  };

  const selectedFolder = subjectId === null || subjectId === "unsorted" ? null : store.subjectById(subjectId);
  const unsortedCount = notes.filter((note) => note.subjectId === null).length;
  const folderName =
    listing === "folder" ? (selectedFolder?.name ?? "Folder") : listing === "unsorted" ? "Unsorted" : "All files";
  const filtering = searchingNow || activeFilter !== "all";
  const countIn = (id: string) => notes.filter((note) => note.subjectId === id).length;

  function openNote(note: Note) {
    router.push(`/vault/${note.id}`);
  }

  async function searchInsideFiles() {
    const needle = query.trim();
    if (!needle) return;
    setSearching(true);
    try {
      setRemote(await store.searchNotes(needle));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not search files.", { kind: "danger" });
    }
    setSearching(false);
  }

  async function createFolder() {
    if (!folderDraft.trim()) return;
    await store.createSubject(folderDraft.trim());
    setFolderDraft("");
    setFolderModal(null);
    toast("Folder created", { kind: "success" });
  }

  async function renameFolder(id: string, current: string) {
    const name = await prompt({ title: "Rename folder", label: "Name", value: current, confirmLabel: "Rename" });
    if (name && name.trim()) await store.updateSubject(id, { name: name.trim() });
  }

  async function removeFolder() {
    if (!deleteFolder) return;
    await store.deleteSubject(deleteFolder, moveTo || null);
    if (subjectId === deleteFolder) router.replace("/vault");
    setDeleteFolder(null);
    setMoveTo("");
    toast("Folder deleted", { kind: "info" });
  }

  function openFolderMenu(id: string, event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setFolderMenu({
      id,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 200)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 200),
    });
  }

  function openSwitcher(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setSwitcher({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 240)),
      top: Math.min(rect.bottom + 6, window.innerHeight - 320),
    });
  }

  const switcherItems = [
    ...store.subjects.map((subject) => ({
      label: subject.name,
      dot: subject.color,
      hint: String(countIn(subject.id)),
      current: subjectId === subject.id,
      onSelect: () => router.push(`/vault?subject=${subject.id}`),
    })),
    {
      label: "Unsorted",
      icon: "fa-inbox",
      hint: String(unsortedCount),
      current: subjectId === "unsorted",
      onSelect: () => router.push("/vault?subject=unsorted"),
    },
    { separator: true },
    {
      label: "All files",
      icon: "fa-layer-group",
      current: listing === "all",
      onSelect: () => router.push("/vault?view=all"),
    },
    { separator: true },
    { label: "New folder", icon: "fa-plus", onSelect: () => setFolderModal("new") },
  ];

  return (
    <div className="nm-page nm-page--vault">
      <div className="nm-page-head">
        <div className="nm-head-top">
          {renderHome || showResults ? (
            <span className="nm-eyebrow">
              Notes · <span className="nm-mono">{notes.length} items</span>
            </span>
          ) : (
            <nav className="nm-eyebrow" aria-label="Breadcrumb">
              <Link className="nm-link" href="/vault">
                Notes
              </Link>
              <span aria-hidden="true"> / </span>
              <button
                type="button"
                className="nm-crumb-btn"
                aria-haspopup="menu"
                aria-expanded={switcher !== null}
                title="Switch folder"
                onClick={openSwitcher}
              >
                {folderName}
                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Your study notes
          </h1>
          <div className="nm-head-actions">
            <button type="button" className="nm-btn nm-btn--secondary" onClick={() => setDashboard(true)}>
              <i className="fa-solid fa-chart-simple" aria-hidden="true" />
              Dashboard
            </button>
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

      <div className="nm-vault-main">
        <div className="nm-vault-toolbar">
          <div className="nm-search">
            <i className="fa-solid fa-magnifying-glass nm-search-icon" aria-hidden="true" />
            <input
              className="nm-input nm-search-input"
              placeholder={renderHome ? "Search everything…" : "Search titles, notes and tags…"}
              aria-label="Search notes"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRemote(null);
              }}
            />
            {query ? (
              <button
                type="button"
                className="nm-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setRemote(null);
                }}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {searchingNow ? (
            remote === null ? (
              <button
                type="button"
                className="nm-btn nm-btn--secondary nm-btn--sm"
                disabled={searching}
                onClick={() => void searchInsideFiles()}
              >
                <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
                {searching ? "Searching…" : "Search inside files"}
              </button>
            ) : (
              <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={() => setRemote(null)}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
                File results · clear
              </button>
            )
          ) : null}
          {renderHome ? null : (
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
          )}
        </div>

        {listing === "home" ? null : (
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
        )}

        {renderHome ? (
          <VaultHome
            notes={notes}
            onOpenNote={openNote}
            onNewFolder={() => setFolderModal("new")}
            onSubjectMenu={openFolderMenu}
            onAdd={() => setAdding(true)}
          />
        ) : (
          <>
            <div className="nm-vault-head">
              <h2 className="nm-section-title">
                {showResults ? (
                  <>Results for “{query.trim()}”</>
                ) : (
                  <>
                    {listing === "folder" && selectedFolder ? (
                      <span className={`nm-vault-folder-glyph nm-mk-${selectedFolder.color}`}>
                        <FolderGlyph />
                      </span>
                    ) : listing === "unsorted" ? (
                      <i className="fa-solid fa-inbox" aria-hidden="true" />
                    ) : (
                      <i className="fa-solid fa-layer-group" aria-hidden="true" />
                    )}
                    {folderName}
                  </>
                )}
              </h2>
              <span className="nm-mono nm-meta">
                {visible.length} item{visible.length === 1 ? "" : "s"}
              </span>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={searchingNow ? "fa-magnifying-glass" : listing === "unsorted" ? "fa-inbox" : "fa-note-sticky"}
                title={
                  searchingNow
                    ? `No matches for “${query.trim()}”`
                    : listing === "folder"
                      ? `Nothing in ${folderName} yet`
                      : listing === "unsorted"
                        ? "Nothing unsorted"
                        : activeFilter !== "all"
                          ? `No ${FILTERS.find((item) => item.id === activeFilter)?.label.toLowerCase()} here yet`
                          : "No notes here yet"
                }
                body={
                  searchingNow || activeFilter !== "all"
                    ? "Try a tag, a folder name, or a word from the notes."
                    : listing === "unsorted"
                      ? "Anything you add without picking a folder lands here."
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
                        setRemote(null);
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
            ) : showResults ? (
              <div className="nm-notelist">
                {visible.map((note) => (
                  <NoteRow key={note.id} note={note} onOpen={openNote} />
                ))}
              </div>
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
          </>
        )}
      </div>

      {adding ? (
        <AddItemModal
          defaultSubjectId={listing === "folder" && subjectId ? subjectId : listing === "unsorted" ? null : undefined}
          onClose={() => setAdding(false)}
          onCreated={(id) => router.push(`/vault/${id}`)}
        />
      ) : null}

      {dashboard ? <StudyDashboard onClose={() => setDashboard(false)} /> : null}

      {folderModal === "new" ? (
        <Modal
          title="New folder"
          size="sm"
          onClose={() => setFolderModal(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setFolderModal(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--primary" onClick={() => void createFolder()}>
                Create folder
              </button>
            </>
          }
        >
          <label className="nm-label" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            className="nm-input"
            placeholder="e.g. Thermodynamics"
            value={folderDraft}
            onChange={(event) => setFolderDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createFolder();
            }}
          />
        </Modal>
      ) : null}

      {folderMenu ? (
        <Menu
          label="Folder options"
          onClose={() => setFolderMenu(null)}
          style={{ position: "fixed", left: folderMenu.left, top: folderMenu.top }}
          items={[
            {
              label: "Rename",
              icon: "fa-pen",
              onSelect: () => {
                const subject = store.subjectById(folderMenu.id);
                if (subject) void renameFolder(subject.id, subject.name);
              },
            },
            { label: "Delete", icon: "fa-trash", danger: true, onSelect: () => setDeleteFolder(folderMenu.id) },
          ]}
        />
      ) : null}

      {switcher ? (
        <Menu
          label="Switch folder"
          onClose={() => setSwitcher(null)}
          style={{ position: "fixed", left: switcher.left, top: switcher.top }}
          items={switcherItems}
        />
      ) : null}

      {deleteFolder ? (
        <Modal
          title={`Delete “${store.subjectById(deleteFolder)?.name ?? "folder"}”?`}
          size="sm"
          onClose={() => setDeleteFolder(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setDeleteFolder(null)}>
                Cancel
              </button>
              <button type="button" className="nm-btn nm-btn--danger" onClick={() => void removeFolder()}>
                Delete folder
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
            <option value="">No folder</option>
            {store.subjects
              .filter((subject) => subject.id !== deleteFolder)
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
