"""The deterministic card extractor: shapes, filters, dedupe and ranking."""

from app.services.cardgen import generate


def fronts(drafts: list) -> list[str]:
    return [draft.front for draft in drafts]


def test_definition_lines_colon_and_dash() -> None:
    drafts = generate(
        "Mitochondria: powerhouse of the cell\n"
        "Entropy — a measure of disorder\n"
        "Osmosis - movement of water across a membrane",
        limit=10,
    )
    assert "What is Mitochondria?" in fronts(drafts)
    assert "What is Entropy?" in fronts(drafts)
    assert "What is Osmosis?" in fronts(drafts)
    assert all(draft.kind == "basic" for draft in drafts)


def test_sentence_definitions_and_articles() -> None:
    drafts = generate(
        "Entropy is a state function.\n"
        "Photosynthesis occurs when chlorophyll absorbs light.\n"
        "The rate of reaction is defined as the change in concentration over time.",
        limit=10,
    )
    found = {draft.front: draft for draft in drafts}
    assert found["What is Entropy?"].back == "a state function."
    assert found["When does Photosynthesis happen?"].back == "chlorophyll absorbs light."
    assert found["What is the rate of reaction?"].back == "the change in concentration over time."


def test_cloze_prefers_the_salient_term() -> None:
    drafts = generate("The mitochondria produces energy for the cell through respiration.", limit=3)
    assert len(drafts) == 1
    assert drafts[0].kind == "cloze"
    assert "___" in drafts[0].front
    assert drafts[0].back == "mitochondria"


def test_bold_term_becomes_a_cloze() -> None:
    drafts = generate("The **mitochondria** produces energy for the cell.", limit=3)
    assert len(drafts) == 1
    assert drafts[0].front == "The ___ produces energy for the cell."
    assert drafts[0].back == "mitochondria"


def test_pipe_tables_skip_the_header_row() -> None:
    drafts = generate(
        "| Term | Meaning |\n"
        "| --- | --- |\n"
        "| Entropy | A measure of disorder |\n"
        "| Enthalpy | Heat content at constant pressure |",
        limit=10,
    )
    assert fronts(drafts) == ["What is Entropy?", "What is Enthalpy?"]
    assert drafts[0].back == "A measure of disorder"


def test_file_text_carries_page_numbers() -> None:
    drafts = generate(
        "",
        file_text="--- page 4 ---\nOsmosis is the movement of water across a membrane.\n",
        limit=5,
    )
    assert len(drafts) == 1
    assert drafts[0].page == 4
    assert drafts[0].front == "What is Osmosis?"


def test_highlights_outrank_body_cards() -> None:
    drafts = generate(
        "The cell membrane controls what enters the cell.",
        highlights=[(7, "Entropy is a state function.")],
        limit=2,
    )
    assert drafts[0].front == "What is Entropy?"
    assert drafts[0].page == 7
    assert drafts[0].score == 12


def test_noise_questions_and_urls_are_ignored() -> None:
    assert generate("Note: remember this for the exam.", limit=5) == []
    assert generate("What is entropy?", limit=5) == []
    assert generate("See https://example.com for the reading.", limit=5) == []
    assert generate("# Week 5\n---", limit=5) == []


def test_numbered_terms_are_not_definitions() -> None:
    assert generate("Week 5: recap of entropy", limit=5) == []


def test_duplicate_fronts_are_removed() -> None:
    drafts = generate("Entropy: a measure of disorder\nEntropy: a measure of disorder", limit=10)
    assert len(drafts) == 1


def test_limit_and_definition_ranking() -> None:
    body = (
        "The mitochondria produces energy for the cell through respiration.\n"
        "Entropy: a measure of disorder\n"
        "Enthalpy: heat content at constant pressure\n"
    )
    drafts = generate(body, limit=2)
    assert len(drafts) == 2
    assert drafts[0].front == "What is Entropy?"
    assert drafts[1].front == "What is Enthalpy?"


def test_markdown_is_stripped_from_the_question() -> None:
    drafts = generate("**Entropy**: a measure of disorder", limit=2)
    assert drafts[0].front == "What is Entropy?"
    assert drafts[0].back == "a measure of disorder"
