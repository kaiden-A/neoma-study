"use client";

import Link from "next/link";

import { fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { Flashcard } from "@/lib/types";
import { useNow } from "@/lib/useNow";

/** Card rows shared by the note page and the per-subject deck browser. */
export function FlashcardRows({
  cards,
  showNote = false,
}: {
  cards: Flashcard[];
  showNote?: boolean;
}) {
  const store = useStore();
  const now = useNow(30_000);

  if (!cards.length) return null;

  return (
    <ul className="nm-excerpts-list">
      {cards.map((card) => (
        <li key={card.id} className={`nm-excerpt${card.suspended ? " is-suspended" : ""}`}>
          {showNote && card.noteTitle ? (
            <div className="nm-excerpt-note">
              <Link className="nm-chip nm-chip--sm nm-chip--link" href={`/vault/${card.noteId}`}>
                <i className="fa-solid fa-note-sticky" aria-hidden="true" />
                <span className="nm-chip-name">{card.noteTitle}</span>
              </Link>
            </div>
          ) : null}
          <p className="nm-excerpt-quote">{card.front}</p>
          {card.back ? <p className="nm-meta">{card.back}</p> : null}
          <div className="nm-excerpt-actions">
            <span className="nm-mono nm-meta">
              {card.suspended ? "Suspended" : card.dueAt <= now ? "Due now" : `Due ${fmtRelative(card.dueAt, now)}`}
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
              aria-label={`Delete card: ${card.front}`}
              onClick={() => void store.deleteCard(card.id).catch(() => {})}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
