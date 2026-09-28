from fastapi import APIRouter, Depends

from ..dependencies import require_user
from ..models import User
from ..schemas.links import LinkPreviewIn, LinkPreviewOut
from ..services import link_services

router = APIRouter(prefix="/api/links", tags=["links"])


@router.post("/preview", response_model=LinkPreviewOut)
def preview_link(data: LinkPreviewIn, _user: User = Depends(require_user)) -> LinkPreviewOut:
    return link_services.fetch_preview(data.url)
