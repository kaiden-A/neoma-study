"""Deterministic quiz questions from a note.

The generator reuses the flashcards' fact extraction (`cardgen`), then shapes
each fact into one of three quiz questions:

- ``mcq``: a definition question with other definitions as wrong options.
- ``true_false``: a grounded statement, or a clearly false one built by
  swapping in a dissimilar definition.
- ``short``: "Explain X." with the definition as the model answer and its
  clauses — or, when the definition is a single clause, its key terms — as the
  checklist the reader ticks after revealing it.

Conservative by design: a missing question is better than an invented one.
Subjective questions are only produced when the model answer yields at least
two usable key points. No database, settings or network here.
"""

from __future__ import annotations

import re

from ..schemas.study import QuizQuestion
from . import cardgen

KEY_POINT_SPLIT = re.compile(
    r"\s*(?:;|,|\band\b|\bor\b|\bthat\b|\bwhich\b)\s*",
    re.IGNORECASE,
)
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9'’-]{2,}")
SENTENCE_VERB_RE = re.compile(
    r"\b(is|are|was|were|means|refers|describes|consists|contains|includes|"
    r"causes|results|occurs|happens|depends|uses|has|have)\b",
    re.IGNORECASE,
)
DEFINITION_LEAD_RE = re.compile(
    r"^(is|are|refers to|means|consists|contains|includes|is caused|results|"
    r"occurs|happens)\b",
    re.IGNORECASE,
)
MAX_KEY_POINTS = 4
MIN_KEY_POINTS = 2
KEYWORD_STOPWORDS = cardgen.STOPWORDS | frozenset(
    {
        "across",
        "over",
        "into",
        "onto",
        "from",
        "within",
        "between",
        "through",
        "during",
        "before",
        "after",
        "against",
        "about",
        "around",
        "along",
        "toward",
        "towards",
        "upon",
        "per",
    }
)


def generate(
    body: str,
    *,
    file_text: str | None = None,
    highlights: list[tuple[int, str]] | None = None,
    objective: int = 8,
    subjective: int = 3,
) -> list[QuizQuestion]:
    """Return a mixed question set, objective first, best facts first."""
    asked = objective + subjective
    if asked <= 0:
        return []

    pool = cardgen.generate(
        body or "",
        file_text=file_text,
        highlights=highlights,
        limit=max(24, asked * 4),
    )
    facts = [draft for draft in pool if _usable_fact(draft)]
    if not facts:
        return []

    short_facts = [fact for fact in facts if _key_points(fact.back)]
    short_picks = short_facts[:subjective] if subjective > 0 else []
    used = {id(fact) for fact in short_picks}

    objective_facts = [fact for fact in facts if id(fact) not in used]
    objective_questions = _objective_questions(objective_facts, facts, objective)
    short_questions = [
        _short_question(fact) for fact in short_picks if len(_key_points(fact.back)) >= MIN_KEY_POINTS
    ]

    # A term quiz reads better when the two kinds alternate rather than
    # arriving as blocks of ten multiple-choice questions followed by three
    # written ones.
    questions: list[QuizQuestion] = []
    objective_index = 0
    short_index = 0
    while objective_index < len(objective_questions) or short_index < len(short_questions):
        if objective_index < len(objective_questions):
            questions.append(objective_questions[objective_index])
            objective_index += 1
        if short_index < len(short_questions):
            questions.append(short_questions[short_index])
            short_index += 1
    return questions


def _usable_fact(draft: cardgen.Draft) -> bool:
    if draft.kind != "basic" or not draft.term:
        return False
    value = draft.back.strip()
    if not (6 <= len(value) <= 500) or len(value.split()) < 2:
        return False
    if "http://" in value or "https://" in value:
        return False
    return bool(re.search(r"[A-Za-z]", value))


def _objective_questions(
    objective_facts: list[cardgen.Draft],
    all_facts: list[cardgen.Draft],
    count: int,
) -> list[QuizQuestion]:
    if count <= 0 or not objective_facts:
        return []

    # Wrong options and true/false partners may come from facts already used
    # for a short question; the question itself still uses each fact once.
    mcq_candidates = [(fact, _distractors(fact, all_facts)) for fact in objective_facts]
    tf_candidates = [(fact, _dissimilar_partner(fact, all_facts)) for fact in objective_facts]

    questions: list[QuizQuestion] = []
    used: set[int] = set()
    true_false_count = 0
    for slot in range(count):
        # Roughly one in three objective questions is true/false; if that kind
        # runs out, the other fills the slot.
        order = ("true_false", "mcq") if slot % 3 == 1 else ("mcq", "true_false")
        created: QuizQuestion | None = None
        for kind in order:
            if kind == "mcq":
                for fact, distractors in mcq_candidates:
                    if id(fact) in used or len(distractors) < 2:
                        continue
                    created = _mcq_question(fact, distractors)
                    used.add(id(fact))
                    break
            else:
                for fact, partner in tf_candidates:
                    if id(fact) in used:
                        continue
                    make_false = true_false_count % 2 == 1 and partner is not None
                    created = _true_false_question(fact, partner, make_false=make_false)
                    used.add(id(fact))
                    true_false_count += 1
                    break
            if created is not None:
                break
        if created is None:
            break
        questions.append(created)
    return questions


def _mcq_question(fact: cardgen.Draft, distractors: list[str]) -> QuizQuestion:
    answer = fact.back.strip()[:200]
    return QuizQuestion(
        kind="mcq",
        term=_term(fact),
        prompt=(fact.front.strip() or f"What is {_term(fact)}?")[:1000],
        options=[answer, *distractors],
        answerIndex=0,
        explanation=_explanation(fact),
        source=fact.source[:2000],
        page=fact.page,
    )


def _true_false_question(
    fact: cardgen.Draft, partner: cardgen.Draft | None, *, make_false: bool
) -> QuizQuestion:
    if make_false and partner is not None:
        statement = _statement(_term(fact), partner.back, source=None)
        answer_index = 1
        explanation = f"{_term(fact)}: {fact.back.strip()}"
    else:
        statement = _statement(_term(fact), fact.back, source=fact.source)
        answer_index = 0
        explanation = _explanation(fact)
    return QuizQuestion(
        kind="true_false",
        term=_term(fact),
        prompt=f"True or false: {statement}"[:1000],
        options=["True", "False"],
        answerIndex=answer_index,
        explanation=explanation[:1000],
        source=fact.source[:2000],
        page=fact.page,
    )


def _short_question(fact: cardgen.Draft) -> QuizQuestion:
    points = _key_points(fact.back)
    return QuizQuestion(
        kind="short",
        term=_term(fact),
        prompt=f"Explain {_term(fact)}."[:1000],
        modelAnswer=fact.back.strip()[:2000],
        keyPoints=points,
        explanation=_explanation(fact),
        source=fact.source[:2000],
        page=fact.page,
    )


def _explanation(fact: cardgen.Draft) -> str:
    source = fact.source.strip()
    if source and len(source) <= 1000:
        return source
    return f"{_term(fact)}: {fact.back.strip()}"[:1000]


def _statement(term: str, definition: str, *, source: str | None) -> str:
    value = definition.strip().rstrip(".")
    if source:
        original = source.strip().rstrip(".")
        if (
            original
            and term.lower() in original.lower()
            and SENTENCE_VERB_RE.search(original)
            and len(original) <= 400
        ):
            return original + "."
    if DEFINITION_LEAD_RE.match(value):
        return f"{term} {value}."
    first = value.split()[0].lower() if value else ""
    if len(first) >= 4 and first.endswith("s") and first not in cardgen.STOPWORDS:
        # Definitions such as "speeds a reaction ..." read as a predicate; the
        # preview lets the student fix the rare noun that slips through.
        return f"{term} {value}."
    return f"{term} is {value}."


def _term(fact: cardgen.Draft) -> str:
    term = (fact.term or "").strip(" .;:")
    if not term:
        return "this idea"
    lower = term.lower()
    for article in ("the ", "a ", "an "):
        if lower.startswith(article) and len(term) > len(article):
            return article + term[len(article) :]
    return term


def _key_points(answer: str) -> list[str]:
    """Clauses first; a single-clause definition falls back to its key terms."""
    text = answer.strip().rstrip(".")
    parts = [part.strip(" .;:") for part in KEY_POINT_SPLIT.split(text) if part.strip()]
    points: list[str] = []
    seen: set[str] = set()
    for part in parts:
        words = part.split()
        if not (2 <= len(words) <= 16) or len(part) < 6:
            continue
        key = _key(part)
        if key in seen:
            continue
        seen.add(key)
        points.append(part[:200])
        if len(points) == MAX_KEY_POINTS:
            break
    if len(points) >= MIN_KEY_POINTS:
        return points

    words = [
        word for word in WORD_RE.findall(text) if word.lower() not in KEYWORD_STOPWORDS and len(word) >= 4
    ]
    terms: list[str] = []
    seen_terms: set[str] = set()
    for word in words:
        key = word.lower()
        if key in seen_terms:
            continue
        seen_terms.add(key)
        terms.append(word[:80])
        if len(terms) == MAX_KEY_POINTS:
            break
    return terms if len(terms) >= MIN_KEY_POINTS else []


def _distractors(fact: cardgen.Draft, facts: list[cardgen.Draft], limit: int = 3) -> list[str]:
    answer = fact.back.strip()
    answer_key = _key(answer)
    candidates: list[str] = []
    for other in facts:
        if other is fact:
            continue
        value = other.back.strip()
        if not value or len(value) > 200 or _key(value) == answer_key:
            continue
        if _overlap(answer, value) >= 0.6:
            continue
        candidates.append(value)
    candidates.sort(key=lambda value: abs(len(value) - len(answer)))

    picked: list[str] = []
    seen = {answer_key}
    for value in candidates:
        key = _key(value)
        if key in seen:
            continue
        seen.add(key)
        picked.append(value[:200])
        if len(picked) == limit:
            break
    return picked


def _dissimilar_partner(fact: cardgen.Draft, facts: list[cardgen.Draft]) -> cardgen.Draft | None:
    for other in facts:
        if other is fact:
            continue
        if _key(other.back) == _key(fact.back):
            continue
        if _key(other.term or "") == _key(fact.term or ""):
            continue
        if _overlap(fact.back, other.back) < 0.45:
            return other
    return None


def _overlap(left: str, right: str) -> float:
    left_words = {word for word in WORD_RE.findall(left.lower()) if word not in cardgen.STOPWORDS}
    right_words = {word for word in WORD_RE.findall(right.lower()) if word not in cardgen.STOPWORDS}
    if not left_words or not right_words:
        return 0.0
    return len(left_words & right_words) / len(left_words | right_words)


def _key(value: str) -> str:
    return re.sub(r"[^\w\s]", "", re.sub(r"\s+", " ", value).strip().lower())
