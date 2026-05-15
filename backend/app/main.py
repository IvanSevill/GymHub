import os
import traceback
from dotenv import load_dotenv

# Must run before any router imports — routers read os.getenv() at module level
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from .database import engine, Base  # noqa: E402
from .routers import auth_routes, exercises, workouts, analytics  # noqa: E402

# Create database tables
Base.metadata.create_all(bind=engine)

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
    """
    Global exception handler to catch all unhandled exceptions.
    Logs the exception traceback and returns a JSON response with a 500 status code.
    """
    print("GLOBAL EXCEPTION CAUGHT:")
    traceback.print_exc() # Print full traceback to console

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

# Include routers
app.include_router(auth_routes.router)
app.include_router(exercises.router)
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
    """
    Checks the health of the application.
    This endpoint returns a simple status to indicate the application is running.
    """
    return {"status": "ok"}
