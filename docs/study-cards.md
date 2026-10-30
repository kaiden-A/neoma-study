# Generated study cards

The note page can turn a note into flashcards without an API key. The rules
engine is deliberately conservative: a missing card is cheaper than a wrong
one. A preview step lets the reader drop or edit anything before it is saved.

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| `POST` | `/api/flashcards/generate` | Draft cards from a note; **never writes** |
| `POST` | `/api/flashcards/bulk` | Save the picked drafts in one commit |

Both take `noteId`; generate also takes `count` (1-30) and `refine` (reserved
for the Elpis pass), bulk takes up to 50 `cards`.

A draft is `{ front, back, kind, source, page, duplicate }`. `source` is the
note text the card came from, `page` comes from the extracted PDF/deck text,
and `duplicate` is computed against the caller's existing cards on that note.
Neither is stored on the flashcard row.

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

## AI refine (next phase)

The draft schema already carries `source` and `page` so an Elpis Agents API
pass can improve the question and add MCQ distractors **without ever changing
the answer**. The server will re-validate every returned `source` against the
note before showing it, and fall back to the rules drafts on any failure.
