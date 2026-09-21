from datetime import UTC, datetime


def local_path(value: str | None, *, default: str = "/") -> str:
    """Same-site redirect targets only: "/..." but never "//host"."""
    if not value or not value.startswith("/") or value.startswith("//"):
        return default
    return value


def to_ms(value: datetime | None) -> int | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return int(value.timestamp() * 1000)


def from_ms(value: int | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, tz=UTC)


def domain_of(url: str | None) -> str:
    """The host of a URL, without www; used for link titles."""
    if not url:
        return ""
    from urllib.parse import urlparse

    hostname = urlparse(url).hostname
    if hostname:
        return hostname.removeprefix("www.")
    return url.replace("https://", "").replace("http://", "").split("/")[0]
