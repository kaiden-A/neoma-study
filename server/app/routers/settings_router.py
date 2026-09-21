from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.settings import UserSettings, UserSettingsPatch
from ..services import settings_services

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=UserSettings)
def get_settings(user: User = Depends(require_user)) -> UserSettings:
    return settings_services.read_settings(user)


@router.patch("", response_model=UserSettings)
def patch_settings(
    patch: UserSettingsPatch,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> UserSettings:
    return settings_services.update_settings(db, user, patch)
