"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { FlashcardRows } from "@/components/notes/FlashcardRows";
import { EmptyState, MarkerChip, Progress } from "@/components/ui/bits";
import { fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/useNow";
import type { Flashcard, FlashcardGrade } from "@/lib/types";

const GRADES: {
  id: FlashcardGrade;
  label: string;
  key: string;
  className: string;
  help: string;
}[] = [
  { id: "again", label: "Again", key: "1", className: "nm-btn--danger", help: "Back in 10 minutes" },
  { id: "hard", label: "Hard", key: "2", className: "nm-btn--secondary", help: "Shorter interval" },
  { id: "good", label: "Good", key: "3", className: "nm-btn--primary", help: "On schedule" },
  { id: "easy", label: "Easy", key: "4", className: "nm-btn--secondary", help: "Push it further out" },
];

/** One review run. The page remounts it with a key when the folder or tab
 * changes, so the progress count always belongs to the queue on screen. */
function ReviewSession({
  due,
  scoped,
  empty,
}: {
  due: Flashcard[];
  scoped: string | "unsorted" | null;
  empty: React.ReactNode;
}) {
  const store = useStore();
  const card: Flashcard | null = due[0] ?? null;
  const cardNote = card ? store.noteById(card.noteId) : null;
  const cardSubject = cardNote?.subjectId ? store.subjectById(cardNote.subjectId) : null;
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ id: string; index: number } | null>(null);
  const [graded, setGraded] = useState(0);
  const [busy, setBusy] = useState(false);
  const total = due.length + graded;
  const isChoice = Boolean(card && card.kind === "choice" && (card.options?.length ?? 0) >= 2);
  const picked = card && answer?.id === card.id ? answer.index : null;
  const revealed = Boolean(card && (isChoice ? picked !== null : revealedId === card.id));
  const correct = Boolean(card && isChoice && picked !== null && picked === card.answerIndex);

  const grade = useCallback(
    async (value: FlashcardGrade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await store.gradeCard(card.id, value);
        setGraded((count) => count + 1);
        setAnswer(null);
        setRevealedId(null);
      } catch {
        // The store rolls back and toasts.
      }
      setBusy(false);
    },
    [busy, card, store],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!card || busy) return;
      if (isChoice) {
        if (picked === null) {
          const index = Number(event.key) - 1;
          if (Number.isInteger(index) && index >= 0 && index < card.options.length) {
            event.preventDefault();
            setAnswer({ id: card.id, index });
          }
          return;
        }
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          void grade(correct ? "good" : "again");
        }
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setRevealedId(card.id);
        return;
      }
      const match = GRADES.find((item) => item.key === event.key);
      if (match && revealedId === card.id) {
        event.preventDefault();
        void grade(match.id);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, card, correct, grade, isChoice, picked, revealedId]);

  if (!card) return <>{empty}</>;

  return (
    <>
      <div className="nm-review-progress">
        <Progress
          pct={total ? Math.round((graded / total) * 100) : 0}
          markerKey="mint"
          label="Review progress"
          large
        />
        <span className="nm-mono nm-meta">
          {graded} / {total}
        </span>
      </div>

      <article className={`nm-reviewcard${revealed ? " is-revealed" : ""}`}>
        <div className="nm-reviewcard-top">
          <span className="nm-chip nm-chip--sm">
            <i className="fa-solid fa-clone" aria-hidden="true" />
            {due.length} in queue
          </span>
          {!scoped && cardSubject ? (
            <MarkerChip name={cardSubject.name} markerKey={cardSubject.color} small />
          ) : null}
          {card.noteTitle ? (
            <Link className="nm-chip nm-chip--sm nm-chip--link" href={`/vault/${card.noteId}`}>
              <i className="fa-solid fa-note-sticky" aria-hidden="true" />
              <span className="nm-chip-name">{card.noteTitle}</span>
            </Link>
          ) : null}
        </div>
        <p className="nm-reviewcard-front">{card.front}</p>
        {isChoice ? (
          <>
            <div className="nm-review-options" role="group" aria-label="Choose an answer">
              {card.options.map((option, index) => {
                const chosen = picked === index;
                const isCorrect = revealed && card.answerIndex === index;
                const isWrong = revealed && chosen && card.answerIndex !== index;
                return (
                  <button
                    key={`${index}-${option}`}
                    type="button"
                    className={`nm-review-option${chosen ? " is-chosen" : ""}${
                      isCorrect ? " is-correct" : ""
                    }${isWrong ? " is-wrong" : ""}`}
                    disabled={revealed || busy}
                    onClick={() => setAnswer({ id: card.id, index })}
                  >
                    <span className="nm-mono nm-review-option-key">{index + 1}</span>
                    {option}
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <p className={`nm-review-feedback${correct ? " is-correct" : " is-wrong"}`}>
                {correct ? "Correct." : `Not quite — the answer is “${card.options[card.answerIndex ?? 0]}”`}
              </p>
            ) : (
              <p className="nm-help">Pick the answer that fits. Keys 1–{card.options.length} work too.</p>
            )}
          </>
        ) : revealed ? (
          <p className="nm-reviewcard-back">{card.back || "No answer written yet."}</p>
        ) : (
          <button
            type="button"
            className="nm-btn nm-btn--secondary nm-reviewcard-flip"
            onClick={() => setRevealedId(card.id)}
          >
            <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
            Show answer
          </button>
        )}
        <p className="nm-help">
          {card.reps === 0
            ? "First review."
            : `${card.reps} review${card.reps === 1 ? "" : "s"} · ${card.lapses} lapse${
                card.lapses === 1 ? "" : "s"
              } · last shown ${fmtRelative(card.updatedAt)}`}
        </p>
      </article>

      {isChoice ? (
        <div className="nm-review-grades">
          <button
            type="button"
            className="nm-btn nm-btn--primary"
            disabled={!revealed || busy}
            onClick={() => void grade(correct ? "good" : "again")}
          >
            <span>{correct ? "Correct — next card" : "Not quite — next card"}</span>
            <kbd className="nm-kbd">Enter</kbd>
          </button>
        </div>
      ) : (
        <div className="nm-review-grades" role="group" aria-label="Grade this card">
          {GRADES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nm-btn ${item.className}`}
              disabled={!revealed || busy}
              onClick={() => void grade(item.id)}
            >
              <span>{item.label}</span>
              <kbd className="nm-kbd">{item.key}</kbd>
            </button>
          ))}
        </div>
      )}
      <p className="nm-help nm-review-hint">
        {isChoice
          ? picked === null
            ? `Press 1–${card.options.length} to answer.`
            : "Press Enter for the next card."
          : "Press Space to reveal, then 1–4 to grade. Keys 1–4 only work after the answer is showing."}
      </p>
    </>
  );
}

export default function ReviewPage() {
  const store = useStore();
  const searchParams = useSearchParams();
  const now = useNow(30_000);
  // The same ?subject= convention as the vault: a stale id falls back to all.
  const folderParam = searchParams.get("subject");
  const scoped: string | "unsorted" | null =
    folderParam === "unsorted"
      ? "unsorted"
      : folderParam && store.subjectById(folderParam)
        ? folderParam
        : null;
  const subject = scoped && scoped !== "unsorted" ? store.subjectById(scoped) : null;
  const scopeName = scoped === "unsorted" ? "Unsorted" : (subject?.name ?? null);
  const deckView = searchParams.get("view") === "deck";

  const due = store.dueCards(now, scoped);
  const deck = store.cardsForSubject(scoped);
  const reviewHref = scoped ? `/review?subject=${encodeURIComponent(scoped)}` : "/review";
  const deckHref = scoped ? `${reviewHref}&view=deck` : "/review?view=deck";
  const folderHref = scoped === null ? "/vault" : `/vault?subject=${encodeURIComponent(scoped)}`;
  const allDue = store.dueCards(now).length;
  const unsortedDue = store.dueCards(now, "unsorted").length;
  const unsortedCards = store.cardsForSubject("unsorted").length;
  const nextCard = deck.find((item) => !item.suspended) ?? null;

  const reviewEmpty =
    scoped !== null ? (
      <EmptyState
        icon="fa-clone"
        title={deck.length ? `Nothing due in ${scopeName}` : `No cards in ${scopeName} yet`}
        body={
          deck.length
            ? nextCard
              ? `Every card is scheduled ahead. The next one is due ${fmtRelative(nextCard.dueAt, now)}.`
              : "Every card here is suspended."
            : "Open a note in this folder and generate cards from it."
        }
        action={
          <div className="nm-inline-actions">
            <Link className="nm-btn nm-btn--secondary" href="/review">
              Review all folders
            </Link>
            <Link className="nm-btn nm-btn--primary" href={folderHref}>
              Open folder
            </Link>
          </div>
        }
      />
    ) : (
      <EmptyState
        icon="fa-clone"
        title="Nothing due right now"
        body={
          deck.length
            ? "Every card is scheduled ahead. Come back when the next one is due, or make more from a note."
            : "Open a note, add a card, and it will show up here for spaced-repetition review."
        }
        action={
          <Link className="nm-btn nm-btn--secondary" href="/vault">
            Go to notes
          </Link>
        }
      />
    );

  const deckEmpty = (
    <EmptyState
      icon="fa-layer-group"
      title={scoped === null ? "No cards yet" : `No cards in ${scopeName} yet`}
      body={
        scoped === null
          ? "Make cards from a note and they will show up here, grouped by folder."
          : "Open a note in this folder and generate cards from it."
      }
      action={
        <Link className="nm-btn nm-btn--secondary" href={folderHref}>
          {scoped === null ? "Go to notes" : "Open folder"}
        </Link>
      }
    />
  );

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            {deckView ? "Cards" : "Review"} ·{" "}
            <span className="nm-mono">
              {deckView ? `${deck.length} total` : `${due.length} due`}
            </span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {deckView
              ? scopeName
                ? `${scopeName} cards`
                : "Every card you've made"
              : "Recall it before you lose it"}
          </h1>
        </div>
        <p className="nm-meta">
          {deckView
            ? scopeName
              ? `Every card in ${scopeName} — due now, scheduled ahead, or suspended.`
              : "Every card you've made, across all folders. Suspend or delete here; make new cards from a note."
            : scopeName
              ? `Cards from ${scopeName} only, scheduled with spaced repetition.`
              : "Cards made from your notes and PDF highlights, scheduled with spaced repetition."}
        </p>
      </div>

      <div className="nm-review-scope" role="group" aria-label="Filter flashcards by folder">
        <Link
          className={`nm-chip nm-chip--sm nm-chip--link${scoped === null ? " is-active" : ""}`}
          href={deckView ? "/review?view=deck" : "/review"}
        >
          <i className="fa-solid fa-layer-group" aria-hidden="true" />
          All
          <span className="nm-mono">{allDue}</span>
        </Link>
        {store.subjects.map((item) => (
          <Link
            key={item.id}
            className={`nm-chip nm-chip--sm nm-chip--link${scoped === item.id ? " is-active" : ""}`}
            href={
              deckView
                ? `/review?subject=${encodeURIComponent(item.id)}&view=deck`
                : `/review?subject=${encodeURIComponent(item.id)}`
            }
          >
            <span className={`nm-dot nm-mk-${item.color}`} aria-hidden="true" />
            {item.name}
            <span className="nm-mono">{store.dueCards(now, item.id).length}</span>
          </Link>
        ))}
        {unsortedDue > 0 || unsortedCards > 0 || scoped === "unsorted" ? (
          <Link
            className={`nm-chip nm-chip--sm nm-chip--link${scoped === "unsorted" ? " is-active" : ""}`}
            href={deckView ? "/review?subject=unsorted&view=deck" : "/review?subject=unsorted"}
          >
            <i className="fa-solid fa-inbox" aria-hidden="true" />
            Unsorted
            <span className="nm-mono">{unsortedDue}</span>
          </Link>
        ) : null}
      </div>

      <nav className="nm-tabs" aria-label="Flashcard view">
        <Link className={`nm-tab${deckView ? "" : " is-active"}`} href={reviewHref}>
          <i className="fa-solid fa-clone" aria-hidden="true" />
          Review
          <span className="nm-tab-count">{due.length}</span>
        </Link>
        <Link className={`nm-tab${deckView ? " is-active" : ""}`} href={deckHref}>
          <i className="fa-solid fa-table-list" aria-hidden="true" />
          Cards
          <span className="nm-tab-count">{deck.length}</span>
        </Link>
      </nav>

      <div className="nm-tabpanel">
        {deckView ? (
          deck.length ? (
            <FlashcardRows cards={deck} showNote />
          ) : (
            deckEmpty
          )
        ) : (
          <ReviewSession key={`${scoped ?? "all"}:review`} due={due} scoped={scoped} empty={reviewEmpty} />
        )}
      </div>
    </div>
  );
}
