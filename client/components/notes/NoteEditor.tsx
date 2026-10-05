"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { FilePreview } from "@/components/notes/FilePreview";
import { LinkPreview } from "@/components/notes/LinkPreview";
import { useNoteActions } from "@/components/notes/NoteActions";
import { NoteDetailsSheet } from "@/components/notes/NoteDetailsSheet";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/notes/RichTextEditor";
import { StudyTimer } from "@/components/notes/StudyTimer";
import { EmptyState, MarkerChip } from "@/components/ui/bits";
import { Field } from "@/components/ui/bits";
import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { stripMarkdown } from "@/lib/markdown";
import { parseTags } from "@/lib/files";
import { parseVideoUrl, videoThumbUrl } from "@/lib/links";
import { noteType } from "@/lib/markers";
import { formatClock, parsePageMarks, parseTimeMarks } from "@/lib/study";
import { useStore } from "@/lib/store";
import {
  getServerStudyView,
  getStudyView,
  nextStudyMode,
  setStudyMode,
  setStudyRatio,
  subscribeStudyView,
  type StudyMode,
} from "@/lib/studyView";
import type { NoteStudy, StudyHighlight, StudyPosition } from "@/lib/types";
import { useIsPhone, useMediaQuery } from "@/lib/useMediaQuery";
import { useNow } from "@/lib/useNow";

interface Baseline {
  title: string;
  body: string;
  tags: string[];
  subjectId: string | null;
}

// Draft against the saved body with cosmetic whitespace differences ignored,
// so a markdown round-trip through the editor never shows a phantom dirty dot.
function comparable(value: string): string {
  return value
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const STUDY_MODES: { id: StudyMode; label: string; icon: string }[] = [
  { id: "material", label: "Material", icon: "fa-book-open-reader" },
  { id: "split", label: "Split", icon: "fa-table-columns" },
  { id: "write", label: "Notes", icon: "fa-pen" },
];

export function NoteEditor({ noteId }: { noteId: string }) {
  const store = useStore();
  const router = useRouter();
  const note = store.noteById(noteId);

  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tags, setTags] = useState((note?.tags ?? []).join(", "));
  const [subjectId, setSubjectId] = useState<string | null>(note?.subjectId ?? null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [mobileTab, setMobileTab] = useState<"material" | "notes">("material");
  const [mobilePage, setMobilePage] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [pdfSeek, setPdfSeek] = useState<{ page: number; nonce: number } | null>(null);
  const [videoSeek, setVideoSeek] = useState<{ seconds: number; nonce: number } | null>(null);
  const [cardModal, setCardModal] = useState<{
    front: string;
    back: string;
    sourceHighlightId: string | null;
  } | null>(null);
  const loaded = useRef(false);
  const studyRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const videoTimeRef = useRef(0);
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekCounter = useRef(0);

  const { toast } = useOverlays();
  const now = useNow(30_000);

  const study = useSyncExternalStore(subscribeStudyView, getStudyView, getServerStudyView);
  const isFocus = useMediaQuery("(min-width: 1081px)");
  const isPhone = useIsPhone();

  useEffect(() => {
    if (!note || loaded.current) return;
    loaded.current = true;
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
    setSubjectId(note.subjectId);
    setBaseline({ title: note.title, body: note.body, tags: note.tags, subjectId: note.subjectId });
  }, [note]);

  useEffect(() => {
    let active = true;
    if (!note?.fileId) return;
    store
      .fileUrl(note.fileId)
      .then((url) => {
        if (active) setFileUrl(url);
      })
      .catch(() => {
        if (active) setFileMissing(true);
      });
    return () => {
      active = false;
    };
  }, [note?.fileId, store]);

  // Presigned URLs live for 10 minutes; Office previews need a fresh one when
  // the viewer has been open a while.
  const reloadFileUrl = useCallback(async () => {
    if (!note?.fileId) return;
    try {
      setFileUrl(await store.fileUrl(note.fileId));
      setFileMissing(false);
    } catch {
      setFileMissing(true);
    }
  }, [note, store]);

  const saveStudy = useCallback(
    (patch: Partial<NoteStudy>) => {
      if (!note) return;
      void store.updateNote(note.id, { study: { ...note.study, ...patch } }).catch(() => {});
    },
    [note, store],
  );

  const handleVideoTime = useCallback((seconds: number) => {
    videoTimeRef.current = seconds;
  }, []);

  useEffect(() => {
    return () => {
      if (positionTimer.current) clearTimeout(positionTimer.current);
    };
  }, []);

  const parsedTags = parseTags(tags);
  const dirty = Boolean(
    baseline &&
      (title !== baseline.title ||
        comparable(body) !== comparable(baseline.body) ||
        subjectId !== baseline.subjectId ||
        parsedTags.join("\u0000") !== baseline.tags.join("\u0000")),
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!note) return false;
    const nextTitle = title.trim() || "Untitled";
    const nextTags = parseTags(tags);
    setSaveState("saving");
    try {
      await store.updateNote(note.id, { title: nextTitle, body, tags: nextTags, subjectId });
      setTitle(nextTitle);
      setBaseline({ title: nextTitle, body, tags: nextTags, subjectId });
      setSaveState("saved");
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      setTimeout(() => {
        setSaveState("idle");
        setSavedAt(null);
      }, 2500);
      return true;
    } catch {
      // The store rolls the note back and says what went wrong.
      setSaveState("idle");
      return false;
    }
  }, [body, note, setBaseline, setSaveState, setSavedAt, setTitle, store, subjectId, tags, title]);

  // Ctrl/Cmd+S saves without reaching for the button.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) void save();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  // Focus view keys: Ctrl/Cmd+\ cycles material → split → write, Esc leaves
  // the full-width material pane.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        setStudyMode(nextStudyMode(getStudyView().mode));
      } else if (event.key === "Escape" && getStudyView().mode === "material") {
        setStudyMode("split");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Leaving the page with unsaved edits: in-app links go through the guard
  // dialog, refresh/close through the browser's own prompt.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      // Capture phase: Next's Link never sees the click, so it cannot navigate.
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(`${url.pathname}${url.search}`);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const actions = useNoteActions(note, {
    onDelete: () => router.push(note?.groupId ? `/groups/${note.groupId}?tab=notes` : "/vault"),
  });

  if (!note) {
    return (
      <div className="nm-page">
        <EmptyState
          icon="fa-circle-question"
          title={store.ready ? "That item is gone" : "Loading…"}
          body={store.ready ? "It may have been deleted from your notes." : undefined}
          action={
            store.ready ? (
              <Link className="nm-btn nm-btn--secondary" href="/vault">
                Back to notes
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const type = noteType(note.type);
  const group = note.groupId ? store.groupById(note.groupId) : null;
  const subject = subjectId ? store.subjectById(subjectId) : null;
  const isFile = Boolean(note.fileId);
  const plainBody = stripMarkdown(body).trim();
  const words = plainBody ? plainBody.split(/\s+/).length : 0;
  const hasMaterial = Boolean((note.type === "link" && note.url) || note.fileId);
  const isPdf = note.fileType === "application/pdf";
  const video = note.type === "link" ? parseVideoUrl(note.url) : null;
  const canStamp = video?.provider === "youtube";
  const activeTab: "material" | "notes" = hasMaterial ? mobileTab : "notes";
  const timeMarks = video ? parseTimeMarks(body) : [];
  const pageMarks = isPdf ? parsePageMarks(body) : [];
  const cards = store.cardsForNote(note.id);

  const saveLabel = saveState === "saving" ? "Saving…" : "Save changes";

  const switchTab = (tab: "material" | "notes") => {
    setMobileTab(tab);
    if (tab === "notes" && isPdf) {
      setMobilePage(note.study.position.page);
    }
  };

  const handlePosition = (position: StudyPosition) => {
    const current = note.study.position;
    if (position.page !== current.page) {
      saveStudy({ position: { page: position.page, scroll: 0 } });
      return;
    }
    if (Math.abs(position.scroll - current.scroll) < 2) return;
    if (positionTimer.current) clearTimeout(positionTimer.current);
    positionTimer.current = setTimeout(() => {
      saveStudy({ position: { page: position.page, scroll: Math.round(position.scroll) } });
    }, 900);
  };

  const addHighlight = (highlight: StudyHighlight) => {
    saveStudy({ highlights: [...note.study.highlights, highlight] });
  };

  const removeHighlight = (id: string) => {
    saveStudy({ highlights: note.study.highlights.filter((item) => item.id !== id) });
  };

  const copyExcerpt = (highlight: StudyHighlight) => {
    editorRef.current?.insertMarkdown(`\n\n> ${highlight.quote}\n>\n> [p. ${highlight.page}]\n\n`);
  };

  const jumpToPage = (page: number) => {
    seekCounter.current += 1;
    setPdfSeek({ page, nonce: seekCounter.current });
    if (isPhone) setMobileTab("material");
  };

  const seekVideo = (seconds: number) => {
    seekCounter.current += 1;
    setVideoSeek({ seconds, nonce: seekCounter.current });
    saveStudy({ timestamps: [seconds] });
    if (isPhone) setMobileTab("material");
  };

  const stampTime = () => {
    const stamp = `[${formatClock(Math.max(0, Math.floor(videoTimeRef.current)))}]`;
    editorRef.current?.insertMarkdown(stamp);
  };

  const openCardModal = (front = "", sourceHighlightId: string | null = null) => {
    setCardModal({ front, back: "", sourceHighlightId });
  };

  const saveCard = async () => {
    if (!cardModal || !cardModal.front.trim()) return;
    try {
      await store.createCard({
        noteId: note.id,
        front: cardModal.front.trim(),
        back: cardModal.back.trim(),
        sourceHighlightId: cardModal.sourceHighlightId,
      });
      setCardModal(null);
      toast("Card added", { kind: "success", icon: "fa-clone" });
    } catch {
      // The store's toast already said what happened.
    }
  };

  function startDividerDrag(event: React.PointerEvent<HTMLDivElement>) {
    const container = studyRef.current;
    if (!container) return;
    event.preventDefault();
    const startX = event.clientX;
    const startRatio = study.ratio;
    const width = container.getBoundingClientRect().width;
    if (width <= 0) return;
    setDragging(true);
    const onMove = (moveEvent: PointerEvent) => {
      setStudyRatio(startRatio + (moveEvent.clientX - startX) / width);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const chipsRow = (showDetails: boolean) => (
    <div className="nm-note-chips">
      <span className={`nm-chip nm-chip--sm nm-chip--mark nm-mk-${type.marker}`}>
        <i className={`fa-solid ${type.icon}`} aria-hidden="true" />
        {type.label}
      </span>
      {group ? (
        <span className={`nm-chip nm-chip--sm nm-chip--link nm-mk-${group.color}`} title={group.name}>
          <span className="nm-dot" />
          <span className="nm-chip-name">{group.name}</span>
        </span>
      ) : subject ? (
        <MarkerChip name={subject.name} markerKey={subject.color} small />
      ) : null}
      {note.pinned ? (
        <span className="nm-chip nm-chip--sm nm-chip--muted" title="Pinned">
          <i className="fa-solid fa-thumbtack" aria-hidden="true" />
          Pinned
        </span>
      ) : null}
      <StudyTimer note={note} />
      {showDetails ? (
        <button
          type="button"
          className="nm-btn nm-btn--ghost nm-btn--sm nm-study-details"
          onClick={() => setDetailsOpen(true)}
        >
          <i className="fa-solid fa-sliders" aria-hidden="true" />
          Details
        </button>
      ) : null}
    </div>
  );

  const titleInput = (
    <input
      className="nm-note-titleinput"
      aria-label="Title"
      value={title}
      onChange={(event) => setTitle(event.target.value)}
    />
  );

  const materialBody = (
    <>
      {note.type === "link" && note.url ? (
        <LinkPreview
          note={note}
          initialSeconds={note.study.timestamps.at(-1) ?? null}
          seek={videoSeek}
          onTimeUpdate={handleVideoTime}
        />
      ) : null}
      {isFile ? (
        <FilePreview
          note={note}
          url={fileUrl}
          failed={fileMissing}
          loading={!fileUrl && !fileMissing}
          onReload={reloadFileUrl}
          position={note.study.position}
          highlights={note.study.highlights}
          onPositionChange={handlePosition}
          onHighlight={addHighlight}
          seekPage={pdfSeek}
        />
      ) : null}
    </>
  );

  const marksRow =
    timeMarks.length || pageMarks.length ? (
      <div className="nm-note-marks">
        {timeMarks.map((mark) => (
          <button
            key={`t-${mark.label}`}
            type="button"
            className="nm-chip nm-chip--sm nm-chip--link"
            title={`Play from ${mark.label}`}
            onClick={() => seekVideo(mark.seconds)}
          >
            <i className="fa-solid fa-play" aria-hidden="true" />
            {mark.label}
          </button>
        ))}
        {pageMarks.map((mark) => (
          <button
            key={`p-${mark.page}`}
            type="button"
            className="nm-chip nm-chip--sm nm-chip--link"
            title={`Jump to page ${mark.page}`}
            onClick={() => jumpToPage(mark.page)}
          >
            <i className="fa-solid fa-file-pdf" aria-hidden="true" />
            p. {mark.page}
          </button>
        ))}
      </div>
    ) : null;

  const excerptsCard =
    note.study.highlights.length > 0 ? (
      <div className="nm-excerpts">
        <div className="nm-card-hd">
          <h3 className="nm-card-title">Excerpts</h3>
          <span className="nm-mono nm-meta">{note.study.highlights.length}</span>
        </div>
        <ul className="nm-excerpts-list">
          {note.study.highlights.map((highlight) => (
            <li key={highlight.id} className="nm-excerpt">
              <p className="nm-excerpt-quote">{highlight.quote}</p>
              <div className="nm-excerpt-actions">
                {isPdf ? (
                  <button
                    type="button"
                    className="nm-btn nm-btn--ghost nm-btn--sm"
                    onClick={() => jumpToPage(highlight.page)}
                  >
                    <i className="fa-solid fa-file-pdf" aria-hidden="true" />
                    page {highlight.page}
                  </button>
                ) : (
                  <span className="nm-mono nm-meta">page {highlight.page}</span>
                )}
                <button
                  type="button"
                  className="nm-btn nm-btn--ghost nm-btn--sm"
                  onClick={() => copyExcerpt(highlight)}
                >
                  <i className="fa-solid fa-note-sticky" aria-hidden="true" />
                  Copy into note
                </button>
                <button
                  type="button"
                  className="nm-btn nm-btn--ghost nm-btn--sm"
                  onClick={() => openCardModal(highlight.quote.slice(0, 1000), highlight.id)}
                >
                  <i className="fa-solid fa-clone" aria-hidden="true" />
                  Make card
                </button>
                <button
                  type="button"
                  className="nm-iconbtn nm-iconbtn--sm ml-auto"
                  aria-label="Remove excerpt"
                  onClick={() => removeHighlight(highlight.id)}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const cardsCard = (
    <div className="nm-excerpts">
      <div className="nm-card-hd">
        <h3 className="nm-card-title">Flashcards</h3>
        <span className="nm-mono nm-meta">{cards.length}</span>
        <button
          type="button"
          className="nm-btn nm-btn--ghost nm-btn--sm nm-study-details"
          onClick={() => openCardModal()}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
          Add card
        </button>
      </div>
      {cards.length ? (
        <ul className="nm-excerpts-list">
          {cards.map((card) => (
            <li key={card.id} className="nm-excerpt">
              <p className="nm-excerpt-quote">{card.front}</p>
              {card.back ? <p className="nm-meta">{card.back}</p> : null}
              <div className="nm-excerpt-actions">
                <span className="nm-mono nm-meta">
                  {card.suspended ? "Suspended" : card.dueAt <= now ? "Due now" : `Due ${fmtRelative(card.dueAt)}`}
                </span>
                <button
                  type="button"
                  className="nm-btn nm-btn--ghost nm-btn--sm"
                  onClick={() => void store.updateCard(card.id, { suspended: !card.suspended }).catch(() => {})}
                >
                  {card.suspended ? "Resume" : "Suspend"}
                </button>
                <button
                  type="button"
                  className="nm-iconbtn nm-iconbtn--sm ml-auto"
                  aria-label="Delete card"
                  onClick={() => void store.deleteCard(card.id).catch(() => {})}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nm-help">
          Cards made from this note are reviewed on the Review page. Select text in a PDF to make one from an
          excerpt.
        </p>
      )}
    </div>
  );

  const writerBody = (
    <div className="nm-writer">
      <div className="nm-writer-head">
        <label className="nm-label" htmlFor="note-body">
          {isFile ? "Your notes on this file" : "Notes"}
        </label>
        {canStamp ? (
          <button type="button" className="nm-btn nm-btn--ghost nm-btn--sm" onClick={stampTime}>
            <i className="fa-solid fa-stopwatch" aria-hidden="true" />
            Stamp current time
          </button>
        ) : null}
        <div className="nm-spacer" />
        <span className="nm-mono nm-writer-count">
          {words} word{words === 1 ? "" : "s"}
        </span>
      </div>
      {marksRow}
      <RichTextEditor
        key={note.id}
        ref={editorRef}
        initialMarkdown={note.body}
        placeholder="Write it out in your own words… Type / for headings, lists, tables and more."
        onChange={setBody}
      />
      <p className="nm-help nm-writer-help">
        Type <span className="nm-mono">/</span> for blocks, or select text for bold, italic and links.
        Press Save changes when you are done.
      </p>
    </div>
  );

  const materialPane = (
    <section className="nm-study-material" aria-label="Material">
      {materialBody}
      {!hasMaterial ? (
        <div className="nm-study-empty">
          <i className="fa-solid fa-feather-pointed" aria-hidden="true" />
          <p>This note has no material. The writing pane is all yours.</p>
        </div>
      ) : null}
    </section>
  );

  const writePane = (
    <section className="nm-study-write">
      {chipsRow(isFocus)}
      {titleInput}
      {writerBody}
      {excerptsCard}
      {cardsCard}
    </section>
  );

  const resumePill =
    isPhone && activeTab === "notes" && hasMaterial ? (
      <button type="button" className="nm-study-resume" onClick={() => switchTab("material")}>
        {video ? (
          <>
            {videoThumbUrl(video) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={videoThumbUrl(video) ?? ""} alt="" className="nm-study-resume-thumb" />
            ) : (
              <span className="nm-study-resume-icon">
                <i className="fa-brands fa-youtube" aria-hidden="true" />
              </span>
            )}
            <span className="nm-study-resume-title">{note.title}</span>
            <i className="fa-solid fa-play nm-study-resume-play" aria-hidden="true" />
          </>
        ) : isPdf ? (
          <>
            <i className="fa-solid fa-file-pdf" aria-hidden="true" />
            <span className="nm-study-resume-title">page {mobilePage} · resume</span>
          </>
        ) : (
          <>
            <i className="fa-solid fa-book-open-reader" aria-hidden="true" />
            <span className="nm-study-resume-title">Back to material</span>
          </>
        )}
      </button>
    ) : null;

  const focusView = (
    <>
      {isFocus ? (
        <div className="nm-study-focusbar">
          <div className="nm-seg nm-seg--sm" role="group" aria-label="Focus view mode">
            {STUDY_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nm-seg-btn${study.mode === item.id ? " is-active" : ""}`}
                aria-pressed={study.mode === item.id}
                onClick={() => setStudyMode(item.id)}
              >
                <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
          <span className="nm-help nm-study-hint">Ctrl + \ cycles · drag the divider to resize</span>
        </div>
      ) : null}

      {isPhone ? (
        <div className="nm-seg nm-seg--wide nm-study-tabs" role="tablist" aria-label="Note panes">
          {(
            [
              { id: "material", label: "Material", icon: "fa-book-open-reader" },
              { id: "notes", label: "Notes", icon: "fa-pen" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              className={`nm-seg-btn${activeTab === item.id ? " is-active" : ""}`}
              disabled={item.id === "material" && !hasMaterial}
              onClick={() => switchTab(item.id)}
            >
              <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={studyRef}
        className={`nm-study nm-study--${study.mode}${isPhone ? ` nm-study--mobile nm-study--tab-${activeTab}` : ""}`}
        style={{ "--split": `${Math.round(study.ratio * 100)}%` } as React.CSSProperties}
      >
        {resumePill}
        {materialPane}
        {!isPhone && study.mode === "split" ? (
          <div
            className={`nm-study-divider${dragging ? " is-dragging" : ""}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize material and notes"
            onPointerDown={startDividerDrag}
          />
        ) : null}
        {writePane}
      </div>
    </>
  );

  return (
    <div className="nm-page nm-page--note">
      {actions.overlays}

      <div className="nm-note-top">
        <Link className="nm-backlink" href="/vault">
          <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          Notes
        </Link>
        <span
          className={`nm-savestate nm-mono${dirty ? " is-dirty" : ""}${saveState === "saved" ? " is-saved" : ""}`}
          aria-live="polite"
        >
          {saveState === "saving" ? "Saving…" : dirty ? "Unsaved changes" : saveState === "saved" ? `Saved ${savedAt}` : ""}
        </span>
        <div className="nm-note-topactions">
          <button
            type="button"
            className="nm-btn nm-btn--primary nm-btn--sm nm-save-desktop"
            onClick={() => void save()}
            disabled={!dirty || saveState === "saving"}
          >
            <i className="fa-solid fa-check" aria-hidden="true" />
            {saveLabel}
          </button>
          {group ? null : (
            <>
              <button
                type="button"
                className="nm-btn nm-btn--secondary nm-btn--sm"
                aria-label="Public link"
                onClick={() => actions.publicLink()}
              >
                <i className="fa-solid fa-link" aria-hidden="true" />
                <span className="nm-btn-label">Public link</span>
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--secondary nm-btn--sm"
                aria-label="Share to group"
                onClick={() => actions.share()}
              >
                <i className="fa-solid fa-share-nodes" aria-hidden="true" />
                <span className="nm-btn-label">Share to group</span>
              </button>
            </>
          )}
          <button type="button" className="nm-iconbtn" aria-label="Item actions" onClick={actions.openMenu}>
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isFocus || isPhone ? (
        focusView
      ) : (
        <div className="nm-note-layout">
          <div className="nm-note-main">
            {chipsRow(false)}
            {titleInput}
            {materialBody}
            {writerBody}
            {excerptsCard}
            {cardsCard}
          </div>

          <aside className="nm-note-side">
            <div className="nm-card">
              <div className="nm-card-hd">
                <h2 className="nm-card-title">Details</h2>
              </div>
              <div className="nm-card-bd">
                <div className="nm-field">
                  <label className="nm-label" htmlFor="note-subject">
                    Subject
                  </label>
                  <select
                    id="note-subject"
                    className="nm-select"
                    value={subjectId ?? ""}
                    onChange={(event) => setSubjectId(event.target.value || null)}
                  >
                    <option value="">No subject</option>
                    {store.subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="nm-field">
                  <label className="nm-label" htmlFor="note-tags">
                    Tags
                  </label>
                  <input
                    id="note-tags"
                    className="nm-input"
                    placeholder="exam, lab, week 3"
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                  />
                  <p className="nm-help">Comma separated.</p>
                </div>
              </div>
            </div>

            <div className="nm-card">
              <div className="nm-card-hd">
                <h2 className="nm-card-title">History</h2>
              </div>
              <div className="nm-card-bd">
                <p className="nm-meta">Created {fmtDateTime(note.createdAt)}</p>
                <p className="nm-meta">Updated {fmtRelative(note.updatedAt)}</p>
                {note.createdBy && note.createdBy !== store.user?.id ? (
                  <p className="nm-meta">Shared by {store.userName(note.createdBy)}</p>
                ) : null}
                <button
                  type="button"
                  className="nm-btn nm-btn--danger nm-btn--ghost nm-btn--sm mt-3"
                  onClick={() => void actions.remove()}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" />
                  Delete item
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <div className="nm-note-bottombar">
        <button type="button" className="nm-btn nm-btn--secondary" onClick={() => setDetailsOpen(true)}>
          <i className="fa-solid fa-sliders" aria-hidden="true" />
          Details
        </button>
        <button
          type="button"
          className="nm-btn nm-btn--primary"
          onClick={() => void save()}
          disabled={!dirty || saveState === "saving"}
        >
          <i className="fa-solid fa-check" aria-hidden="true" />
          {saveLabel}
        </button>
      </div>

      {cardModal ? (
        <Modal
          title="New flashcard"
          subtitle={
            cardModal.sourceHighlightId
              ? "From your highlight — turn it into a question future-you must answer."
              : undefined
          }
          size="sm"
          onClose={() => setCardModal(null)}
          footer={
            <>
              <div className="nm-spacer" />
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setCardModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                disabled={!cardModal.front.trim()}
                onClick={() => void saveCard()}
              >
                Add card
              </button>
            </>
          }
        >
          <Field label="Question" htmlFor="card-front" full>
            <textarea
              id="card-front"
              className="nm-textarea"
              rows={3}
              value={cardModal.front}
              placeholder="What should you be able to recall?"
              onChange={(event) => setCardModal({ ...cardModal, front: event.target.value })}
            />
          </Field>
          <Field label="Answer" htmlFor="card-back" full help="Optional — fill it in later.">
            <textarea
              id="card-back"
              className="nm-textarea"
              rows={3}
              value={cardModal.back}
              onChange={(event) => setCardModal({ ...cardModal, back: event.target.value })}
            />
          </Field>
        </Modal>
      ) : null}

      {detailsOpen ? (
        <NoteDetailsSheet
          note={note}
          subjectId={subjectId}
          onSubjectChange={setSubjectId}
          tags={tags}
          onTagsChange={setTags}
          fileUrl={fileUrl}
          onClose={() => setDetailsOpen(false)}
          onDelete={() => void actions.remove()}
        />
      ) : null}

      {leaveHref ? (
        <Modal
          title="Save your changes?"
          size="sm"
          onClose={() => setLeaveHref(null)}
          footer={
            <>
              <button type="button" className="nm-btn nm-btn--ghost" onClick={() => setLeaveHref(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="nm-btn nm-btn--ghost"
                onClick={() => {
                  const href = leaveHref;
                  setLeaveHref(null);
                  router.push(href);
                }}
              >
                Discard
              </button>
              <div className="nm-spacer" />
              <button
                type="button"
                className="nm-btn nm-btn--primary"
                onClick={() => {
                  const href = leaveHref;
                  void save().then((ok) => {
                    setLeaveHref(null);
                    if (ok) router.push(href);
                  });
                }}
              >
                Save &amp; leave
              </button>
            </>
          }
        >
          <p className="nm-body-text">This note has unsaved edits. Save them before leaving?</p>
        </Modal>
      ) : null}
    </div>
  );
}
