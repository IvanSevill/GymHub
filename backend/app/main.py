import logging
import os

from dotenv import load_dotenv

# Must run before any router imports — routers read os.getenv() at module level
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from slowapi import Limiter, _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402
from slowapi.util import get_remote_address  # noqa: E402
from sqlalchemy import text  # noqa: E402
from .database import Base, engine  # noqa: E402
from .routers import analytics, auth_routes, exercise_requests, exercises, feedback, fitbit_health, fitbit_sync, weight, workouts  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

_EXERCISE_MIGRATION_COLUMNS = {"video_url_1", "video_url_2", "image_url"}

with engine.connect() as conn:
    for col in _EXERCISE_MIGRATION_COLUMNS:
        try:
            conn.execute(text(f"ALTER TABLE exercises ADD COLUMN {col} TEXT"))
            conn.commit()
        except Exception:
            conn.rollback()
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN height_cm FLOAT"))
        conn.commit()
    except Exception:
        conn.rollback()

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

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

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
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
