from fastapi import APIRouter, Depends

from ..dependencies import require_user
from ..models import User
from ..schemas.ai import AiStatusOut
from ..services import ai_services

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusOut)
def ai_status(_user: User = Depends(require_user)) -> AiStatusOut:
    """Which AI capabilities the client may show; no keys or ids leak."""
    return ai_services.status()
