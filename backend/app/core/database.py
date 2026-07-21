"""Database engine, session factory and FastAPI dependency."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# SQLite needs check_same_thread=False for FastAPI's threadpool. Supabase's
# transaction pooler (port 6543) cannot safely retain psycopg named prepared
# statements because server connections are shared between clients.
_database_url = make_url(settings.database_url)
if settings.is_sqlite:
    _connect_args = {"check_same_thread": False}
elif _database_url.drivername == "postgresql+psycopg" and _database_url.port == 6543:
    _connect_args = {"prepare_threshold": None}
else:
    _connect_args = {}

engine = create_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    """Yield a scoped database session (FastAPI dependency)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Import models so they register on the metadata."""
    from app import models  # noqa: F401  (side-effect: register mappers)

    Base.metadata.create_all(bind=engine)

    # This project intentionally has no migration framework. Keep existing demo
    # databases compatible when a new nullable encounter link is introduced.
    if "appointment_id" not in {column["name"] for column in inspect(engine).get_columns("encounter")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE encounter ADD COLUMN appointment_id VARCHAR(36)"))

    # Keep existing demo databases compatible with patient profile photos.
    if "profile_photo" not in {column["name"] for column in inspect(engine).get_columns("patient")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE patient ADD COLUMN profile_photo TEXT"))

    # Uploaded patient documents are stored as data URLs and can exceed the old
    # VARCHAR(300) limit. SQLite TEXT affinity is dynamic; Postgres needs this DDL.
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE document ALTER COLUMN uri TYPE TEXT"))
