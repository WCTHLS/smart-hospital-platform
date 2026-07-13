"""Database engine, session factory and FastAPI dependency."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


# SQLite needs check_same_thread=False for FastAPI's threadpool.
_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

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

    # Uploaded patient documents are stored as data URLs and can exceed the old
    # VARCHAR(300) limit. SQLite TEXT affinity is dynamic; Postgres needs this DDL.
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE document ALTER COLUMN uri TYPE TEXT"))
