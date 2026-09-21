import ssl
from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

# Sync SQLAlchemy on purpose: Neon's pooler is a known trap for asyncpg's
# prepared statements, and pg8000 (pure Python, no native DLL) is plenty here.
_connect_args: dict[str, object] = {}
if settings.ssl_required:
    _connect_args["ssl_context"] = ssl.create_default_context()

engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    # Explicit schema on every table. A pooler in transaction mode can route
    # consecutive statements to different server connections, so anything set
    # per session (search_path) is unreliable.
    metadata = MetaData(schema=settings.db_schema)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
