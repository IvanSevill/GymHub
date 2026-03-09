import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings, BASE_DIR

# Database setup
db_url = settings.DB_URL

# Handle relative SQLite paths
if db_url and db_url.startswith("sqlite:///./"):
    db_name = db_url.split("sqlite:///./")[1]
    db_path = os.path.join(BASE_DIR, db_name)
    db_url = f"sqlite:///{db_path}"

# Render fix: postgres:// to postgresql://
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Handle SQLite vs Postgres connection args
connect_args = {"check_same_thread": False} if "sqlite" in db_url else {}

engine = create_engine(db_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    try:
        # Wrap in try-except to handle race conditions during startup in multi-worker environments
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        # If the table already exists, it might be due to a race condition between workers.
        # We can safely ignore "already exists" errors during initialization.
        error_str = str(e).lower()
        if "already exists" in error_str or "dup_table" in error_str:
            import logging
            logging.getLogger(__name__).info("Database tables already initialized or being initialized by another worker.")
        else:
            raise e
