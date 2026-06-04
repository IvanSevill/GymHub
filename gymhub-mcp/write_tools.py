"""Write tools — call the GymHub backend API via httpx (requires auth token)."""

import os

import httpx

import models
from database import SessionLocal
from read_tools import _parse_exercise_value


def _get_backend_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:8000")


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _resolve_exercise_id(exercise_name: str, db) -> str | None:
    """Look up an exercise by partial name match and return its ID."""
    exercise = (
        db.query(models.Exercise)
        .filter(models.Exercise.name.ilike(f"%{exercise_name}%"))
        .first()
    )
    return exercise.id if exercise else None


async def create_workout(args: dict, token: str) -> dict:
    """Create a new workout with exercises and sets via the backend API."""
    title: str = args.get("title", "Workout")
    start_time: str = args.get("start_time", "")
    end_time: str = args.get("end_time", "")
    exercises: list = args.get("exercises", [])

    db = SessionLocal()
    try:
        exercise_sets = []
        for ex_entry in exercises:
            ex_name = ex_entry.get("exercise_name", "")
            ex_id = _resolve_exercise_id(ex_name, db)
            if not ex_id:
                return {"error": f"Exercise not found: {ex_name}"}
            for s in ex_entry.get("sets", []):
                exercise_sets.append(
                    {
                        "exercise_id": ex_id,
                        "value": s.get("value", ""),
                        "measurement": s.get("measurement", "kg"),
                        "is_completed": True,
                    }
                )
    finally:
        db.close()

    payload = {
        "title": title,
        "start_time": start_time,
        "end_time": end_time,
        "exercise_sets": exercise_sets,
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{_get_backend_url()}/workouts",
                json=payload,
                headers=_auth_headers(token),
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            return {
                "success": True,
                "workout_id": data.get("id"),
                "title": data.get("title"),
                "sets_created": len(exercise_sets),
            }
        except httpx.HTTPStatusError as exc:
            return {"error": f"Backend error {exc.response.status_code}: {exc.response.text}"}
        except Exception as exc:
            return {"error": str(exc)}


async def add_set_to_workout(args: dict, token: str) -> dict:
    """Append a single set to an existing workout without losing existing sets."""
    workout_id: str = args.get("workout_id", "")
    exercise_name: str = args.get("exercise_name", "")
    value: str = args.get("value", "")
    measurement: str = args.get("measurement", "kg")

    db = SessionLocal()
    try:
        # Read the current workout from DB
        workout = db.query(models.Workout).filter(models.Workout.id == workout_id).first()
        if not workout:
            return {"error": f"Workout not found: {workout_id}"}

        # Build existing sets list
        existing_sets = [
            {
                "exercise_id": s.exercise_id,
                "value": s.value,
                "measurement": s.measurement,
                "is_completed": s.is_completed,
            }
            for s in workout.exercise_sets
        ]

        # Resolve exercise name to ID
        ex_id = _resolve_exercise_id(exercise_name, db)
        if not ex_id:
            return {"error": f"Exercise not found: {exercise_name}"}

        exercise = db.query(models.Exercise).filter(models.Exercise.id == ex_id).first()
        resolved_name = exercise.name if exercise else exercise_name

        new_set = {
            "exercise_id": ex_id,
            "value": value,
            "measurement": measurement,
            "is_completed": True,
        }
        updated_sets = existing_sets + [new_set]

        payload = {
            "title": workout.title,
            "start_time": workout.start_time.isoformat(),
            "end_time": workout.end_time.isoformat(),
            "exercise_sets": updated_sets,
        }
    finally:
        db.close()

    async with httpx.AsyncClient() as client:
        try:
            response = await client.put(
                f"{_get_backend_url()}/workouts/{workout_id}",
                json=payload,
                headers=_auth_headers(token),
                timeout=30.0,
            )
            response.raise_for_status()
            return {
                "success": True,
                "exercise": resolved_name,
                "set_added": f"{value} {measurement}".strip(),
                "total_sets": len(updated_sets),
            }
        except httpx.HTTPStatusError as exc:
            return {"error": f"Backend error {exc.response.status_code}: {exc.response.text}"}
        except Exception as exc:
            return {"error": str(exc)}


async def sync_pending_cardio(args: dict, token: str) -> dict:
    """Upload pending Fitbit cardio activities that have no workout in GymHub."""
    days: int = int(args.get("days", 30))

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{_get_backend_url()}/workouts/sync-fitbit-create-missing?days={days}",
                headers=_auth_headers(token),
                timeout=60.0,
            )
            response.raise_for_status()
            data = response.json()
            created = data.get("created", 0)
            return {
                "success": True,
                "created": created,
                "message": f"{created} actividades cardio subidas desde Fitbit.",
            }
        except httpx.HTTPStatusError as exc:
            return {"error": f"Backend error {exc.response.status_code}: {exc.response.text}"}
        except Exception as exc:
            return {"error": str(exc)}


async def sync_fitbit_to_workout(args: dict, token: str) -> dict:
    """Associate Fitbit activity data (calories, HR, AZM zones) with a specific workout."""
    workout_id: str = args.get("workout_id", "")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{_get_backend_url()}/workouts/{workout_id}/sync-fitbit",
                headers=_auth_headers(token),
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            fitbit = data.get("fitbit_data") or {}
            duration_min = None
            if fitbit.get("duration_ms") and fitbit["duration_ms"] > 0:
                duration_min = round(fitbit["duration_ms"] / 60000, 1)
            return {
                "success": True,
                "calories": fitbit.get("calories"),
                "heart_rate_avg": fitbit.get("heart_rate_avg"),
                "duration_min": duration_min,
            }
        except httpx.HTTPStatusError as exc:
            return {"error": f"Backend error {exc.response.status_code}: {exc.response.text}"}
        except Exception as exc:
            return {"error": str(exc)}


# Suppress unused import warning
_ = _parse_exercise_value
