import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.study import FlashcardCreate, FlashcardOut, FlashcardPatch, GradeRequest
from ..services import flashcard_services

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("", response_model=list[FlashcardOut])
def list_flashcards(
    noteId: str | None = Query(default=None),
    due: bool = Query(default=False),
    limit: int | None = Query(default=None, ge=1, le=200),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[FlashcardOut]:
    return flashcard_services.list_cards(db, user, note_id=noteId, due_only=due, limit=limit)


@router.post("", response_model=FlashcardOut, status_code=201)
def create_flashcard(
    data: FlashcardCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> FlashcardOut:
    return flashcard_services.create_card(db, user, data)


@router.patch("/{card_id}", response_model=FlashcardOut)
def update_flashcard(
    card_id: uuid.UUID,
    patch: FlashcardPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> FlashcardOut:
    return flashcard_services.update_card(db, user, card_id, patch)


@router.delete("/{card_id}", status_code=204)
def delete_flashcard(
    card_id: uuid.UUID, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> None:
    flashcard_services.delete_card(db, user, card_id)


@router.post("/{card_id}/grade", response_model=FlashcardOut)
def grade_flashcard(
    card_id: uuid.UUID,
    data: GradeRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> FlashcardOut:
    return flashcard_services.grade_card(db, user, card_id, data.grade)
