# Generated study cards

The note page can turn a note into flashcards without an API key. The rules
engine is deliberately conservative: a missing card is cheaper than a wrong
one. A preview step lets the reader drop or edit anything before it is saved.

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| `POST` | `/api/flashcards/generate` | Draft cards from a note; **never writes** |
| `POST` | `/api/flashcards/bulk` | Save the picked drafts in one commit |

Both take `noteId`; generate also takes `count` (1-30), `refine` (the Elpis
pass) and `quiz` (multiple-choice mode), bulk takes up to 50 `cards`.

A draft is `{ front, back, kind, source, page, duplicate, distractors }`.
`source` is the note text the card came from, `page` comes from the extracted
PDF/deck text, and `duplicate` is computed against the caller's existing cards
on that note. None of those three is stored on the flashcard row;
`distractors` becomes the quiz options.

## What the rules engine reads

`app/services/cardgen.py` is pure and has no database dependency.

- `Term: meaning`, `Term — meaning` and `Term - meaning` lines.
- `X is/are/means/refers to/is defined as Y`, `X occurs when Y`,
  `X is caused by Y`, `X consists of Y`.
- Pipe tables: the header and separator are skipped; each data row's first
  two cells become one card.
- Cloze deletion when no definition shape matches: the most salient word
  (frequency across the note, length, bold in the source) is blanked with
  `___`.
- PDF highlights: the quote is treated as a high-value source, with its page.

It skips headings, code fences, images, URLs, questions, terms with digits,
pronouns, noise words ("note", "slide", "figure", ...), and lines without
letters. Results are deduped by question and by source, then ranked
(definitions > tables > cloze; highlights first) and capped at `count`.

## What it does not do

- No AI, no network, no cost.
- No multi-column tables (first two columns only).
- No joining of definitions across line breaks; student notes are
  line-shaped and joining produces worse cards.
- No math/LaTeX cloze; those lines are left alone.

## AI refine (optional)

The draft schema carries `source`, `page` and `distractors` so an Elpis
Agents API pass can improve the question and add quiz distractors **without
ever changing the answer**. The server re-validates every returned question:

- cloze cards must still contain exactly one `___`;
- basic-card questions must not contain the answer;
- distractors are de-duplicated, never equal the answer, and cap at three;
- a failed call, a timeout, malformed JSON or an unknown index falls back to
  the rules drafts with `refined: false`.

The client only shows the "Refine with Elpis" toggle when
`/api/bootstrap` reports `ai.refine`. Setup lives in `docs/elpis.md`.

## Quiz cards

`quiz: true` turns a draft into a multiple-choice card:

- Before the AI pass, the server fills `distractors` with up to three **other
  answers from the same batch**. That keeps quiz mode usable without a key.
- The AI refine replaces them with better wrong options when it is connected.
- On save, `options` is `[answer, ...distractors]`, shuffled, and
  `answer_index` points at the correct one. The answer itself still lives in
  `back`; the options are presentation only.
- Without `quiz`, any distractors are dropped and the card stays a flip or
  cloze card.

`/review` renders the options; picking one shows correct/wrong, keys `1-n`
pick an option, and Enter grades the card (`good` when correct, `again` when
wrong). Basic and cloze cards keep the reveal-and-grade flow. The schema change
is migration `94d323a0d272` (`kind`, `options`, `answer_index`).
