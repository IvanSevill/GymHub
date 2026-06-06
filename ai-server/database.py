import os
import re

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

Base = declarative_base()


def _get_engine():
    url = os.environ["DATABASE_URL"]
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    # Supabase session mode (port 5432) caps at 15 clients; transaction mode (6543) is unbounded.
    url = re.sub(r"(pooler\.supabase\.com):5432", r"\1:6543", url)
    # NullPool: connections are opened and closed per request — the ai-server holds zero idle connections.
    return create_engine(url, poolclass=NullPool)


engine = _get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
