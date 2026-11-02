import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.study import (
    GenerateQuizRequest,
    GenerateQuizResponse,
    QuizAttemptIn,
    QuizAttemptOut,
    QuizCreate,
    QuizOut,
    QuizSummaryOut,
)
from ..services import quiz_services

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


@router.get("", response_model=list[QuizSummaryOut])
def list_quizzes(
    noteId: str | None = Query(default=None),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[QuizSummaryOut]:
    return quiz_services.list_quizzes(db, user, note_id=noteId)


@router.post("/generate", response_model=GenerateQuizResponse)
def generate_quiz(
    data: GenerateQuizRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> GenerateQuizResponse:
    return quiz_services.generate_quiz(db, user, data)


@router.post("", response_model=QuizOut, status_code=201)
def create_quiz(
    data: QuizCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> QuizOut:
    return quiz_services.create_quiz(db, user, data)


@router.get("/{quiz_id}", response_model=QuizOut)
def get_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> QuizOut:
    return quiz_services.get_quiz(db, user, quiz_id)


@router.delete("/{quiz_id}", status_code=204)
def delete_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> None:
    quiz_services.delete_quiz(db, user, quiz_id)


@router.post("/{quiz_id}/attempts", response_model=QuizAttemptOut, status_code=201)
def submit_attempt(
    quiz_id: uuid.UUID,
    data: QuizAttemptIn,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> QuizAttemptOut:
    return quiz_services.submit_attempt(db, user, quiz_id, data)
