from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from .database import engine, Base
from . import models
from .routers import auth_routes, workouts, exercises, analytics
from . import admin

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="GymHub Backend")

# CORS configuration
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
