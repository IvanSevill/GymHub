import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from database import Base, engine  # noqa: E402
from models import ChatMessage, ChatMemory, ChatUsage, Goal  # noqa: E402, F401 — ensure tables are registered
from chat import router as chat_router  # noqa: E402

Base.metadata.create_all(bind=engine, tables=[
    Base.metadata.tables["chat_messages"],
    Base.metadata.tables["chat_memories"],
    Base.metadata.tables["chat_usage"],
    Base.metadata.tables["goals"],
])

app = FastAPI(title="GymHub AI Server")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = list({"http://localhost:5173", "http://127.0.0.1:5173", FRONTEND_URL})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)


@app.get("/")
async def root():
    return {"service": "GymChat AI", "status": "running", "docs": "/docs"}


@app.get("/health")
async def health():
    configured = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "status": "ok",
        "service": "gymhub-ai",
        "model": os.getenv("GEMINI_MODEL", "gemini-2.0-flash") if configured else None,
    }
