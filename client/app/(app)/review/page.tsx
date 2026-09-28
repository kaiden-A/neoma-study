"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { EmptyState, Progress } from "@/components/ui/bits";
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

export default function ReviewPage() {
  const store = useStore();
  const now = useNow(30_000);
  const queue = store.dueCards(now);
  const card: Flashcard | null = queue[0] ?? null;
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [graded, setGraded] = useState(0);
  const [busy, setBusy] = useState(false);
  const total = queue.length + graded;
  const revealed = Boolean(card && revealedId === card.id);

  const grade = useCallback(
    async (value: FlashcardGrade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await store.gradeCard(card.id, value);
        setGraded((count) => count + 1);
      } catch {
        // The store rolls back and toasts.
      }
      setBusy(false);
    },
    [busy, card, store],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!card) return;
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
  }, [card, grade, revealedId]);

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Review · <span className="nm-mono">{queue.length} due</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            Recall it before you lose it
          </h1>
        </div>
        <p className="nm-meta">
          Cards made from your notes and PDF highlights, scheduled with spaced repetition.
        </p>
      </div>

      {card ? (
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
                {queue.length} in queue
              </span>
              {card.noteTitle ? (
                <Link className="nm-chip nm-chip--sm nm-chip--link" href={`/vault/${card.noteId}`}>
                  <i className="fa-solid fa-note-sticky" aria-hidden="true" />
                  <span className="nm-chip-name">{card.noteTitle}</span>
                </Link>
              ) : null}
            </div>
            <p className="nm-reviewcard-front">{card.front}</p>
            {revealed ? (
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
          <p className="nm-help nm-review-hint">
            Press <span className="nm-mono">Space</span> to reveal, then <span className="nm-mono">1–4</span> to grade.
            Keys 1–4 only work after the answer is showing.
          </p>
        </>
      ) : (
        <EmptyState
          icon="fa-clone"
          title="Nothing due right now"
          body={
            store.flashcards.length
              ? "Every card is scheduled ahead. Come back when the next one is due, or make more from a note."
              : "Open a note, add a card, and it will show up here for spaced-repetition review."
          }
          action={
            <Link className="nm-btn nm-btn--secondary" href="/vault">
              Go to notes
            </Link>
          }
        />
      )}
    </div>
  );
}
