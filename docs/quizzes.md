# Quizzes

A note can be turned into a saved quiz with objective questions (multiple
choice and true/false) and written questions (short answer). The rules engine
is deterministic and conservative; an optional Elpis pass improves wording but
never changes a fact. The migration is `7a4c2e9b1f30` (`quizzes`,
`quiz_attempts`).

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| `POST` | `/api/quizzes/generate` | Draft questions from a note; **never writes** |
| `POST` | `/api/quizzes` | Save the previewed questions |
| `GET` | `/api/quizzes?noteId=` | Saved quiz summaries |
| `GET` | `/api/quizzes/{id}` | Full quiz plus the caller's last attempt |
| `DELETE` | `/api/quizzes/{id}` | Delete a quiz; attempts cascade |
| `POST` | `/api/quizzes/{id}/attempts` | Submit answers; the server scores them |

Quizzes belong to their creator. The note is resolved with
`note_services.require_note`, so a member can generate a quiz from a group note
they can read, but only the creator can open or delete that saved quiz. Deleting
a note cascades its quizzes and their attempts.

## Shape

```json
{
  "kind": "mcq | true_false | short",
  "term": "Entropy",
  "prompt": "What is entropy?",
  "options": ["A measure of disorder", "..."],
  "answerIndex": 0,
  "modelAnswer": "",
  "keyPoints": [],
  "explanation": "Entropy: a measure of disorder",
  "source": "Entropy: a measure of disorder",
  "page": null
}
```

MCQ and true/false use `options` + `answerIndex`. A true/false question always
has `["True", "False"]`. Short answer uses `modelAnswer` + `keyPoints`; the
schema requires at least two key points. MCQ options are shuffled when the quiz
is saved, and `answerIndex` is updated to follow the correct option.

Attempt answers are `{ index, choice, text, covered }`:

- `choice` is the selected option index for MCQ/true-false.
- `text` is the written answer (stored for review, not auto-marked).
- `covered` is the list of key-point indexes the reader ticked after revealing
  the model answer.

## Generator

`app/services/quizgen.py` is pure and reuses `cardgen`'s definition, table and
highlight extraction. `cardgen.Draft` now carries the `term` the fact is about;
flashcards ignore it.

- **MCQ**: the fact's question and answer, with other facts' definitions as
  distractors. Similar definitions are filtered out; at least two distractors
  are required.
- **True/false**: a true statement from the fact, or a false one built by
  swapping in a dissimilar definition. The explanation gives the correction.
  True and false alternate.
- **Short**: “Explain {term}.” with the definition as the model answer. Key
  points are the definition's clauses when it has them; a single-clause
  definition falls back to its key terms. At least two points are required.

Subjective counts, objective counts and the total are capped at 30; when the
note cannot supply enough questions the response includes a `notice` and the
preview shows fewer. Headings, questions, URLs, pronouns and digit-bearing terms
are skipped, matching the flashcard rules.

## Scoring

The server scores from the stored questions, never from a client-supplied score:

- objective: `choice === answerIndex`;
- short: the number of unique, valid `covered` indexes against `keyPoints`.

Unanswered objective questions count wrong; unanswered written questions count
zero. Each attempt stores the raw answers, `objectiveCorrect`, `objectiveTotal`,
`writtenCovered` and `writtenTotal`. `GET /api/quizzes/{id}` returns the latest
attempt so the intro screen can show the previous result.

There is no AI grading. The reader ticks the key points they actually covered;
the UI labels the written score as key points, not a combined percentage.

## Elpis refine

`POST /api/quizzes/generate` with `refine: true` calls
`ai_services.refine_quiz` when `/api/bootstrap` reports `ai.refine`. The pass:

- improves MCQ prompts and proposes 2–3 wrong options;
- improves short-answer prompts only;
- leaves true/false questions alone;
- requires the question to keep its `term`, so the subject cannot be swapped;
- rejects a prompt that contains the answer, model answer or a duplicate option;
- falls back to the rules drafts with a notice on any failure or missing key.

## Client

- The note page has a **Quizzes** card after Flashcards; **Generate quiz** opens
  `GenerateQuizModal`, which previews and edits the drafts before saving.
- `/quiz/[id]` is the player: one question at a time, objective feedback
  immediately, written answers revealed against the model answer and key-point
  checklist, then a results screen with a retake.
- `/quiz` is in `proxy.ts`'s protected list and is disallowed in `robots.ts`.
- Store: `quizzes` summaries arrive in `/api/bootstrap`; the player fetches the
  full quiz with `store.getQuiz`; delete is optimistic.
