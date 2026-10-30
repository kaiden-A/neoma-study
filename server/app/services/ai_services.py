"""Optional AI refine through Elpis (our LibreChat deployment).

The Agents API is OpenAI-compatible: POST {base}/chat/completions with the
agent id in `model`. We send it the grounded cards produced by `cardgen` and
accept only a rewritten question plus wrong quiz options. The answer is never
model-written, and any failure falls back to the rules cards, so generation
never depends on Elpis being reachable.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

import httpx
from pydantic import BaseModel, Field

from ..config import Settings, get_settings
from ..schemas.ai import AiStatusOut
from ..schemas.study import FlashcardDraft

log = logging.getLogger(__name__)

MAX_CONTEXT = 500
MAX_DISTRACTORS = 3

SYSTEM_PROMPT = """\
You are a study-card editor inside Neoma. You receive cards extracted by a
rules engine from a student's note. Improve the question wording without
changing the fact being tested.

Rules:
- Never change, contradict, or extend the answer.
- For kind="cloze", keep exactly one "___" where the answer belongs.
- For kind="basic", do not put the answer text in the question.
- Add 2-3 short, plausible but clearly wrong quiz options. Never include the
  answer or a paraphrase of it.
- Keep the student's language and technical terms. One fact per card.
- No yes/no questions, no preamble, no markdown.
Return only this JSON shape:
{"cards":[{"index":0,"front":"...","distractors":["...","...","..."]}]}
"""


class _RefinedCard(BaseModel):
    index: int = Field(ge=0, le=99)
    front: str = Field(default="", max_length=400)
    distractors: list[str] = Field(default_factory=list, max_length=6)


class _RefinePayload(BaseModel):
    cards: list[_RefinedCard] = Field(default_factory=list)


@dataclass(frozen=True)
class RefineResult:
    cards: list[FlashcardDraft]
    refined: bool
    configured: bool


def status() -> AiStatusOut:
    settings = get_settings()
    return AiStatusOut(
        configured=settings.ai_refine_configured or settings.ai_chat_configured,
        refine=settings.ai_refine_configured,
        chat=settings.ai_chat_configured,
    )


def refine_cards(cards: list[FlashcardDraft], *, note_title: str) -> RefineResult:
    """Rewrite the questions through Elpis; keep the rules cards on any failure."""
    settings = get_settings()
    if not settings.ai_refine_configured or not cards:
        return RefineResult(cards=cards, refined=False, configured=settings.ai_refine_configured)

    try:
        raw = _post(settings, cards, note_title)
        payload = _RefinePayload.model_validate(_json_object(_message_content(raw)))
        updated, changed = _apply(cards, payload)
    except Exception as exc:  # noqa: BLE001 - any upstream failure is a fallback
        log.warning("Elpis card refine failed: %s", exc)
        return RefineResult(cards=cards, refined=False, configured=True)
    return RefineResult(cards=updated, refined=changed, configured=True)


def _post(settings: Settings, cards: list[FlashcardDraft], note_title: str) -> object:
    body = {
        "model": settings.librechat_refine_agent_id,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "noteTitle": note_title[:200],
                        "cards": [
                            {
                                "index": index,
                                "kind": card.kind,
                                "front": card.front[:300],
                                "answer": card.back[:MAX_CONTEXT],
                                "source": card.source[:MAX_CONTEXT],
                            }
                            for index, card in enumerate(cards)
                        ],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        "temperature": 0.2,
        "stream": False,
    }
    endpoint = f"{settings.librechat_base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {settings.librechat_api_key}"}
    with httpx.Client(timeout=settings.librechat_timeout_seconds) as client:
        response = client.post(endpoint, json=body, headers=headers)
        response.raise_for_status()
        return response.json()


def _message_content(data: object) -> str:
    if not isinstance(data, dict):
        raise ValueError("response is not an object")
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("response has no choices")
    first = choices[0]
    message = first.get("message") if isinstance(first, dict) else None
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    raise ValueError("response has no message content")


def _json_object(content: str) -> dict:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")
    return data


def _apply(cards: list[FlashcardDraft], payload: _RefinePayload) -> tuple[list[FlashcardDraft], bool]:
    updated = list(cards)
    changed = False
    for item in payload.cards:
        if not (0 <= item.index < len(updated)):
            continue
        current = updated[item.index]
        front = " ".join(item.front.split()).strip()
        if not _good_front(current, front):
            continue
        distractors = _distractors(item.distractors, current.back)
        if front == current.front and distractors == current.distractors:
            continue
        updated[item.index] = current.model_copy(update={"front": front, "distractors": distractors})
        changed = True
    return updated, changed


def _good_front(current: FlashcardDraft, front: str) -> bool:
    if not (8 <= len(front) <= 300):
        return False
    if "{{" in front or "}}" in front:
        return False
    if current.kind == "cloze":
        return "___" in front
    answer = _key(current.back)
    return not (len(answer) >= 4 and answer in _key(front))


def _distractors(values: list[str], answer: str) -> list[str]:
    seen = {_key(answer)}
    out: list[str] = []
    for value in values:
        text = " ".join(value.split()).strip(" .")
        key = _key(text)
        if not text or len(text) > 120 or key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= MAX_DISTRACTORS:
            break
    return out


def _key(value: str) -> str:
    return re.sub(r"[^\w\s]", "", re.sub(r"\s+", " ", value).strip().lower())
