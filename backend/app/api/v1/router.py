from fastapi import APIRouter
from .endpoints import auth, workouts, users, sync, calendar_api

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(sync.router, prefix="/sync", tags=["sync"])
router.include_router(calendar_api.router, prefix="/calendar", tags=["calendar"])
