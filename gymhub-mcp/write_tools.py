"""Write tools — call the GymHub backend API via backend_client."""

import os

import httpx

import backend_client


def _resolve_exercise_id(exercise_name: str) -> str | None:
    """Look up an exercise by partial name match via the backend REST API."""
    data = backend_client.get("/exercises")
    if backend_client.is_error(data) or not isinstance(data, list):
        return None
    n = exercise_name.lower()
    for ex in data:
        if n in ex.get("name", "").lower():
            return ex.get("id")
    return None


def create_workout(args: dict, token: str) -> dict:
    """Create a new workout with exercises and sets via the backend API."""
    title: str = args.get("title", "Workout")
    start_time: str = args.get("start_time", "")
    end_time: str = args.get("end_time", "")
    exercises: list = args.get("exercises", [])

    exercise_sets = []
    for ex_entry in exercises:
        ex_name = ex_entry.get("exercise_name", "")
        ex_id = _resolve_exercise_id(ex_name)
        if not ex_id:
            return {"error": f"Exercise not found: {ex_name}"}
        for s in ex_entry.get("sets", []):
            exercise_sets.append({
                "exercise_id": ex_id,
                "value": s.get("value", ""),
                "measurement": s.get("measurement", "kg"),
                "is_completed": True,
            })

    data = backend_client.post("/workouts", json={
        "title": title,
        "start_time": start_time,
        "end_time": end_time,
        "exercise_sets": exercise_sets,
    })
    if backend_client.is_error(data):
        return data
    return {
        "success": True,
        "workout_id": data.get("id"),
        "title": data.get("title"),
        "sets_created": len(exercise_sets),
    }


def add_set_to_workout(args: dict, token: str) -> dict:
    """Append a single set to an existing workout without losing existing sets."""
    workout_id: str = args.get("workout_id", "")
    exercise_name: str = args.get("exercise_name", "")
    value: str = args.get("value", "")
    measurement: str = args.get("measurement", "kg")

    workout = backend_client.get(f"/workouts/{workout_id}")
    if backend_client.is_error(workout):
        return {"error": f"Workout not found: {workout_id}"}

    existing_sets = [
        {
            "exercise_id": s["exercise_id"],
            "value": s["value"],
            "measurement": s["measurement"],
            "is_completed": s.get("is_completed", True),
        }
        for s in workout.get("exercise_sets", [])
    ]

    ex_id = _resolve_exercise_id(exercise_name)
    if not ex_id:
        return {"error": f"Exercise not found: {exercise_name}"}

    exercises_data = backend_client.get("/exercises")
    resolved_name = exercise_name
    if isinstance(exercises_data, list):
        for ex in exercises_data:
            if ex.get("id") == ex_id:
                resolved_name = ex.get("name", exercise_name)
                break

    new_set = {"exercise_id": ex_id, "value": value, "measurement": measurement, "is_completed": True}
    updated_sets = existing_sets + [new_set]

    data = backend_client.put(f"/workouts/{workout_id}", json={
        "title": workout.get("title", ""),
        "start_time": workout.get("start_time", ""),
        "end_time": workout.get("end_time", ""),
        "exercise_sets": updated_sets,
    })
    if backend_client.is_error(data):
        return data
    return {
        "success": True,
        "exercise": resolved_name,
        "set_added": f"{value} {measurement}".strip(),
        "total_sets": len(updated_sets),
    }


def sync_pending_cardio(args: dict, token: str) -> dict:
    """Upload pending Fitbit cardio activities that have no workout in GymHub."""
    days: int = int(args.get("days", 30))
    data = backend_client.post("/workouts/sync-fitbit-create-missing", params={"days": days})
    if backend_client.is_error(data):
        return data
    created = data.get("created", 0)
    return {
        "success": True,
        "created": created,
        "created_activities": data.get("created_activities", []),
        "message": f"{created} actividades cardio subidas desde Fitbit.",
    }


def sync_fitbit_to_workout(args: dict, token: str) -> dict:
    """Associate Fitbit activity data (calories, HR, AZM zones) with a specific workout."""
    workout_id: str = args.get("workout_id", "")
    data = backend_client.post(f"/workouts/{workout_id}/sync-fitbit")
    if backend_client.is_error(data):
        return data
    fitbit = data.get("fitbit_data") or {}
    duration_min = round(fitbit["duration_ms"] / 60000, 1) if (fitbit.get("duration_ms") or 0) > 0 else None
    return {
        "success": True,
        "calories": fitbit.get("calories"),
        "heart_rate_avg": fitbit.get("heart_rate_avg"),
        "duration_min": duration_min,
    }


def save_memory(args: dict, token: str) -> dict:
    """Save a memory fact for the current user via the ai-server."""
    ai_url = os.environ.get("AI_SERVER_URL", "http://localhost:8001")
    try:
        r = httpx.post(
            f"{ai_url}/chat/memory",
            json={"key": args["key"], "value": args["value"]},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        return {"error": str(exc)}


def get_memories(args: dict, token: str) -> dict:
    """Retrieve all stored memory facts for the current user."""
    ai_url = os.environ.get("AI_SERVER_URL", "http://localhost:8001")
    try:
        r = httpx.get(
            f"{ai_url}/chat/memory",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
        r.raise_for_status()
        return {"memories": r.json()}
    except Exception as exc:
        return {"error": str(exc)}


def log_weight(args: dict, token: str) -> dict:
    """Log or update the user's weight and optional body fat % for a date (upserts by date)."""
    payload: dict = {"date": args["date"], "weight_kg": float(args["weight_kg"])}
    if args.get("body_fat_pct") is not None:
        payload["body_fat_pct"] = float(args["body_fat_pct"])
    data = backend_client.post("/weight", json=payload)
    if backend_client.is_error(data):
        return data
    return {"ok": True, "date": payload["date"], "weight_kg": payload["weight_kg"]}


def delete_weight_log(args: dict, token: str) -> dict:
    """Delete the weight log entry for a specific date."""
    date: str = args["date"]
    entries = backend_client.get("/weight", params={"date": date})
    if backend_client.is_error(entries) or not isinstance(entries, list) or not entries:
        return {"ok": False, "error": f"No weight entry found for {date}"}
    entry_id = entries[0]["id"]
    data = backend_client.delete(f"/weight/{entry_id}")
    if backend_client.is_error(data):
        return data
    return {"ok": True, "deleted_date": date}
