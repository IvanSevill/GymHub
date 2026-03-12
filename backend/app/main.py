from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
from .database import engine, Base
from . import models
from .routers import auth_routes, workouts, exercises, analytics
from . import admin

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="GymHub Backend")

# CORS configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    print("GLOBAL EXCEPTION CAUGHT:")
    traceback.print_exc()
    
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
app.include_router(workouts.router)
app.include_router(exercises.router)
app.include_router(analytics.router)
app.include_router(admin.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to GymHub API"}
