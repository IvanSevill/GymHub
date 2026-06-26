import logging
import os
import re

from dotenv import load_dotenv

# Must run before any router imports — routers read os.getenv() at module level
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, Response  # noqa: E402
from slowapi import Limiter, _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402
from slowapi.util import get_remote_address  # noqa: E402
from sqlalchemy import text  # noqa: E402
from .database import Base, engine  # noqa: E402
from .routers import analytics, assistant, auth_routes, exercise_requests, exercises, feedback, fitbit_health, fitbit_sync, weight, workouts  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

# Lightweight additive column migrations for deployments whose schema predates
# a column. Every (table, column, type) here is a hardcoded constant defined in
# source — never user input — so this is not a SQL-injection vector. As
# defense-in-depth we still validate each identifier against a strict pattern
# before composing any DDL, and reject anything that does not match.
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_COLUMN_MIGRATIONS = [
    ("exercises", "video_url_1", "TEXT"),
    ("exercises", "video_url_2", "TEXT"),
    ("exercises", "image_url", "TEXT"),
    ("users", "height_cm", "FLOAT"),
    ("chat_usage", "window_start", "TIMESTAMP"),
]


def _add_column_if_missing(conn, table: str, column: str, col_type: str) -> None:
    """Add a column via ALTER TABLE, ignoring the error if it already exists.

    Identifiers are validated against `_SAFE_IDENTIFIER` first; the column type
    comes from the trusted constant list above, so no value is interpolated
    from external input.
    """
    if not (_SAFE_IDENTIFIER.match(table) and _SAFE_IDENTIFIER.match(column)):
        raise ValueError(f"Unsafe identifier in migration: {table}.{column}")
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        conn.commit()
    except Exception:
        # Column already present (or otherwise non-applicable) — safe to skip.
        conn.rollback()


with engine.connect() as conn:
    for _table, _column, _type in _COLUMN_MIGRATIONS:
        _add_column_if_missing(conn, _table, _column, _type)
    try:
        conn.execute(text(
            "ALTER TABLE exercise_requests ADD COLUMN exercise_id VARCHAR "
            "REFERENCES exercises(id) ON DELETE SET NULL"
        ))
        conn.commit()
    except Exception:
        conn.rollback()
    # Backfill: create missing exercises for approved requests where exercise_id is NULL
    try:
        orphans = conn.execute(text(
            "SELECT er.id, er.type, er.exercise_name, er.muscle_id, er.muscle_name "
            "FROM exercise_requests er "
            "WHERE er.status = 'approved' AND er.exercise_id IS NULL"
        )).fetchall()
        for row in orphans:
            existing = conn.execute(
                text("SELECT id FROM exercises WHERE name = :name"),
                {"name": row.exercise_name},
            ).fetchone()
            if existing:
                ex_id = existing[0]
            else:
                muscle_id = row.muscle_id
                if not muscle_id and row.muscle_name:
                    m = conn.execute(
                        text("SELECT id FROM muscles WHERE name = :n"),
                        {"n": row.muscle_name},
                    ).fetchone()
                    if m:
                        muscle_id = m[0]
                if not muscle_id:
                    continue
                import uuid as _uuid
                ex_id = str(_uuid.uuid4())
                conn.execute(
                    text("INSERT INTO exercises (id, name, muscle_id) VALUES (:id, :name, :muscle_id)"),
                    {"id": ex_id, "name": row.exercise_name, "muscle_id": muscle_id},
                )
            conn.execute(
                text("UPDATE exercise_requests SET exercise_id = :ex_id WHERE id = :req_id"),
                {"ex_id": ex_id, "req_id": row.id},
            )
        conn.commit()
    except Exception:
        conn.rollback()

_rate_limits = [] if os.getenv("TESTING") == "true" else ["60/minute"]
limiter = Limiter(key_func=get_remote_address, default_limits=_rate_limits)

def _is_client_disconnect(exc: BaseException) -> bool:
    """True when *exc* (or every leaf of an ExceptionGroup) is a client
    disconnect — the browser closing the connection mid-response. These are
    not server errors and must not be logged as unhandled exceptions."""
    sub = getattr(exc, "exceptions", None)
    if sub:
        return all(_is_client_disconnect(e) for e in sub)
    return type(exc).__name__ in ("ClientDisconnect", "ClientDisconnected")


class SuppressClientDisconnectMiddleware:
    """Swallow client-disconnect errors so a browser closing a connection
    mid-response (closing the chat panel, reloading, navigating away) does not
    bubble up as a noisy unhandled-exception traceback. Any other exception is
    re-raised untouched."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        try:
            await self.app(scope, receive, send)
        except BaseException as exc:
            if _is_client_disconnect(exc):
                return
            raise


app = FastAPI(title="GymHub Backend v2")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = list(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        FRONTEND_URL,
    }
)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Added last so it is the outermost user middleware: it catches client
# disconnects propagating from the inner layers before they reach the error
# middleware and uvicorn.
app.add_middleware(SuppressClientDisconnectMiddleware)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    # A client that disconnects mid-response is not a server error; stay quiet
    # and do not attempt to write to a closed connection.
    if _is_client_disconnect(exc):
        return Response(status_code=204)

    logger.exception("Unhandled exception")

    # Ensure CORS headers are present even on error
    origin = request.headers.get("origin")
    headers = {}
    if origin in origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers
    )

# Include routers — fitbit_sync before workouts so specific paths match before /{workout_id}
app.include_router(auth_routes.router)
app.include_router(exercises.router)
app.include_router(exercise_requests.router)
app.include_router(fitbit_health.router)
app.include_router(fitbit_sync.router)
app.include_router(workouts.router)
app.include_router(analytics.router)
app.include_router(weight.router)
app.include_router(feedback.router)
app.include_router(assistant.router)

@app.get("/")
async def read_root():
    """
    Root endpoint for the GymHub Backend v2.
    Returns a welcome message to indicate the API is running.
    """
    return {"message": "Welcome to GymHub API v2"}

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "local")[:7],
    }
