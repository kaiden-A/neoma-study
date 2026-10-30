"""Deterministic study cards from a note, with no model in the loop.

The extractor is deliberately conservative: a card is only produced when the
text has a recognisable definition shape (``Term: meaning``, ``Term — meaning``,
``X is Y``) or a sentence with a salient term worth blanking. Everything else is
left alone, because a bad card costs more attention than a missing one.

The output is a draft: the client previews and edits it before saving, so the
rules can stay simple and predictable. Phase 2 adds an optional AI refine pass
that may rewrite the question but never the answer.

Pure functions only - no database, no settings, no network.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Literal

CardKind = Literal["basic", "cloze"]

PAGE_RE = re.compile(r"^--- page (\d+) ---\s*$")
FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")
HTML_RE = re.compile(r"<[^>]+>")
BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
CHECKBOX_RE = re.compile(r"^\[[ xX]\]\s+")
HEADING_RE = re.compile(r"^\s*#{1,6}\s+")
QUOTE_RE = re.compile(r"^\s*>\s?")
TABLE_RULE_RE = re.compile(r"^\s*\|?[\s:|-]+\|[\s:|-]*$")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|;\s+")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'’-]{3,}")
BOLD_RE = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")

STOPWORDS = frozenset(
    """
    about above after again against all almost along also although always among another any
    anything are around back because been before being below between both but came can cannot
    could did does doing done down during each either else enough even ever every few first
    for found from further gets give given goes going gone got had has have having here how
    however into its itself just keep kept know known last later least less let like likely
    made make many may maybe mean might more most much must near need never next none nor not
    now off often once only other our out over own part per perhaps put quite rather really
    same saw say says see seem seems seen several shall should show shown since some still
    such take taken than that the their them then there these they thing think this those
    though through thus time together too toward under until upon used uses using very want
    was way well went were what when where whether which while who whole why will with within
    without would yet you your
    """.split()  # noqa: SIM905 - a readable block beats a 150-item list literal
)

NOISE_TERMS = frozenset(
    """
    answer chapter example figure important lecture note notes question recap remember slide
    slides summary table week
    """.split()  # noqa: SIM905
)

PRONOUN_TERMS = frozenset(
    "it its this that these those they them their there here we you your he she his her".split()  # noqa: SIM905
)

ARTICLES = ("the ", "a ", "an ")

DEFINITION_VERBS: tuple[tuple[str, str], ...] = (
    ("is defined as", "What is {term}?"),
    ("refers to", "What is {term}?"),
    ("describes", "What is {term}?"),
    ("means", "What is {term}?"),
    ("consists of", "What does {term} consist of?"),
    ("contains", "What does {term} contain?"),
    ("includes", "What does {term} include?"),
    ("is caused by", "What causes {term}?"),
    ("results from", "What causes {term}?"),
    ("occurs when", "When does {term} happen?"),
    ("happens when", "When does {term} happen?"),
    ("are", "What are {term}?"),
    ("is", "What is {term}?"),
)

SEPARATOR_RE = re.compile(r"\s+[—–]\s+|\s+-\s+|:\s+")


@dataclass(frozen=True)
class Draft:
    """One proposed card. `source` is the note text it came from."""

    front: str
    back: str
    kind: CardKind
    source: str
    page: int | None = None
    score: int = 0
    order: int = 0


def generate(
    body: str,
    *,
    file_text: str | None = None,
    highlights: list[tuple[int, str]] | None = None,
    limit: int = 10,
) -> list[Draft]:
    """Return at most `limit` distinct cards, best first."""
    if limit <= 0:
        return []

    units = _units(body or "")
    if file_text:
        units.extend(_file_units(file_text))

    frequency = _frequency(body or "", file_text or "")
    candidates: list[Draft] = []
    order = 0

    for text, source, page in units:
        for draft in _from_unit(text, source, page, frequency, order):
            candidates.append(draft)
            order += 1

    for page, quote in highlights or []:
        for draft in _from_highlight(quote, page, frequency, order):
            candidates.append(draft)
            order += 1

    return _rank(candidates, limit)


def _units(text: str) -> list[tuple[str, str, int | None]]:
    """Strip Markdown into (clean text, source text, page) lines.

    Each non-empty line is its own unit. Student notes - especially slide
    dumps - are line-shaped, and joining lines produces fake sentences that
    make worse cards than missing a definition that spans a line break.
    """
    text = FENCE_RE.sub("\n", text)
    text = IMAGE_RE.sub("", text)
    text = LINK_RE.sub(r"\1", text)
    text = HTML_RE.sub("", text)

    lines = text.splitlines()
    units: list[tuple[str, str, int | None]] = []
    index = 0
    while index < len(lines):
        source = lines[index].strip()

        # A pipe table: header, separator, then data rows. Only the first two
        # columns become cards; the header itself must not become one.
        if (
            source.startswith("|")
            and index + 1 < len(lines)
            and TABLE_RULE_RE.match(lines[index + 1].strip())
        ):
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                row = lines[index].strip()
                cells = [cell.strip(" .") for cell in row.strip("|").split("|")]
                if len(cells) >= 2 and cells[0] and cells[1]:
                    units.append((f"{cells[0]} | {cells[1]}", row, None))
                index += 1
            continue

        index += 1
        if not source or PAGE_RE.match(source) or source in {"---", "***", "___"}:
            continue
        if TABLE_RULE_RE.match(source) or HEADING_RE.match(source):
            continue
        line = BULLET_RE.sub("", source)
        line = QUOTE_RE.sub("", line)
        line = CHECKBOX_RE.sub("", line)
        line = _strip_emphasis(line).strip()
        if not line or not re.search(r"[A-Za-z]", line):
            continue
        units.append((line, source, None))
    return units


def _file_units(text: str) -> list[tuple[str, str, int | None]]:
    units: list[tuple[str, str, int | None]] = []
    page: int | None = None
    for raw in text.splitlines():
        marker = PAGE_RE.match(raw.strip())
        if marker:
            page = int(marker.group(1))
            continue
        source = raw.strip()
        if not source or len(source) < 8:
            continue
        line = _strip_emphasis(BULLET_RE.sub("", source)).strip()
        if not line or not re.search(r"[A-Za-z]", line):
            continue
        units.append((line, source, page))
    return units


def _from_unit(
    text: str,
    source: str,
    page: int | None,
    frequency: Counter[str],
    order: int,
) -> list[Draft]:
    drafts: list[Draft] = []
    used_sentences: set[str] = set()

    # Table rows arrive as pipe-separated text after the bullet strip.
    if "|" in text:
        table = _table(text, source, page, order)
        if table:
            return table

    definition = _definition_line(text, source, page, order)
    if definition:
        drafts.append(definition)
        used_sentences.add(_key(text))

    for sentence in _sentences(text):
        if _key(sentence) in used_sentences:
            continue
        sent_def = _sentence_definition(sentence, source, page, order + len(drafts))
        if sent_def:
            drafts.append(sent_def)
            used_sentences.add(_key(sentence))
            continue
        cloze = _cloze(sentence, source, page, frequency, order + len(drafts))
        if cloze:
            drafts.append(cloze)

    return drafts


def _from_highlight(quote: str, page: int, frequency: Counter[str], order: int) -> list[Draft]:
    text = _strip_emphasis(IMAGE_RE.sub("", LINK_RE.sub(r"\1", quote))).strip()
    if not text:
        return []
    drafts: list[Draft] = []
    line = _definition_line(text, text, page, order, score=12)
    if line:
        drafts.append(line)
    for sentence in _sentences(text):
        definition = _sentence_definition(sentence, text, page, order, score=12)
        if definition:
            drafts.append(definition)
            continue
        cloze = _cloze(sentence, text, page, frequency, order, score=11, min_words=4)
        if cloze:
            drafts.append(cloze)
    return drafts


def _definition_line(
    text: str, source: str, page: int | None, order: int, *, score: int = 10
) -> Draft | None:
    """``Term: meaning`` / ``Term — meaning`` / ``Term - meaning``."""
    match = SEPARATOR_RE.search(text)
    if not match:
        return None
    term = text[: match.start()].strip(" .;:")
    meaning = text[match.end() :].strip()
    if not _good_term(term) or not _good_definition(meaning):
        return None
    front = f"What is {_question_term(term)}?"
    if len(front) > 300:
        return None
    return Draft(
        front=front,
        back=meaning[:500],
        kind="basic",
        source=source,
        page=page,
        score=score,
        order=order,
    )


def _sentence_definition(
    sentence: str,
    source: str,
    page: int | None,
    order: int,
    *,
    score: int = 9,
) -> Draft | None:
    if "?" in sentence or len(sentence) < 12:
        return None
    for verb, question in DEFINITION_VERBS:
        pattern = re.compile(rf"^(?P<term>.+?)\s+{verb}\s+(?P<body>.+)$", re.IGNORECASE)
        match = pattern.match(sentence)
        if not match:
            continue
        term = match.group("term").strip(" .,:;")
        body = match.group("body").strip(" ;")
        if not _good_term(term) or not _good_definition(body):
            return None
        front = question.format(term=_question_term(term))
        if len(front) > 300:
            return None
        return Draft(
            front=front,
            back=body[:500],
            kind="basic",
            source=source,
            page=page,
            score=score,
            order=order,
        )
    return None


def _cloze(
    sentence: str,
    source: str,
    page: int | None,
    frequency: Counter[str],
    order: int,
    *,
    score: int = 5,
    min_words: int = 6,
) -> Draft | None:
    words = sentence.split()
    if not (min_words <= len(words) <= 50) or "?" in sentence:
        return None

    bold = BOLD_RE.search(source)
    if bold:
        term = (bold.group(1) or bold.group(2) or "").strip()
        if 3 <= len(term) <= 60 and term.lower() in sentence.lower():
            front = _blank(sentence, term)
            if front:
                return Draft(
                    front=front,
                    back=term,
                    kind="cloze",
                    source=source,
                    page=page,
                    score=score + 3,
                    order=order,
                )

    choices: list[tuple[int, str]] = []
    for word in WORD_RE.findall(sentence):
        lower = word.lower()
        if lower in STOPWORDS or lower in NOISE_TERMS or len(lower) < 5:
            continue
        if sentence.count(word) != 1:
            continue
        choices.append((len(lower) + frequency.get(lower, 0) * 3, word))
    if not choices:
        return None

    choices.sort(reverse=True)
    term = choices[0][1]
    front = _blank(sentence, term)
    if not front:
        return None
    return Draft(
        front=front,
        back=term,
        kind="cloze",
        source=source,
        page=page,
        score=score,
        order=order,
    )


def _table(text: str, source: str, page: int | None, order: int) -> list[Draft]:
    cells = [cell.strip() for cell in text.strip().strip("|").split("|")]
    if len(cells) < 2:
        return []
    label = cells[0].strip(" .:")
    if not label or len(label) > 80:
        return []
    value = cells[1].strip(" .")
    if not _good_definition(value):
        return []
    front = f"What is {_question_term(label)}?"
    if len(front) > 300:
        return []
    return [
        Draft(
            front=front,
            back=value[:500],
            kind="basic",
            source=source,
            page=page,
            score=7,
            order=order,
        )
    ]


def _rank(candidates: list[Draft], limit: int) -> list[Draft]:
    seen_fronts: set[str] = set()
    seen_sources: set[str] = set()
    kept: list[Draft] = []
    for draft in sorted(candidates, key=lambda item: (-item.score, item.order)):
        front_key = _key(draft.front)
        source_key = _key(draft.source)
        if front_key in seen_fronts or source_key in seen_sources:
            continue
        if not _valid(draft):
            continue
        seen_fronts.add(front_key)
        seen_sources.add(source_key)
        kept.append(draft)
        if len(kept) >= limit:
            break
    return kept


def _valid(draft: Draft) -> bool:
    if not (5 <= len(draft.front) <= 300) or not (1 <= len(draft.back) <= 500):
        return False
    if "http://" in draft.source or "https://" in draft.source:
        return False
    return bool(re.search(r"[A-Za-z]", draft.back))


def _sentences(text: str) -> list[str]:
    parts = [part.strip() for part in SENTENCE_SPLIT_RE.split(text) if part.strip()]
    return [part for part in parts if len(part) >= 8]


def _strip_emphasis(value: str) -> str:
    value = BOLD_RE.sub(lambda match: match.group(1) or match.group(2) or "", value)
    value = re.sub(r"(?<!\w)\*([^*]+)\*(?!\w)", r"\1", value)
    value = re.sub(r"~~([^~]+)~~", r"\1", value)
    value = re.sub(r"`([^`]+)`", r"\1", value)
    return value


def _blank(sentence: str, term: str) -> str | None:
    pattern = re.compile(rf"(?<!\w){re.escape(term)}(?!\w)")
    if not pattern.search(sentence):
        return None
    front = pattern.sub("___", sentence, count=1).strip()
    if "___" not in front or len(front) > 300:
        return None
    return front


def _good_term(term: str) -> bool:
    term = term.strip()
    if not (1 <= len(term) <= 70):
        return False
    words = term.split()
    if not (1 <= len(words) <= 7):
        return False
    lower = term.lower().strip(" .,:;")
    if lower in PRONOUN_TERMS or lower in NOISE_TERMS or lower in STOPWORDS:
        return False
    if lower.startswith(("figure ", "table ", "chapter ", "week ", "slide ")):
        return False
    if any(char.isdigit() for char in term):
        return False
    if "?" in term or "!" in term:
        return False
    return bool(re.search(r"[A-Za-z]", term))


def _good_definition(value: str) -> bool:
    value = value.strip()
    if not (6 <= len(value) <= 500):
        return False
    if len(value.split()) < 2:
        return False
    if "http://" in value or "https://" in value:
        return False
    return bool(re.search(r"[A-Za-z]", value))


def _question_term(term: str) -> str:
    """Lowercase a leading article, but keep proper nouns and acronyms intact."""
    lower = term.lower()
    for article in ARTICLES:
        if lower.startswith(article) and len(term) > len(article):
            return article + term[len(article) :]
    return term


def _frequency(body: str, file_text: str) -> Counter[str]:
    return Counter(
        word.lower() for word in WORD_RE.findall(f"{body}\n{file_text}") if word.lower() not in STOPWORDS
    )


def _key(value: str) -> str:
    return re.sub(r"[^\w\s]", "", re.sub(r"\s+", " ", value).strip().lower())
