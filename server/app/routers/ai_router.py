from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DbSession

from ..database import get_db
from ..dependencies import require_user
from ..models import User
from ..schemas.ai import AiStatusOut, ChatRequest
from ..services import ai_services
from ..services.errors import UnavailableError

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/status", response_model=AiStatusOut)
def ai_status(_user: User = Depends(require_user)) -> AiStatusOut:
    """Which AI capabilities the client may show; no keys or ids leak."""
    return ai_services.status()


@router.post("/chat")
def chat(
    data: ChatRequest,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> StreamingResponse:
    """Stream a read-only assistant reply over SSE."""
    if not ai_services.chat_ready():
        raise UnavailableError("The assistant is not connected yet.")
    context = ai_services.build_context(db, user, data.context)
    return StreamingResponse(
        ai_services.chat_stream(data.messages, context=context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
