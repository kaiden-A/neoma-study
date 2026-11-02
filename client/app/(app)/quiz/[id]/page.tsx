"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState, Progress } from "@/components/ui/bits";
import { fmtRelative } from "@/lib/dates";
import { useStore } from "@/lib/store";
import type { Quiz, QuizAnswer, QuizAttempt, QuizQuestion } from "@/lib/types";

type Phase = "intro" | "run" | "done";
type AnswerState = { choice: number | null; text: string; covered: number[] };

const EMPTY_ANSWER: AnswerState = { choice: null, text: "", covered: [] };

function kindLabel(kind: QuizQuestion["kind"]): string {
  if (kind === "mcq") return "Multiple choice";
  if (kind === "true_false") return "True / false";
  return "Short answer";
}

function kindIcon(kind: QuizQuestion["kind"]): string {
  if (kind === "mcq") return "fa-list-check";
  if (kind === "true_false") return "fa-scale-balanced";
  return "fa-pen-nib";
}

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? "");
  const store = useStore();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await store.getQuiz(id);
        if (!alive) return;
        setQuiz(data);
        setStatus("ready");
      } catch {
        if (alive) setStatus("missing");
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [id, store]);

  const question = quiz?.questions[index] ?? null;
  const total = quiz?.questions.length ?? 0;
  const answer = answers[index] ?? EMPTY_ANSWER;
  const isObjective = question?.kind === "mcq" || question?.kind === "true_false";
  const correct = Boolean(
    question && isObjective && answer.choice !== null && answer.choice === question.answerIndex,
  );

  function start() {
    setPhase("run");
    setIndex(0);
    setAnswers({});
    setChecked(false);
    setRevealed(false);
    setAttempt(null);
    setError(null);
  }

  function choose(choice: number) {
    if (checked) return;
    setAnswers((current) => {
      const previous = current[index] ?? EMPTY_ANSWER;
      return { ...current, [index]: { ...previous, choice } };
    });
  }

  function write(text: string) {
    setAnswers((current) => {
      const previous = current[index] ?? EMPTY_ANSWER;
      return { ...current, [index]: { ...previous, text } };
    });
  }

  function togglePoint(point: number) {
    setAnswers((current) => {
      const previous = current[index] ?? EMPTY_ANSWER;
      const covered = previous.covered.includes(point)
        ? previous.covered.filter((value) => value !== point)
        : [...previous.covered, point];
      return { ...current, [index]: { ...previous, covered } };
    });
  }

  async function finish() {
    if (!quiz || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: QuizAnswer[] = quiz.questions.map((item, position) => {
        const current = answers[position] ?? EMPTY_ANSWER;
        return {
          index: position,
          choice: item.kind === "short" ? null : current.choice,
          text: item.kind === "short" ? current.text : "",
          covered: item.kind === "short" ? current.covered : [],
        };
      });
      const result = await store.submitQuizAttempt(quiz.id, payload);
      setAttempt(result);
      setQuiz((current) => (current ? { ...current, lastAttempt: result } : current));
      setPhase("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this attempt.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!quiz) return;
    if (index + 1 < quiz.questions.length) {
      setIndex(index + 1);
      setChecked(false);
      setRevealed(false);
      return;
    }
    void finish();
  }

  if (status === "loading") {
    return (
      <div className="nm-page">
        <EmptyState icon="fa-circle-question" title="Loading the quiz…" />
      </div>
    );
  }

  if (status === "missing" || !quiz) {
    return (
      <div className="nm-page">
        <EmptyState
          icon="fa-circle-question"
          title="That quiz is gone"
          body="It may have been deleted, or it belongs to someone else."
          action={
            <Link className="nm-btn nm-btn--secondary" href="/vault">
              Go to notes
            </Link>
          }
        />
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="nm-page">
        <div className="nm-page-head">
          <div className="nm-head-top">
            <span className="nm-eyebrow">
              Quiz · <span className="nm-mono">{quiz.questionCount} questions</span>
            </span>
          </div>
          <div className="nm-head-row">
            <h1 className="nm-title" id="page-title" tabIndex={-1}>
              {quiz.title}
            </h1>
          </div>
          <p className="nm-meta">
            From{" "}
            <Link className="nm-link" href={`/vault/${quiz.noteId}`}>
              {quiz.noteTitle ?? "a note"}
            </Link>
          </p>
        </div>

        <div className="nm-quiz-intro">
          <div className="nm-quiz-stats">
            <span className="nm-quiz-stat">
              <strong>{quiz.objectiveCount}</strong>
              <small>objective</small>
            </span>
            <span className="nm-quiz-stat">
              <strong>{quiz.writtenCount}</strong>
              <small>written</small>
            </span>
            <span className="nm-quiz-stat">
              <strong>{quiz.questionCount}</strong>
              <small>total</small>
            </span>
          </div>

          {quiz.lastAttempt ? (
            <p className="nm-meta">
              Last attempt: {quiz.lastAttempt.objectiveCorrect}/{quiz.lastAttempt.objectiveTotal} objective
              {" · "}
              {quiz.lastAttempt.writtenCovered}/{quiz.lastAttempt.writtenTotal} key points ·{" "}
              {fmtRelative(quiz.lastAttempt.createdAt)}
            </p>
          ) : (
            <p className="nm-meta">The score and key points are saved when you finish.</p>
          )}

          <p className="nm-help">
            Multiple choice and true/false are checked as you go. Written answers reveal a model answer and
            the key points to tick once you have written your own.
          </p>

          <button type="button" className="nm-btn nm-btn--primary" onClick={start}>
            <i className="fa-solid fa-play" aria-hidden="true" />
            Start quiz
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done" && attempt) {
    const attemptAnswers = new Map(attempt.answers.map((item) => [item.index, item]));
    return (
      <div className="nm-page">
        <div className="nm-page-head">
          <div className="nm-head-top">
            <span className="nm-eyebrow">Quiz complete</span>
          </div>
          <div className="nm-head-row">
            <h1 className="nm-title" id="page-title" tabIndex={-1}>
              {quiz.title}
            </h1>
          </div>
          <p className="nm-meta">
            From{" "}
            <Link className="nm-link" href={`/vault/${quiz.noteId}`}>
              {quiz.noteTitle ?? "a note"}
            </Link>
          </p>
        </div>

        <div className="nm-quiz-score">
          <div>
            <span className="nm-quiz-score-label">Objective</span>
            <strong>
              {attempt.objectiveCorrect} / {attempt.objectiveTotal}
            </strong>
          </div>
          <div>
            <span className="nm-quiz-score-label">Written key points</span>
            <strong>
              {attempt.writtenCovered} / {attempt.writtenTotal}
            </strong>
          </div>
        </div>

        <ol className="nm-quiz-review">
          {quiz.questions.map((item, position) => {
            const current = attemptAnswers.get(position);
            if (item.kind === "short") {
              const covered = new Set(current?.covered ?? []);
              return (
                <li className="nm-quiz-review-item" key={position}>
                  <div className="nm-quiz-review-top">
                    <span className="nm-mono nm-meta">{position + 1}</span>
                    <span className="nm-chip nm-chip--sm nm-chip--muted">{kindLabel(item.kind)}</span>
                    <span className="nm-meta">
                      {covered.size} / {item.keyPoints.length} key points
                    </span>
                  </div>
                  <p className="nm-quiz-review-prompt">{item.prompt}</p>
                  <p className="nm-meta">
                    Your answer: {current?.text?.trim() ? current.text : "Not answered"}
                  </p>
                  <div className="nm-quiz-model">
                    <p className="nm-label">Model answer</p>
                    <p>{item.modelAnswer}</p>
                    <ul className="nm-quiz-review-points">
                      {item.keyPoints.map((point, pointIndex) => (
                        <li key={pointIndex} className={covered.has(pointIndex) ? "is-covered" : ""}>
                          <i
                            className={`fa-solid ${
                              covered.has(pointIndex) ? "fa-circle-check" : "fa-circle"
                            }`}
                            aria-hidden="true"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            }

            const correctIndex = item.answerIndex ?? 0;
            const chosen = current?.choice ?? null;
            const isCorrect = chosen === correctIndex;
            return (
              <li className="nm-quiz-review-item" key={position}>
                <div className="nm-quiz-review-top">
                  <span className="nm-mono nm-meta">{position + 1}</span>
                  <span className="nm-chip nm-chip--sm nm-chip--muted">{kindLabel(item.kind)}</span>
                  <span className={`nm-chip nm-chip--sm ${isCorrect ? "nm-chip--ok" : "nm-chip--danger"}`}>
                    {isCorrect ? "Correct" : "Not quite"}
                  </span>
                </div>
                <p className="nm-quiz-review-prompt">{item.prompt}</p>
                <p className="nm-meta">
                  Your answer: {chosen === null ? "Not answered" : item.options[chosen]}
                </p>
                {!isCorrect ? (
                  <p className="nm-meta">Correct answer: {item.options[correctIndex]}</p>
                ) : null}
                {item.explanation ? <p className="nm-help">{item.explanation}</p> : null}
              </li>
            );
          })}
        </ol>

        <div className="nm-inline-actions nm-quiz-actions">
          <button type="button" className="nm-btn nm-btn--primary" onClick={start}>
            <i className="fa-solid fa-arrows-rotate" aria-hidden="true" />
            Retake quiz
          </button>
          <Link className="nm-btn nm-btn--secondary" href={`/vault/${quiz.noteId}`}>
            Back to note
          </Link>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="nm-page">
        <EmptyState icon="fa-circle-question" title="There are no questions in this quiz" />
      </div>
    );
  }

  return (
    <div className="nm-page">
      <div className="nm-page-head">
        <div className="nm-head-top">
          <span className="nm-eyebrow">
            Question <span className="nm-mono">{index + 1} / {total}</span>
          </span>
        </div>
        <div className="nm-head-row">
          <h1 className="nm-title" id="page-title" tabIndex={-1}>
            {quiz.title}
          </h1>
        </div>
      </div>

      <div className="nm-review-progress">
        <Progress
          pct={total ? Math.round((index / total) * 100) : 0}
          markerKey="violet"
          label="Quiz progress"
          large
        />
        <span className="nm-mono nm-meta">
          {index + 1} / {total}
        </span>
      </div>

      <article className={`nm-reviewcard${checked || revealed ? " is-revealed" : ""}`}>
        <div className="nm-reviewcard-top">
          <span className="nm-chip nm-chip--sm">
            <i className={`fa-solid ${kindIcon(question.kind)}`} aria-hidden="true" />
            {kindLabel(question.kind)}
          </span>
          {question.term ? (
            <span className="nm-chip nm-chip--sm nm-chip--muted">{question.term}</span>
          ) : null}
          <Link className="nm-chip nm-chip--sm nm-chip--link" href={`/vault/${quiz.noteId}`}>
            <i className="fa-solid fa-note-sticky" aria-hidden="true" />
            <span className="nm-chip-name">{quiz.noteTitle ?? "Note"}</span>
          </Link>
        </div>

        <p className="nm-reviewcard-front">{question.prompt}</p>

        {isObjective ? (
          <>
            <div className="nm-review-options" role="group" aria-label="Choose an answer">
              {question.options.map((option, optionIndex) => {
                const chosen = answer.choice === optionIndex;
                const isCorrect = checked && question.answerIndex === optionIndex;
                const isWrong = checked && chosen && question.answerIndex !== optionIndex;
                return (
                  <button
                    key={`${optionIndex}-${option}`}
                    type="button"
                    className={`nm-review-option${chosen ? " is-chosen" : ""}${
                      isCorrect ? " is-correct" : ""
                    }${isWrong ? " is-wrong" : ""}`}
                    disabled={checked}
                    onClick={() => choose(optionIndex)}
                  >
                    <span className="nm-mono nm-review-option-key">{optionIndex + 1}</span>
                    {option}
                  </button>
                );
              })}
            </div>
            {checked ? (
              <p className={`nm-review-feedback${correct ? " is-correct" : " is-wrong"}`} role="status">
                {correct
                  ? "Correct."
                  : `Not quite — the answer is “${question.options[question.answerIndex ?? 0]}”`}
              </p>
            ) : (
              <p className="nm-help">Pick the answer that fits, then check it.</p>
            )}
            {checked && question.explanation ? (
              <p className="nm-help">{question.explanation}</p>
            ) : null}
          </>
        ) : (
          <>
            <textarea
              className="nm-textarea nm-quiz-answer"
              rows={5}
              aria-label="Your answer"
              placeholder="Write your answer in your own words…"
              value={answer.text}
              disabled={revealed}
              onChange={(event) => write(event.target.value)}
            />
            {revealed ? (
              <div className="nm-quiz-model">
                <p className="nm-label">Model answer</p>
                <p>{question.modelAnswer}</p>
                <div className="nm-quiz-keypoints">
                  <p className="nm-label">Tick the key points you covered</p>
                  {question.keyPoints.map((point, pointIndex) => (
                    <label className="nm-check" key={pointIndex}>
                      <input
                        type="checkbox"
                        checked={answer.covered.includes(pointIndex)}
                        onChange={() => togglePoint(pointIndex)}
                      />
                      <span>{point}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="nm-help">
                Write what you remember first. The model answer and key points appear after you reveal
                them.
              </p>
            )}
          </>
        )}

      </article>

      {error ? <p className="nm-error">{error}</p> : null}

      {isObjective ? (
        <div className="nm-inline-actions nm-quiz-actions">
          {checked ? (
            <button type="button" className="nm-btn nm-btn--primary" onClick={next} disabled={busy}>
              <span>{index + 1 < total ? "Next question" : "Finish quiz"}</span>
            </button>
          ) : (
            <button
              type="button"
              className="nm-btn nm-btn--primary"
              onClick={() => setChecked(true)}
              disabled={answer.choice === null}
            >
              Check answer
            </button>
          )}
        </div>
      ) : (
        <div className="nm-inline-actions nm-quiz-actions">
          {revealed ? (
            <button type="button" className="nm-btn nm-btn--primary" onClick={next} disabled={busy}>
              <span>{index + 1 < total ? "Next question" : "Finish quiz"}</span>
              {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> : null}
            </button>
          ) : (
            <button type="button" className="nm-btn nm-btn--secondary" onClick={() => setRevealed(true)}>
              Show model answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
