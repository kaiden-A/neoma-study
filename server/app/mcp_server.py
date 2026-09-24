"""The MCP server, mounted at /mcp.

Accepts the owner's static MCP_API_KEY, and also validates Zitadel access
tokens (issuer + JWKS signature), mapping their subject to a member through
(idp_issuer, zitadel_sub), so OAuth-capable MCP hosts can sign users in.
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import anyio
import jwt
from mcp.server import MCPServer
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken, TokenVerifier
from mcp.server.auth.settings import AuthSettings
from mcp.server.context import CallNext, HandlerResult, ServerRequestContext
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent
from pydantic import AnyHttpUrl
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from starlette.applications import Starlette
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from .config import get_settings
from .database import SessionLocal
from .models import User, UserKind

settings = get_settings()

# Tests point this at a session bound to the throwaway test schema.
_session_factory = SessionLocal
_jwks_client: jwt.PyJWKClient | None = None


def get_session() -> DbSession:
    return _session_factory()


def _owner(db: DbSession) -> User | None:
    email = settings.mcp_owner_email.strip().lower()
    if not email:
        return None
    return db.scalar(
        select(User).where(User.email == email, User.kind == UserKind.member, User.deleted_at.is_(None))
    )


def _jwks() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(settings.mcp_jwks_endpoint)
    return _jwks_client


def _access(user: User, token: str) -> AccessToken:
    return AccessToken(
        token=token,
        client_id=str(user.id),
        scopes=[],
        resource=settings.mcp_resource_url,
        subject=str(user.id),
    )


class AppTokenVerifier(TokenVerifier):
    """The owner's static key, or an IdP JWT that maps to a member."""

    async def verify_token(self, token: str) -> AccessToken | None:
        expected = settings.mcp_api_key
        if expected and secrets.compare_digest(token.encode(), expected.encode()):
            return await anyio.to_thread.run_sync(self._owner_access, token)
        return await anyio.to_thread.run_sync(self._member_access, token)

    def _owner_access(self, token: str) -> AccessToken | None:
        with get_session() as db:
            user = _owner(db)
        return _access(user, token) if user is not None else None

    def _member_access(self, token: str) -> AccessToken | None:
        audience = settings.mcp_audience.strip()
        try:
            signing_key = _jwks().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=settings.zitadel_issuer.rstrip("/"),
                audience=audience or None,
                options={"require": ["exp", "sub"], "verify_aud": bool(audience)},
            )
        except jwt.PyJWTError:
            return None

        subject = claims.get("sub")
        if not subject:
            return None
        with get_session() as db:
            user = db.scalar(
                select(User).where(
                    User.idp_issuer == settings.zitadel_issuer.rstrip("/"),
                    User.zitadel_sub == subject,
                    User.kind == UserKind.member,
                    User.deleted_at.is_(None),
                )
            )
        return _access(user, token) if user is not None else None


def current_user(db: DbSession) -> User:
    """The member the caller authenticated as; the static key is the owner."""
    access = get_access_token()
    if access is None or not access.subject:
        raise RuntimeError("MCP request has no authenticated caller.")
    try:
        user_id = UUID(access.subject)
    except ValueError as exc:
        raise RuntimeError("MCP access token carries an invalid subject.") from exc
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise RuntimeError("MCP caller no longer exists.")
    return user


def default_zone() -> ZoneInfo:
    """The configured timezone, or UTC when the setting is not a real one."""
    try:
        return ZoneInfo(get_settings().default_timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _offset_label(moment: datetime) -> str:
    total = int((moment.utcoffset() or timedelta(0)).total_seconds())
    sign = "+" if total >= 0 else "-"
    total = abs(total)
    return f"{sign}{total // 3600:02d}:{(total % 3600) // 60:02d}"


def now_line(moment: datetime | None = None) -> str:
    zone = default_zone()
    local = (moment or datetime.now(UTC)).astimezone(zone)
    return (
        f"Now: {local:%a %d %b %Y, %H:%M} ({_offset_label(local)}, {zone.key})"
        f" · {local.astimezone(UTC).isoformat().replace('+00:00', 'Z')}"
        f" · {int(local.timestamp() * 1000)}"
    )


class TimeContextMiddleware:
    """Appends the current time as the last content block of every tool call.

    The model has no clock, so each result ends with a `Now: ...` line while
    `content[0]` stays the tool's own payload. Only `tools/call` is touched.
    """

    async def __call__(self, ctx: ServerRequestContext[Any, Any], call_next: CallNext) -> HandlerResult:
        result = await call_next(ctx)
        if ctx.method != "tools/call":
            return result
        block = TextContent(type="text", text=now_line())
        if isinstance(result, CallToolResult):
            if result.result_type == "input_required":
                return result
            result.content = [*result.content, block]
            return result
        if isinstance(result, dict) and result.get("resultType") != "input_required":
            content = result.get("content")
            if isinstance(content, list):
                return {
                    **result,
                    "content": [*content, block.model_dump(mode="json", exclude_none=True)],
                }
        return result


mcp = MCPServer(
    "neoma",
    title="Neoma",
    version="0.1.0",
    instructions=(
        "Neoma is a study OS: group projects with shared task boards, study groups with shared "
        "notes, a personal vault and one calendar. Tools act as the signed-in member and only "
        "touch data that member can see. Destructive tools say so in their annotations. "
        "Every tool result ends with a `Now: ...` line giving the current time; timestamps in "
        "payloads are unix milliseconds UTC."
    ),
    middleware=[TimeContextMiddleware()],
    token_verifier=AppTokenVerifier(),
    auth=AuthSettings(
        issuer_url=AnyHttpUrl(settings.zitadel_issuer.rstrip("/")),
        resource_server_url=AnyHttpUrl(settings.mcp_resource_url),
        validate_token_resource=True,
    ),
)


class MCPMount:
    """Stable ASGI mount target; start() swaps in a fresh app per lifespan.

    streamable_http_app() builds a session manager that can only run() once,
    so the app is rebuilt for every lifespan (each uvicorn start - and each
    TestClient in tests).
    """

    app: Starlette | None = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self.app is None:
            await Response("MCP is not running.", status_code=503)(scope, receive, send)
            return
        await self.app(scope, receive, send)


mcp_mount = MCPMount()


def start() -> None:
    """Build the streamable HTTP app; call before session_manager.run()."""
    mcp_mount.app = mcp.streamable_http_app(
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=settings.mcp_allowed_host_list,
            allowed_origins=settings.mcp_allowed_origin_list,
        ),
    )


def stop() -> None:
    mcp_mount.app = None
