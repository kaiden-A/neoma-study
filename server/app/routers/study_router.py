from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.study import StudyOverview, StudySessionCreate, StudySessionOut
from ..services import study_services

router = APIRouter(prefix="/api/study", tags=["study"])


@router.get("/overview", response_model=StudyOverview)
def overview(user: User = Depends(require_user), db: DbSession = Depends(get_db)) -> StudyOverview:
    return study_services.overview(db, user)


@router.get("/sessions", response_model=list[StudySessionOut])
def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[StudySessionOut]:
    return study_services.list_sessions(db, user, limit=limit)


@router.post("/sessions", response_model=StudySessionOut, status_code=201)
def create_session(
    data: StudySessionCreate,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> StudySessionOut:
    return study_services.create_session(db, user, data)
