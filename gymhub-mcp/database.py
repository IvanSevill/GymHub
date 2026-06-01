import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

Base = declarative_base()


def get_engine():
    """Create SQLAlchemy engine from DATABASE_URL env var."""
    url = os.environ["DATABASE_URL"]
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)


engine = get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    """Dependency-injection style DB session generator."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
