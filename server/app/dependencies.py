import httpx
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DbSession

from .config import Settings, get_settings
from .database import get_db
from .models import User
from .services import auth_services
from .services.storage_services import Storage, get_storage
from .services.zitadel import ZitadelClient


def current_user(
    request: Request,
    db: DbSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User | None:
    token = request.cookies.get(settings.session_cookie_name)
    return auth_services.session_user(db, token, settings=settings)


def require_user(user: User | None = Depends(current_user)) -> User:
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in.")
    return user


def get_zitadel(settings: Settings = Depends(get_settings)) -> ZitadelClient:
    return ZitadelClient(
        issuer=settings.zitadel_issuer.rstrip("/"),
        client_id=settings.zitadel_client_id,
        http=httpx.Client(timeout=10.0),
    )


__all__ = ["Storage", "current_user", "get_db", "get_storage", "get_zitadel", "require_user"]
