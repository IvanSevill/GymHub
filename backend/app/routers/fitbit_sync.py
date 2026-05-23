import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import auth, database, fitbit_utils, models, schemas
from ..services.google_calendar import update_google_calendar_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workouts", tags=["fitbit"])


def _is_gym_activity(activity: dict) -> bool:
    """Returns True for Weights activities that map to a Calendar gym session."""
    return "weights" in activity.get("activityName", "").lower()


def _resolve_activity_name(activity: dict) -> str:
    """Return a display name, resolving generic Fitbit types via heuristics.

    Fitbit records outdoor runs as 'Workout' (activityTypeId 91060) on Pixel Watch.
    GPS presence is the reliable signal for outdoor cardio.
    """
    name = activity.get("activityName", "Actividad Fitbit")
    if name.lower() == "workout" and activity.get("hasGps"):
        return "Run"
    return name


def _should_skip_activity(activity: dict) -> bool:
    """Returns True for activities that should not generate standalone workouts.

    Walk: auto-tracked steps. Weights: synced from Calendar via bulk sync.
    """
    return activity.get("activityName", "").lower() in ("walk", "weights")


def _activity_matches_any_workout(activity: dict, workouts: list) -> bool:
    """Returns True if a Fitbit activity overlaps an existing DB workout by time.

    Gym (weights): ±3 h window. Cardio: ±2 h window matched by activity name.
    """
    act_name = activity.get("activityName", "")
    try:
        act_start = (
            datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
            .astimezone(timezone.utc)
            .replace(tzinfo=None)
        )
        act_end = act_start + timedelta(milliseconds=activity.get("duration", 0))
    except Exception:
        return False

    if _is_gym_activity(activity):
        for w in workouts:
            if abs((act_start - w.start_time).total_seconds()) < 10800:
                return True
            mid = w.start_time + (w.end_time - w.start_time) / 2
            if act_start <= mid <= act_end:
                return True
    else:
        resolved_name = _resolve_activity_name(activity)
        for w in workouts:
            if abs((act_start - w.start_time).total_seconds()) < 7200:
                fd = w.fitbit_data
                if fd and fd.activity_name:
                    stored = fd.activity_name.lower()
                    if stored in (act_name.lower(), resolved_name.lower()):
                        return True
                elif w.title.lower() in (act_name.lower(), resolved_name.lower()):
                    return True
    return False


@router.post("/sync-fitbit-bulk", response_model=dict)
async def sync_fitbit_bulk(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Sync Fitbit data for all past workouts missing it (±1 h window matching)."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected.")

    now = datetime.utcnow()
    synced_with_logid = db.query(models.FitbitData.workout_id).filter(
        models.FitbitData.fitbit_log_id.isnot(None),
        models.FitbitData.fitbit_log_id != "",
    )
    workouts = (
        db.query(models.Workout)
        .options(
            joinedload(models.Workout.exercise_sets)
            .joinedload(models.ExerciseSet.exercise)
            .joinedload(models.Exercise.muscle),
            joinedload(models.Workout.fitbit_data),
        )
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time < now,
            ~models.Workout.id.in_(synced_with_logid),
        )
        .order_by(models.Workout.start_time.desc())
        .all()
    )

    synced, not_found = 0, 0
    for workout in workouts:
        try:
            activity = fitbit_utils.get_fitbit_activity(
                db, user_tokens, workout.start_time, workout.end_time
            )
            if not activity:
                not_found += 1
                continue

            if not _is_gym_activity(activity):
                not_found += 1
                continue

            log_id = str(activity.get("logId", "")) or None
            azm = fitbit_utils.extract_azm(activity)
            has_gps = bool(activity.get("hasGps", False))

            existing_fd = workout.fitbit_data
            if existing_fd:
                existing_fd.fitbit_log_id = log_id
                existing_fd.calories = activity.get("calories", 0)
                existing_fd.heart_rate_avg = activity.get("averageHeartRate", 0)
                existing_fd.duration_ms = activity.get("duration", 0)
                existing_fd.distance_km = activity.get("distance", 0.0)
                existing_fd.elevation_gain_m = activity.get("elevationGain", 0.0)
                existing_fd.activity_name = activity.get("activityName", "Unknown")
                existing_fd.azm_fat_burn = azm.get("fatBurnMinutes", 0)
                existing_fd.azm_cardio = azm.get("cardioMinutes", 0)
                existing_fd.azm_peak = azm.get("peakMinutes", 0)
                existing_fd.has_gps = has_gps
                fitbit_data = existing_fd
            else:
                fitbit_data = models.FitbitData(
                    workout_id=workout.id,
                    fitbit_log_id=log_id,
                    calories=activity.get("calories", 0),
                    heart_rate_avg=activity.get("averageHeartRate", 0),
                    duration_ms=activity.get("duration", 0),
                    distance_km=activity.get("distance", 0.0),
                    elevation_gain_m=activity.get("elevationGain", 0.0),
                    activity_name=activity.get("activityName", "Unknown"),
                    azm_fat_burn=azm.get("fatBurnMinutes", 0),
                    azm_cardio=azm.get("cardioMinutes", 0),
                    azm_peak=azm.get("peakMinutes", 0),
                    has_gps=has_gps,
                )
                db.add(fitbit_data)
                db.flush()
                workout.fitbit_data = fitbit_data

            if user_tokens.selected_calendar_id and workout.google_event_id:
                update_google_calendar_event(db, user_tokens, workout, fitbit_data)

            synced += 1
        except Exception as e:
            logger.error("Fitbit bulk sync error for workout %s: %s", workout.id, e)
            not_found += 1

    db.commit()
    return {"synced": synced, "not_found": not_found, "total": len(workouts)}


@router.post("/sync-fitbit-create-missing", response_model=dict)
async def sync_fitbit_create_missing(
    days: int = 30,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Fetch recent Fitbit activities and create workouts for any without a DB match."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        return {"created": 0}

    activities = fitbit_utils.get_fitbit_activities_range(db, user_tokens, days)
    if not activities:
        return {"created": 0}

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    existing_log_ids = {
        fd[0]
        for fd in db.query(models.FitbitData.fitbit_log_id)
        .join(models.Workout, models.FitbitData.workout_id == models.Workout.id)
        .filter(models.Workout.user_id == current_user.id)
        .all()
        if fd[0]
    }

    existing = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(
            models.Workout.user_id == current_user.id,
            models.Workout.start_time >= cutoff,
            models.Workout.start_time <= now,
        )
        .all()
    )

    created = 0
    for activity in activities:
        if _should_skip_activity(activity):
            continue
        if str(activity.get("logId", "")) in existing_log_ids:
            continue
        if _activity_matches_any_workout(activity, existing):
            continue

        try:
            act_start = (
                datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
            act_end = act_start + timedelta(milliseconds=activity.get("duration", 0))
        except Exception:
            continue

        activity_name = _resolve_activity_name(activity)
        workout = models.Workout(
            user_id=current_user.id,
            start_time=act_start,
            end_time=act_end,
            title=activity_name,
        )
        db.add(workout)
        db.flush()

        azm = fitbit_utils.extract_azm(activity)
        fitbit_data = models.FitbitData(
            workout_id=workout.id,
            fitbit_log_id=str(activity.get("logId", "")),
            calories=activity.get("calories", 0),
            heart_rate_avg=activity.get("averageHeartRate", 0),
            duration_ms=activity.get("duration", 0),
            distance_km=activity.get("distance", 0.0),
            elevation_gain_m=activity.get("elevationGain", 0.0),
            activity_name=activity_name,
            azm_fat_burn=azm.get("fatBurnMinutes", 0),
            azm_cardio=azm.get("cardioMinutes", 0),
            azm_peak=azm.get("peakMinutes", 0),
            has_gps=bool(activity.get("hasGps", False)),
        )
        db.add(fitbit_data)
        db.flush()
        workout.fitbit_data = fitbit_data

        act_name_lower = activity_name.lower()
        if "weights" not in act_name_lower and "walk" not in act_name_lower:
            cardio_ex = (
                db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
            )
            if cardio_ex:
                db.add(
                    models.ExerciseSet(
                        workout_id=workout.id,
                        exercise_id=cardio_ex.id,
                        value=str(activity.get("duration", 0) // 60000),
                        measurement="min",
                        is_completed=True,
                    )
                )

        if user_tokens.selected_calendar_id:
            try:
                update_google_calendar_event(db, user_tokens, workout, fitbit_data)
            except Exception as e:
                logger.error(
                    "Calendar sync error for Fitbit activity %s: %s",
                    activity.get("logId"),
                    e,
                )

        existing.append(workout)
        created += 1

    db.commit()
    return {"created": created}


@router.post("/{workout_id}/sync-fitbit", response_model=schemas.FitbitData)
async def sync_fitbit_to_workout(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Manually sync Fitbit activity data to a specific workout."""
    db_workout = (
        db.query(models.Workout)
        .filter(
            models.Workout.id == workout_id,
            models.Workout.user_id == current_user.id,
        )
        .first()
    )
    if not db_workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected or token invalid")

    activity = fitbit_utils.get_fitbit_activity(
        db, user_tokens, db_workout.start_time, db_workout.end_time
    )
    if not activity:
        raise HTTPException(
            status_code=404,
            detail="No matching Fitbit activity found for this workout time",
        )

    fitbit_data = (
        db.query(models.FitbitData)
        .filter(models.FitbitData.workout_id == workout_id)
        .first()
    )
    if not fitbit_data:
        fitbit_data = models.FitbitData(workout_id=workout_id)
        db.add(fitbit_data)

    fitbit_data.fitbit_log_id = str(activity.get("logId"))
    fitbit_data.calories = activity.get("calories", 0)
    fitbit_data.heart_rate_avg = activity.get("averageHeartRate", 0)
    fitbit_data.duration_ms = activity.get("duration", 0)
    fitbit_data.distance_km = activity.get("distance", 0.0)
    fitbit_data.elevation_gain_m = activity.get("elevationGain", 0.0)
    fitbit_data.activity_name = activity.get("activityName", "Unknown")

    azm_data = fitbit_utils.extract_azm(activity)
    fitbit_data.azm_fat_burn = azm_data.get("fatBurnMinutes", 0)
    fitbit_data.azm_cardio = azm_data.get("cardioMinutes", 0)
    fitbit_data.azm_peak = azm_data.get("peakMinutes", 0)

    db.commit()
    db.refresh(fitbit_data)

    act_name_lower = fitbit_data.activity_name.lower()
    if "weights" not in act_name_lower and "walk" not in act_name_lower:
        cardio_ex = (
            db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
        )
        if not cardio_ex:
            muscle_for_cardio = (
                db.query(models.Muscle).filter(models.Muscle.name == "abdomen").first()
            )
            if muscle_for_cardio and current_user.is_root == 1:
                cardio_ex = models.Exercise(
                    name="cardio", muscle_id=muscle_for_cardio.id
                )
                db.add(cardio_ex)
                db.flush()

        if cardio_ex:
            existing_cardio_set = (
                db.query(models.ExerciseSet)
                .filter(
                    models.ExerciseSet.workout_id == workout_id,
                    models.ExerciseSet.exercise_id == cardio_ex.id,
                )
                .first()
            )
            if not existing_cardio_set:
                db.add(
                    models.ExerciseSet(
                        workout_id=workout_id,
                        exercise_id=cardio_ex.id,
                        value=str(fitbit_data.duration_ms // 60000),
                        measurement="min",
                        is_completed=True,
                    )
                )
                db.commit()

    if user_tokens and user_tokens.selected_calendar_id:
        db_workout = (
            db.query(models.Workout)
            .options(joinedload(models.Workout.fitbit_data))
            .filter(models.Workout.id == workout_id)
            .first()
        )
        update_google_calendar_event(db, user_tokens, db_workout, db_workout.fitbit_data)
        db.commit()

    return fitbit_data


@router.get("/{workout_id}/route", response_model=list)
async def get_workout_route(
    workout_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return GPS trackpoints {lat, lon, ele} for a workout. Requires Fitbit location scope."""
    workout = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(
            models.Workout.id == workout_id,
            models.Workout.user_id == current_user.id,
        )
        .first()
    )
    if not workout or not workout.fitbit_data or not workout.fitbit_data.fitbit_log_id:
        raise HTTPException(status_code=404, detail="No GPS route available for this workout")

    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected")

    points = fitbit_utils.get_fitbit_route(
        db, user_tokens, workout.fitbit_data.fitbit_log_id
    )
    if not points:
        raise HTTPException(
            status_code=404,
            detail="No GPS trackpoints found — reconnect Fitbit with location scope",
        )
    return points
