from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str
    # Neon's pooler runs in transaction mode, so session state (search_path)
    # cannot be trusted: every table is addressed with an explicit schema.
    db_schema: str = "public"

    app_secret: str = "dev-only-insecure-secret"
    cleanup_secret: str = ""
    api_base_url: str = "http://localhost:8000"
    public_base_url: str = "http://localhost:3000"
    # The server's single timezone (IANA name): MCP tool results report
    # "now" in it, and read tools add human-readable local labels.
    default_timezone: str = "Asia/Kuala_Lumpur"

    zitadel_issuer: str = "https://<instance>.zitadel.cloud"
    zitadel_client_id: str = ""
    zitadel_redirect_uri: str = "http://localhost:3000/api/auth/callback"
    zitadel_post_logout_uri: str = "http://localhost:3000/login"

    session_cookie_name: str = "neoma_session"
    session_ttl_days: int = 30
    guest_ttl_days: int = 7
    cookie_secure: bool = False

    mcp_enabled: bool = True
    mcp_api_key: str = ""
    mcp_owner_email: str = ""
    mcp_allowed_hosts: str = "localhost,127.0.0.1,[::1],testserver"
    mcp_allowed_origins: str = ""
    mcp_audience: str = ""
    mcp_jwks_url: str = ""

    cors_origins: str = ""

    # Cloudflare R2 (S3-compatible). Empty keys disable uploads. The alias
    # names are the ones the R2 dashboard hands out.
    r2_endpoint: str = Field(default="", validation_alias=AliasChoices("R2_ENDPOINT", "S3_API"))
    r2_bucket: str = Field(default="", validation_alias=AliasChoices("R2_BUCKET", "BUCKET_NAMES"))
    r2_access_key_id: str = Field(
        default="", validation_alias=AliasChoices("R2_ACCESS_KEY_ID", "ACCESS_KEY_ID")
    )
    r2_secret_access_key: str = Field(
        default="", validation_alias=AliasChoices("R2_SECRET_ACCESS_KEY", "SECRET_ACCESS_KEY")
    )
    r2_signed_url_ttl_seconds: int = 600
    max_upload_bytes: int = 15 * 1024 * 1024

    # Resend. An empty key renders and logs emails instead of sending.
    resend_api_key: str = ""
    email_from: str = Field(
        default="Neoma <onboarding@resend.dev>", validation_alias=AliasChoices("EMAIL_FROM", "EMAIL_SEND")
    )
    email_reply_to: str = ""
    email_override_to: str = ""

    # Google Calendar two-way sync; see docs/google-calendar.md.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/google/callback"

    @property
    def google_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def storage_configured(self) -> bool:
        return bool(
            self.r2_endpoint and self.r2_bucket and self.r2_access_key_id and self.r2_secret_access_key
        )

    @property
    def email_configured(self) -> bool:
        return bool(self.resend_api_key and self.email_from)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def mcp_resource_url(self) -> str:
        """The RFC 8707 resource identifier clients request tokens for."""
        return f"{self.api_base_url.rstrip('/')}/mcp"

    @property
    def mcp_allowed_host_list(self) -> list[str]:
        return _with_port_patterns(self.mcp_allowed_hosts)

    @property
    def mcp_allowed_origin_list(self) -> list[str]:
        return _with_port_patterns(self.mcp_allowed_origins)

    @property
    def mcp_jwks_endpoint(self) -> str:
        return self.mcp_jwks_url.strip() or f"{self.zitadel_issuer.rstrip('/')}/oauth/v2/keys"

    @property
    def sqlalchemy_url(self) -> str:
        """Normalizes the DATABASE_URL for SQLAlchemy.

        pg8000 is a pure-Python driver: no native libpq DLL is needed, and
        libpq-only query parameters (sslmode, channel_binding) are dropped;
        SSL is configured via ssl_context in database.py instead.
        """
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+pg8000://", 1)
        head, sep, query = url.partition("?")
        if not sep:
            return url
        dropped = ("channel_binding=", "sslmode=", "sslrootcert=", "sslcert=", "sslkey=")
        kept = [part for part in query.split("&") if part and not part.startswith(dropped)]
        return f"{head}?{'&'.join(kept)}" if kept else head

    @property
    def ssl_required(self) -> bool:
        return any(
            part.startswith("sslmode=") and part.split("=", 1)[1] in {"require", "verify-ca", "verify-full"}
            for part in self.database_url.partition("?")[2].split("&")
        )


def _with_port_patterns(value: str) -> list[str]:
    """Each entry also matches "entry:<port>", the shape a Host header takes."""
    patterns: list[str] = []
    for entry in (part.strip() for part in value.split(",")):
        if not entry:
            continue
        patterns.append(entry)
        if not entry.endswith(":*"):
            patterns.append(f"{entry}:*")
    return patterns


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]  # values come from .env
