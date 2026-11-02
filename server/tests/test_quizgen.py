"""The quiz rules engine: shapes, limits and the no-answer-leak rule."""

from app.services import cardgen, quizgen

BODY = (
    "Entropy: a measure of disorder\n"
    "Enthalpy: heat content at constant pressure\n"
    "Osmosis: movement of water across a membrane\n"
    "Catalyst: speeds a reaction without being consumed\n"
    "Photosynthesis: the process that converts light into glucose\n"
    "Glycolysis: the first stage of respiration that breaks glucose into pyruvate"
)


def test_mixed_question_set() -> None:
    questions = quizgen.generate(BODY, objective=6, subjective=3)

    assert 0 < len(questions) <= 9
    kinds = {question.kind for question in questions}
    assert "mcq" in kinds
    assert "true_false" in kinds
    assert "short" in kinds
    for question in questions:
        assert question.prompt
        assert question.source
        if question.kind == "mcq":
            assert question.answerIndex == 0
            assert 2 <= len(question.options) <= 4
            assert len(set(question.options)) == len(question.options)
            assert all(option.strip() for option in question.options)
            assert question.options[0].lower() not in question.prompt.lower()
        if question.kind == "true_false":
            assert question.options == ["True", "False"]
            assert question.answerIndex in (0, 1)
            assert question.prompt.startswith("True or false: ")
        if question.kind == "short":
            assert question.prompt.startswith("Explain ")
            assert question.modelAnswer
            assert 2 <= len(question.keyPoints) <= 4


def test_true_and_false_statements_are_both_produced() -> None:
    questions = quizgen.generate(
        BODY,
        objective=6,
        subjective=0,
    )
    true_false = [question for question in questions if question.kind == "true_false"]
    assert len(true_false) >= 2
    assert {question.answerIndex for question in true_false} == {0, 1}
    false_question = next(question for question in true_false if question.answerIndex == 1)
    assert false_question.explanation
    assert false_question.explanation.lower() not in false_question.prompt.lower()


def test_short_uses_clauses_when_a_definition_has_them() -> None:
    questions = quizgen.generate(
        "Mitochondria: the organelle that produces ATP and stores calcium",
        objective=0,
        subjective=1,
    )
    assert len(questions) == 1
    short = questions[0]
    assert short.kind == "short"
    assert len(short.keyPoints) >= 2
    assert any("organelle" in point.lower() for point in short.keyPoints)


def test_short_falls_back_to_key_terms() -> None:
    questions = quizgen.generate(
        "Entropy: a measure of disorder",
        objective=0,
        subjective=1,
    )
    assert len(questions) == 1
    short = questions[0]
    assert short.kind == "short"
    assert {point.lower() for point in short.keyPoints} == {"measure", "disorder"}


def test_highlights_keep_their_page() -> None:
    questions = quizgen.generate(
        "",
        highlights=[(4, "Entropy is a measure of disorder.")],
        objective=1,
        subjective=1,
    )
    assert questions
    assert any(question.page == 4 for question in questions)


def test_empty_note_and_zero_counts_return_nothing() -> None:
    assert quizgen.generate("", objective=5, subjective=5) == []
    assert quizgen.generate("Entropy: a measure of disorder", objective=0, subjective=0) == []
    assert quizgen.generate("Entropy: a measure of disorder", objective=10, subjective=5) != []


def test_cardgen_exposes_the_term_without_changing_flashcards() -> None:
    drafts = cardgen.generate("Entropy: a measure of disorder")
    assert drafts
    assert drafts[0].term == "Entropy"
    assert drafts[0].front == "What is Entropy?"
