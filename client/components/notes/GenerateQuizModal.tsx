"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { useOverlays } from "@/components/ui/Overlays";
import { useStore } from "@/lib/store";
import type { GenerateQuizResponse, QuizQuestion } from "@/lib/types";

const OBJECTIVE_COUNTS = [0, 5, 10, 15] as const;
const WRITTEN_COUNTS = [0, 3, 6] as const;

function kindLabel(kind: QuizQuestion["kind"]): string {
  if (kind === "mcq") return "Multiple choice";
  if (kind === "true_false") return "True / false";
  return "Short answer";
}

function questionReady(question: QuizQuestion): boolean {
  if (!question.prompt.trim()) return false;
  if (question.kind === "mcq") {
    const options = question.options.map((option) => option.trim());
    const unique = new Set(options.map((option) => option.toLowerCase()));
    return (
      options.length >= 2 &&
      options.length <= 4 &&
      options.every(Boolean) &&
      unique.size === options.length &&
      question.answerIndex !== null &&
      question.answerIndex >= 0 &&
      question.answerIndex < question.options.length
    );
  }
  if (question.kind === "true_false") {
    return question.options.length === 2 && (question.answerIndex === 0 || question.answerIndex === 1);
  }
  return (
    Boolean(question.modelAnswer.trim()) &&
    question.keyPoints.filter((point) => point.trim()).length >= 2
  );
}

export function GenerateQuizModal({
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
  const [objective, setObjective] = useState<number>(10);
  const [written, setWritten] = useState<number>(3);
  const [refine, setRefine] = useState(true);
  const [result, setResult] = useState<GenerateQuizResponse | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aiReady = Boolean(store.aiStatus?.refine);
  const selectable = questions.flatMap((question, index) =>
    questionReady(question) ? [index] : [],
  );
  const allPicked = selectable.length > 0 && selectable.every((index) => picked.has(index));
  const chosen = questions.filter((_, index) => picked.has(index));
  const ready = chosen.length > 0 && chosen.every(questionReady);
  const countsEmpty = objective + written === 0;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const response = await store.generateQuiz(noteId, objective, written, refine && aiReady);
      setResult(response);
      setQuestions(response.questions);
      setTitle(response.title);
      setPicked(
        new Set(response.questions.flatMap((question, index) => (questionReady(question) ? [index] : []))),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this note.");
    } finally {
      setBusy(false);
    }
  }

  function patch(index: number, changes: Partial<QuizQuestion>) {
    setQuestions((current) =>
      current.map((question, position) =>
        position === index ? { ...question, ...changes } : question,
      ),
    );
  }

  function patchOption(index: number, optionIndex: number, value: string) {
    const question = questions[index];
    patch(index, {
      options: question.options.map((option, position) =>
        position === optionIndex ? value : option,
      ),
    });
  }

  function patchKeyPoints(index: number, value: string) {
    patch(index, { keyPoints: value.split("\n") });
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
      const prepared = chosen.map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        options: question.options.map((option) => option.trim()).filter(Boolean),
        modelAnswer: question.modelAnswer.trim(),
        keyPoints: question.keyPoints.map((point) => point.trim()).filter(Boolean),
      }));
      const quiz = await store.createQuiz({
        noteId,
        title: title.trim() || "Quiz",
        questions: prepared,
      });
      toast(`Quiz saved · ${quiz.questionCount} question${quiz.questionCount === 1 ? "" : "s"}`, {
        kind: "success",
        icon: "fa-circle-question",
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this quiz.");
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
        {saving ? "Saving…" : `Save ${chosen.length} question${chosen.length === 1 ? "" : "s"}`}
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
        disabled={busy || countsEmpty}
      >
        {busy ? "Generating…" : "Generate quiz"}
      </button>
    </>
  );

  return (
    <Modal
      title="Generate quiz"
      subtitle={`From “${noteTitle}”`}
      size="lg"
      onClose={onClose}
      dismissible={!saving}
      footer={footer}
    >
      <p className="nm-help">
        Reads the note and any text already extracted from its PDF or deck. Nothing is saved until you
        pick.
      </p>

      <div className="nm-genintro">
        <span className="nm-label">Objective</span>
        <div className="nm-seg nm-seg--sm" role="group" aria-label="Objective questions">
          {OBJECTIVE_COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`nm-seg-btn${objective === value ? " is-active" : ""}`}
              aria-pressed={objective === value}
              disabled={busy || saving}
              onClick={() => setObjective(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <span className="nm-label">Written</span>
        <div className="nm-seg nm-seg--sm" role="group" aria-label="Written questions">
          {WRITTEN_COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`nm-seg-btn${written === value ? " is-active" : ""}`}
              aria-pressed={written === value}
              disabled={busy || saving}
              onClick={() => setWritten(value)}
            >
              {value}
            </button>
          ))}
        </div>
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
      <p className="nm-help">
        Objective is multiple choice and true/false. Written is short answer with a model answer and key
        points you tick when you review it.
      </p>

      {error ? <p className="nm-error">{error}</p> : null}

      {busy ? (
        <p className="nm-help" role="status">
          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />{" "}
          {refine && aiReady ? "Elpis is improving the questions…" : "Reading the note…"}
        </p>
      ) : null}

      {!result && !busy ? (
        <p className="nm-meta">
          Definition lines, bullet points, tables and highlighted excerpts work best. You can edit or
          drop any question before saving.
        </p>
      ) : null}

      {result ? (
        <>
          {result.notice ? <p className="nm-help">{result.notice}</p> : null}
          {questions.length === 0 ? (
            <p className="nm-meta">
              No quiz shapes found in this note yet. Try adding “Term: definition” lines or bullet
              points, or lower the counts.
            </p>
          ) : (
            <>
              <div className="nm-gencard-hd nm-genlist-hd">
                <span className="nm-meta">
                  {selectable.length} ready · {questions.length - selectable.length} need edits
                  {result.refined ? (
                    <span className="nm-chip nm-chip--sm nm-chip--link nm-quiz-elpis">
                      <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
                      Elpis
                    </span>
                  ) : null}
                </span>
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

              <label className="nm-field nm-quiz-titlefield">
                <span className="nm-label">Quiz title</span>
                <input
                  className="nm-input"
                  value={title}
                  maxLength={200}
                  disabled={saving}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>

              <ul className="nm-genlist">
                {questions.map((question, index) => {
                  const valid = questionReady(question);
                  return (
                    <li key={index} className={`nm-gencard${picked.has(index) ? " is-picked" : ""}`}>
                      <div className="nm-gencard-hd">
                        <label className="nm-check nm-gencard-check">
                          <input
                            type="checkbox"
                            aria-label={`Include question ${index + 1}`}
                            checked={picked.has(index)}
                            disabled={!valid || saving}
                            onChange={() => toggle(index)}
                          />
                          <span className="nm-gencard-kind">{kindLabel(question.kind)}</span>
                        </label>
                        {!valid ? (
                          <span className="nm-chip nm-chip--sm nm-chip--muted">Needs edits</span>
                        ) : null}
                      </div>

                      <textarea
                        className="nm-textarea"
                        rows={2}
                        aria-label={`Question ${index + 1}`}
                        value={question.prompt}
                        disabled={saving}
                        onChange={(event) => patch(index, { prompt: event.target.value })}
                      />

                      {question.kind === "mcq" ? (
                        <div className="nm-quiz-optedit-list">
                          {question.options.map((option, optionIndex) => (
                            <div className="nm-quiz-optedit" key={optionIndex}>
                              <input
                                type="radio"
                                name={`correct-${index}`}
                                aria-label={`Mark option ${optionIndex + 1} correct`}
                                checked={question.answerIndex === optionIndex}
                                disabled={saving}
                                onChange={() => patch(index, { answerIndex: optionIndex })}
                              />
                              <input
                                className="nm-input"
                                aria-label={`Option ${optionIndex + 1}`}
                                value={option}
                                disabled={saving}
                                onChange={(event) => patchOption(index, optionIndex, event.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {question.kind === "true_false" ? (
                        <div className="nm-seg nm-seg--sm" role="group" aria-label="Correct answer">
                          {["True", "False"].map((label, optionIndex) => (
                            <button
                              key={label}
                              type="button"
                              className={`nm-seg-btn${
                                question.answerIndex === optionIndex ? " is-active" : ""
                              }`}
                              aria-pressed={question.answerIndex === optionIndex}
                              disabled={saving}
                              onClick={() => patch(index, { answerIndex: optionIndex })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      {question.kind === "short" ? (
                        <>
                          <label className="nm-field nm-quiz-subfield">
                            <span className="nm-label">Model answer</span>
                            <textarea
                              className="nm-textarea"
                              rows={3}
                              aria-label={`Model answer for question ${index + 1}`}
                              value={question.modelAnswer}
                              disabled={saving}
                              onChange={(event) =>
                                patch(index, { modelAnswer: event.target.value })
                              }
                            />
                          </label>
                          <label className="nm-field nm-quiz-subfield">
                            <span className="nm-label">Key points · one per line</span>
                            <textarea
                              className="nm-textarea"
                              rows={3}
                              aria-label={`Key points for question ${index + 1}`}
                              value={question.keyPoints.join("\n")}
                              disabled={saving}
                              onChange={(event) => patchKeyPoints(index, event.target.value)}
                            />
                          </label>
                        </>
                      ) : null}

                      {question.source ? (
                        <p className="nm-gencard-source">
                          “{question.source}”
                          {question.page ? ` · p. ${question.page}` : ""}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      ) : null}
    </Modal>
  );
}
