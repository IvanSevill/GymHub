from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base class for declarative models
Base = declarative_base()

# Database URL from environment variable, default to SQLite
# Render exposes postgres:// but SQLAlchemy 2.x requires postgresql://
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Create the SQLAlchemy engine
# For SQLite, check_same_thread is needed for concurrent requests
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(DATABASE_URL)

# Create a SessionLocal class to get a database session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """
    Dependency that provides a database session.
    Each request will get its own database session that is closed afterwards.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
