"""Provider metadata for link notes (YouTube / Vimeo oEmbed).

Only an allowlist of video hosts is recognised, and the provider's public
oEmbed endpoint is called with the original URL as a *parameter*. The user's
URL is never fetched, so a saved link can never make the server request an
arbitrary host (SSRF). Any provider failure is swallowed: the preview is a
nice-to-have and a null result just falls back to the domain name.
"""

import logging
from urllib.parse import urlsplit

import httpx

from ..schemas.links import LinkPreviewOut

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 3.0

YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}
VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com"}
ALLOWED_HOSTS = YOUTUBE_HOSTS | VIMEO_HOSTS

YOUTUBE_OEMBED = "https://www.youtube.com/oembed"
VIMEO_OEMBED = "https://vimeo.com/api/oembed.json"

EMPTY = LinkPreviewOut(title=None, author=None, thumbnailUrl=None)


def _clean(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text[:limit] if text else None


def _endpoint_for(url: str) -> tuple[str, str] | None:
    """(endpoint, provider key) for an allowlisted video URL, else None."""
    try:
        parsed = urlsplit(url.strip())
    except ValueError:
        return None
    if parsed.scheme not in {"http", "https"}:
        return None
    host = (parsed.hostname or "").lower()
    if host in YOUTUBE_HOSTS:
        return YOUTUBE_OEMBED, "youtube"
    if host in VIMEO_HOSTS:
        return VIMEO_OEMBED, "vimeo"
    return None


def fetch_preview(url: str) -> LinkPreviewOut:
    """Best-effort title/author/thumbnail for a video link; nulls on anything."""
    resolved = _endpoint_for(url)
    if resolved is None:
        return EMPTY
    endpoint, provider = resolved
    params = {"url": url.strip(), "format": "json"} if provider == "youtube" else {"url": url.strip()}
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            response = client.get(endpoint, params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.info("oEmbed preview failed for %s: %s", provider, exc)
        return EMPTY
    if not isinstance(data, dict):
        return EMPTY
    return LinkPreviewOut(
        title=_clean(data.get("title"), 300),
        author=_clean(data.get("author_name"), 200),
        thumbnailUrl=_clean(data.get("thumbnail_url"), 1000),
    )


__all__ = ["ALLOWED_HOSTS", "EMPTY", "fetch_preview"]
