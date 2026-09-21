from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.notifications import MarkReadRequest, NotificationOut, SnoozeRequest
from ..services import notification_services

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[NotificationOut]:
    return notification_services.derive(db, user)


@router.post("/read", response_model=list[NotificationOut])
def mark_read(
    data: MarkReadRequest, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[NotificationOut]:
    notification_services.mark_read(db, user, data.ids)
    return notification_services.derive(db, user)


@router.post("/read-all", response_model=list[NotificationOut])
def mark_all_read(
    user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[NotificationOut]:
    notification_services.mark_all_read(db, user)
    return notification_services.derive(db, user)


@router.post("/snooze", response_model=list[NotificationOut])
def snooze(
    data: SnoozeRequest, user: User = Depends(require_user), db: DbSession = Depends(get_db)
) -> list[NotificationOut]:
    notification_services.snooze(db, user, data.id, minutes=data.minutes)
    return notification_services.derive(db, user)
