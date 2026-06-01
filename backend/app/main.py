import logging
import os

from dotenv import load_dotenv

# Must run before any router imports — routers read os.getenv() at module level
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy import text  # noqa: E402
from .database import Base, engine  # noqa: E402
from .routers import analytics, auth_routes, exercise_requests, exercises, fitbit_health, fitbit_sync, workouts  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    for col in ("video_url_1", "video_url_2", "image_url"):
        try:
            conn.execute(text(f"ALTER TABLE exercises ADD COLUMN {col} TEXT"))
            conn.commit()
        except Exception:
            conn.rollback()
    # Clear cached image URLs that are null or not from gstatic (old broken links)
    try:
        conn.execute(text("UPDATE exercises SET image_url = NULL WHERE image_url IS NOT NULL AND image_url NOT LIKE '%gstatic.com%'"))
        conn.commit()
    except Exception:
        conn.rollback()

app = FastAPI(title="GymHub Backend v2")

# CORS configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = list(
    {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        FRONTEND_URL,
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled exception: %s", exc)

    # Ensure CORS headers are present even on error
    origin = request.headers.get("origin")
    headers = {}
    if origin in origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "traceback": str(exc)},
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
