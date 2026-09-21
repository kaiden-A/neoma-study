from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session as DbSession

from ..database import get_db

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health(db: DbSession = Depends(get_db)) -> dict[str, str]:
    db.execute(text("select 1"))
    return {"status": "ok"}
