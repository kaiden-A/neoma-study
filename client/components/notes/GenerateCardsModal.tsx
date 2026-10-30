"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { FlashcardDraft, GenerateCardsResponse } from "@/lib/types";

const COUNTS = [10, 20, 30] as const;

export function GenerateCardsModal({
  noteId,
  noteTitle,
  onClose,
}: {
  noteId: string;
  noteTitle: string;
  onClose: () => void;
}) {
  const store = useStore();
  const { toast } = useOverlays();
  const [count, setCount] = useState<number>(10);
  const [refine, setRefine] = useState(true);
  const [result, setResult] = useState<GenerateCardsResponse | null>(null);
  const [drafts, setDrafts] = useState<FlashcardDraft[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectable = drafts.flatMap((draft, index) => (draft.duplicate ? [] : [index]));
  const allPicked = selectable.length > 0 && selectable.every((index) => picked.has(index));
  const chosen = drafts.filter((_, index) => picked.has(index));
  const ready = chosen.length > 0 && chosen.every((draft) => draft.front.trim());
  const aiReady = Boolean(store.aiStatus?.refine);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await store.generateCards(noteId, count, refine && aiReady);
      setResult(response);
      setDrafts(response.cards);
      setPicked(new Set(response.cards.flatMap((card, index) => (card.duplicate ? [] : [index]))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this note.");
    } finally {
      setBusy(false);
    }
  }

  function patch(index: number, changes: Partial<FlashcardDraft>) {
    setDrafts((current) =>
      current.map((draft, position) => (position === index ? { ...draft, ...changes } : draft)),
    );
  }

  function toggle(index: number) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function save() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const created = await store.createCards(noteId, chosen);
      toast(
        created.length
          ? `${created.length} card${created.length === 1 ? "" : "s"} added`
          : "Those cards are already in your deck",
        { kind: "success", icon: "fa-clone" },
      );
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save those cards.");
    } finally {
      setSaving(false);
    }
  }

  const footer = result ? (
    <>
      <button
        type="button"
        className="nm-btn nm-btn--ghost"
        onClick={() => void generate()}
        disabled={busy || saving}
      >
        Try again
      </button>
      <div className="nm-spacer" />
      <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="nm-btn nm-btn--primary"
        onClick={() => void save()}
        disabled={!ready || saving}
      >
        {saving ? "Adding…" : `Add ${chosen.length} card${chosen.length === 1 ? "" : "s"}`}
      </button>
    </>
  ) : (
    <>
      <div className="nm-spacer" />
      <button type="button" className="nm-btn nm-btn--ghost" onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        className="nm-btn nm-btn--primary"
        onClick={() => void generate()}
        disabled={busy}
      >
        {busy ? "Generating…" : "Generate cards"}
      </button>
    </>
  );

  return (
    <Modal
      title="Generate cards"
      subtitle={`From “${noteTitle}”`}
      size="lg"
      onClose={onClose}
      dismissible={!saving}
      footer={footer}
    >
      <p className="nm-help">
        Reads the note and any text already extracted from its PDF or deck. Nothing is saved until you pick.
      </p>

      <div className="nm-genintro">
        <span className="nm-label">How many</span>
        <div className="nm-seg nm-seg--sm" role="group" aria-label="Number of cards">
          {COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`nm-seg-btn${count === value ? " is-active" : ""}`}
              aria-pressed={count === value}
              disabled={busy || saving}
              onClick={() => setCount(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {result ? <span className="nm-meta">{drafts.length} drafts</span> : null}
        {aiReady ? (
          <label className="nm-check nm-check--switch">
            <input
              type="checkbox"
              checked={refine}
              disabled={busy || saving}
              onChange={(event) => setRefine(event.target.checked)}
            />
            <span>Refine with Elpis</span>
          </label>
        ) : null}
      </div>

      {error ? <p className="nm-error">{error}</p> : null}

      {busy ? (
        <p className="nm-help" role="status">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />{" "}
          {refine && aiReady ? "Elpis is improving the cards…" : "Reading the note…"}
        </p>
      ) : null}

      {!result && !busy ? (
        <p className="nm-meta">
          Definitions, bullet points, tables and highlighted excerpts work best. You can edit or drop any card
          before saving.
        </p>
      ) : null}

      {result ? (
        <>
          {result.notice ? <p className="nm-help">{result.notice}</p> : null}
          {drafts.length === 0 ? (
            <p className="nm-meta">
              No card shapes found in this note yet. Try adding “Term: definition” lines or bullet points, or
              use Add card to write one yourself.
            </p>
          ) : (
            <>
              <div className="nm-gencard-hd nm-genlist-hd">
                <span className="nm-meta">
                  {selectable.length} new · {drafts.length - selectable.length} already in your deck
                </span>
                {result.refined ? (
                  <span className="nm-chip nm-chip--sm nm-chip--link">
                    <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                    Elpis
                  </span>
                ) : null}
                <div className="nm-spacer" />
                <button
                  type="button"
                  className="nm-btn nm-btn--ghost nm-btn--sm"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(selectable))}
                  disabled={!selectable.length || saving}
                >
                  {allPicked ? "Select none" : "Select all"}
                </button>
              </div>
              <ul className="nm-genlist">
                {drafts.map((draft, index) => (
                  <li key={index} className={`nm-gencard${picked.has(index) ? " is-picked" : ""}`}>
                    <div className="nm-gencard-hd">
                      <label className="nm-check nm-gencard-check">
                        <input
                          type="checkbox"
                          aria-label={`Include card ${index + 1}`}
                          checked={picked.has(index)}
                          disabled={draft.duplicate || saving}
                          onChange={() => toggle(index)}
                        />
                        <span className="nm-gencard-kind">
                          {draft.kind === "cloze" ? "Cloze" : "Q&A"}
                        </span>
                      </label>
                      {draft.duplicate ? (
                        <span className="nm-chip nm-chip--sm nm-chip--muted">In deck</span>
                      ) : null}
                    </div>
                    <textarea
                      className="nm-textarea"
                      rows={2}
                      aria-label={`Question for draft ${index + 1}`}
                      value={draft.front}
                      disabled={saving}
                      onChange={(event) => patch(index, { front: event.target.value })}
                    />
                    <input
                      className="nm-input"
                      aria-label={`Answer for draft ${index + 1}`}
                      placeholder="Answer"
                      value={draft.back}
                      disabled={saving}
                      onChange={(event) => patch(index, { back: event.target.value })}
                    />
                    {draft.source ? (
                      <p className="nm-gencard-source">
                        “{draft.source}”
                        {draft.page ? ` · p. ${draft.page}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}
    </Modal>
  );
}
