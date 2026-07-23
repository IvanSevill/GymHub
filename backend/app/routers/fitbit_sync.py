import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import auth, database, fitbit_utils, models, schemas
from ..services.google_calendar import update_google_calendar_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workouts", tags=["fitbit"])


_SYNC_ERROR_MESSAGES = {
    "FITBIT_REAUTH_REQUIRED": "Fitbit authorization must be renewed.",
    "FITBIT_AUTH_UNAVAILABLE": "Fitbit authorization is temporarily unavailable.",
    "FITBIT_AUTH_TIMEOUT": "Fitbit authorization timed out.",
    "FITBIT_API_RATE_LIMITED": "Fitbit rate limit alcanzado. Esperá ~1 hora y probá de nuevo.",
    "FITBIT_API_UNAVAILABLE": "Fitbit is temporarily unavailable.",
    "FITBIT_API_TIMEOUT": "Fitbit request timed out.",
    "FITBIT_API_REJECTED": "Fitbit rejected the request.",
    "FITBIT_RESPONSE_INVALID": "Fitbit returned an invalid response.",
    "FITBIT_MATCHING_FAILED": "Fitbit activity matching failed.",
    "FITBIT_PROCESSING_FAILED": "Fitbit activity processing failed.",
    "FITBIT_PERSISTENCE_FAILED": "Fitbit data could not be saved.",
}


def _canonical_correlation_id(value: Optional[str]) -> str:
    if value:
        try:
            parsed = uuid.UUID(value)
            if parsed.version == 4 and str(parsed) == value:
                return value
        except (ValueError, AttributeError):
            pass
    return str(uuid.uuid4())


def _sync_log(event: str, correlation_id: str, route: str, **fields) -> None:
    if "created" in fields:
        # LogRecord.created is reserved for the event timestamp.
        fields["created_count"] = fields.pop("created")
    logger.info(
        event,
        extra={
            "event": event,
            "correlation_id": correlation_id,
            "route": route,
            **fields,
        },
    )


def _raise_sync_failure(
    failure: fitbit_utils.FitbitSyncFailure,
    correlation_id: str,
    route: str,
    started_at: float,
    exception_type: Optional[str] = None,
) -> None:
    fields = {
        "stage": failure.stage,
        "code": failure.code,
        "http_status": failure.status_code,
        "retryable": failure.retryable,
        "duration_ms": round((time.monotonic() - started_at) * 1000),
    }
    if failure.provider_status is not None:
        fields["provider_status"] = failure.provider_status
    if exception_type is not None:
        fields["exception_type"] = exception_type
    _sync_log("fitbit_sync.failed", correlation_id, route, **fields)
    detail = schemas.SyncErrorDetail(
        stage=failure.stage,
        code=failure.code,
        message=_SYNC_ERROR_MESSAGES[failure.code],
        correlation_id=correlation_id,
        retryable=failure.retryable,
    )
    raise HTTPException(status_code=failure.status_code, detail=detail.model_dump())


def _processing_failure(code: str = "FITBIT_PROCESSING_FAILED") -> fitbit_utils.FitbitSyncFailure:
    return fitbit_utils.FitbitSyncFailure("processing", code, 500, False)


def _persistence_failure() -> fitbit_utils.FitbitSyncFailure:
    return fitbit_utils.FitbitSyncFailure(
        "database_persistence", "FITBIT_PERSISTENCE_FAILED", 500, True
    )


def _is_gym_activity(activity: dict) -> bool:
    """Returns True for Weights activities that map to a Calendar gym session."""
    return "weights" in activity.get("activityName", "").lower()


_RUN_ACTIVITY_TYPE_IDS = {90009, 90013}  # Run, Treadmill Run
_RUN_NAMES = {"run", "running", "outdoor run", "treadmill", "jogging"}


def _resolve_activity_name(activity: dict) -> str:
    """Return a display name, resolving generic Fitbit types via heuristics.

    Pixel Watch records outdoor runs as 'Workout' (activityTypeId 90013) with
    hasGps=false when using Connected GPS (phone GPS). We detect it by activityTypeId
    or by hasGps being True, so the name stored in DB is 'Run' not 'Workout'.
    """
    name = activity.get("activityName", "Actividad Fitbit")
    type_id = activity.get("activityTypeId", 0)

    if name.lower() in _RUN_NAMES:
        return "Run"
    if name.lower() == "workout" and (activity.get("hasGps") or type_id in _RUN_ACTIVITY_TYPE_IDS):
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


def _collect_pending_fitbit_activities(
    db: Session,
    user_tokens: models.UserTokens,
    user_id: str,
    days: int,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
    processing_failures: Optional[list] = None,
) -> list:
    """Return Fitbit activities from the last `days` with no matching GymHub workout.

    Mirrors the detection used by sync-fitbit-create-missing but performs no
    writes, so it backs both the create endpoint and a read-only preview.
    """
    activities = fitbit_utils.get_fitbit_activities_range(
        db,
        user_tokens,
        days,
        strict=strict,
        correlation_id=correlation_id,
        processing_failures=processing_failures,
    )
    if not activities:
        return []

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    existing_log_ids = {
        fd[0]
        for fd in db.query(models.FitbitData.fitbit_log_id)
        .join(models.Workout, models.FitbitData.workout_id == models.Workout.id)
        .filter(models.Workout.user_id == user_id)
        .all()
        if fd[0]
    }
    existing = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time >= cutoff,
            models.Workout.start_time <= now,
        )
        .all()
    )

    pending = []
    for activity in activities:
        if _should_skip_activity(activity):
            continue
        if str(activity.get("logId", "")) in existing_log_ids:
            continue
        if _activity_matches_any_workout(activity, existing):
            continue
        pending.append(activity)
    return pending


@router.get("/fitbit-pending", response_model=list)
async def list_fitbit_pending(
    days: int = 30,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Preview Fitbit activities (last N days) not yet imported as GymHub workouts.

    Read-only counterpart to sync-fitbit-create-missing: lets the UI/assistant
    show which cardio activities are pending upload before creating anything.
    """
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        return []

    pending = _collect_pending_fitbit_activities(db, user_tokens, current_user.id, days)
    result = []
    for activity in pending:
        try:
            act_start = (
                datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
        except Exception:
            continue
        result.append(
            {
                "log_id": str(activity.get("logId", "")),
                "activity_name": _resolve_activity_name(activity),
                "start_time": act_start.isoformat(),
                "date": act_start.strftime("%Y-%m-%d %H:%M"),
                "duration_min": round(activity.get("duration", 0) / 60000, 1),
                "distance_km": activity.get("distance", 0.0),
                "calories": activity.get("calories", 0),
                "has_gps": bool(activity.get("hasGps", False)),
            }
        )
    return result


@router.post(
    "/sync-fitbit-bulk",
    response_model=schemas.FitbitBulkSyncResponse,
    responses={
        424: {"model": schemas.SyncErrorResponse},
        500: {"model": schemas.SyncErrorResponse},
        502: {"model": schemas.SyncErrorResponse},
        503: {"model": schemas.SyncErrorResponse},
        504: {"model": schemas.SyncErrorResponse},
    },
)
async def sync_fitbit_bulk(
    x_correlation_id: Optional[str] = Header(None, alias="X-Correlation-ID"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Sync Fitbit data for past workouts with safe stage-aware diagnostics."""
    correlation_id = _canonical_correlation_id(x_correlation_id)
    route = "sync_fitbit_bulk"
    started_at = time.monotonic()
    _sync_log("fitbit_sync.started", correlation_id, route)
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    # Fitbit is optional: this endpoint is one of several best-effort steps in
    # the calendar sync flow, so a missing connection is a normal state, not a
    # client error. Return gracefully (mirroring sync-fitbit-create-missing)
    # instead of raising 400, which would surface a spurious "partial sync".
    if not user_tokens or not user_tokens.fitbit_access_token:
        result = schemas.FitbitBulkSyncResponse(
            skipped="fitbit_not_connected",
            outcome=schemas.SyncOutcome.SKIPPED,
            correlation_id=correlation_id,
        )
        _sync_log(
            "fitbit_sync.completed",
            correlation_id,
            route,
            outcome=result.outcome.value,
            synced=0,
            not_found=0,
            failed=0,
            total=0,
            duration_ms=round((time.monotonic() - started_at) * 1000),
        )
        return result

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

    not_found = 0
    failed = 0
    prepared = []
    _interrupted_by_rate_limit = False
    _fatal_failure: Optional[fitbit_utils.FitbitSyncFailure] = None
    for workout in workouts:
        try:
            activity = fitbit_utils.get_fitbit_activity(
                db,
                user_tokens,
                workout.start_time,
                workout.end_time,
                required_activity_name="weights"
                if fitbit_utils.is_weights_workout(workout)
                else None,
                strict=True,
                correlation_id=correlation_id,
            )
            if not activity:
                not_found += 1
                # Stale placeholder restored from calendar description — don't
                # keep showing "Walk" for a weights workout when no Weights
                # activity was found.
                if (
                    workout.fitbit_data
                    and not workout.fitbit_data.fitbit_log_id
                    and workout.fitbit_data.activity_name
                    and workout.fitbit_data.activity_name.lower() == "walk"
                ):
                    logger.info(
                        "Bulk sync: reset stale 'Walk' to 'Unknown' for workout %s (%s)",
                        workout.id,
                        workout.title,
                    )
                    workout.fitbit_data.activity_name = "Unknown"
                continue

            log_id = str(activity.get("logId", "")) or None
            azm = fitbit_utils.extract_azm(activity)
            has_gps = (
                fitbit_utils.probe_has_gps(
                    db,
                    user_tokens,
                    log_id or "",
                    strict=False,
                    correlation_id=correlation_id,
                )
                if log_id
                else False
            )
            prepared.append((workout, activity, azm, log_id, has_gps))
        except fitbit_utils.FitbitSyncFailure as failure:
            if failure.code == "FITBIT_ACTIVITY_PROCESSING_FAILED":
                failed += 1
                continue
            if failure.code == "FITBIT_API_RATE_LIMITED":
                _interrupted_by_rate_limit = True
            else:
                _fatal_failure = failure
            logger.warning("Fitbit error after %d prepared — stopping: stage=%s code=%s", len(prepared), failure.stage, failure.code)
            break
        except Exception as error:
            db.rollback()
            failure = _processing_failure("FITBIT_MATCHING_FAILED")
            _sync_log(
                "fitbit_sync.failed",
                correlation_id,
                route,
                stage=failure.stage,
                code=failure.code,
                http_status=failure.status_code,
                retryable=False,
                exception_type=type(error).__name__,
                duration_ms=round((time.monotonic() - started_at) * 1000),
            )
            detail = schemas.SyncErrorDetail(
                stage=failure.stage,
                code=failure.code,
                message=_SYNC_ERROR_MESSAGES[failure.code],
                correlation_id=correlation_id,
                retryable=False,
            )
            raise HTTPException(status_code=500, detail=detail.model_dump()) from None

    try:
        for workout, activity, azm, log_id, has_gps in prepared:
            fitbit_data = workout.fitbit_data
            if fitbit_data is None:
                fitbit_data = models.FitbitData(workout_id=workout.id)
                db.add(fitbit_data)
                workout.fitbit_data = fitbit_data
            fitbit_data.fitbit_log_id = log_id
            fitbit_data.calories = activity.get("calories", 0)
            fitbit_data.heart_rate_avg = activity.get("averageHeartRate", 0)
            fitbit_data.duration_ms = activity.get("duration", 0)
            fitbit_data.distance_km = activity.get("distance", 0.0)
            fitbit_data.elevation_gain_m = activity.get("elevationGain", 0.0)
            fitbit_data.activity_name = activity.get("activityName", "Unknown")
            fitbit_data.azm_fat_burn = azm.get("fatBurnMinutes", 0)
            fitbit_data.azm_cardio = azm.get("cardioMinutes", 0)
            fitbit_data.azm_peak = azm.get("peakMinutes", 0)
            fitbit_data.has_gps = has_gps
            logger.info(
                "Bulk sync: matched workout %s (%s) → activity=%s log_id=%s",
                workout.id,
                workout.title,
                fitbit_data.activity_name,
                log_id,
            )
        db.flush()
        db.commit()
    except Exception as error:
        db.rollback()
        _raise_sync_failure(
            _persistence_failure(),
            correlation_id,
            route,
            started_at,
            type(error).__name__,
        )

    # Track IDs processed in this sync (used to exclude from subsequent passes)
    new_ids = {w.id for w, *_ in prepared} if prepared else set()

    # Push updated descriptions to Google Calendar for every matched workout
    cal_updated = 0
    if prepared and user_tokens and user_tokens.selected_calendar_id:
        for workout, _activity, _azm, _log_id, _has_gps in prepared:
            try:
                update_google_calendar_event(db, user_tokens, workout, workout.fitbit_data)
                cal_updated += 1
            except Exception as cal_err:
                logger.warning(
                    "Calendar update failed for workout %s (%s): %s",
                    workout.id,
                    workout.title,
                    cal_err,
                )
        db.commit()

    # Retroactive Calendar fix: workouts that were matched in previous sync
    # runs (before the Calendar-on-sync feature) may still have stale
    # descriptions in Google Calendar showing "Walk". Update them all so
    # they reflect the current DB activity_name. This queries workouts
    # that already had fitbit_log_id + google_event_id before this sync.
    cal_fixed = 0
    if user_tokens and user_tokens.selected_calendar_id:
        retro_query = (
            db.query(models.Workout)
            .options(joinedload(models.Workout.fitbit_data))
            .filter(
                models.Workout.user_id == current_user.id,
                models.Workout.google_event_id.isnot(None),
                models.FitbitData.fitbit_log_id.isnot(None),
                models.FitbitData.fitbit_log_id != "",
                # Only Weights workouts were affected by the "Walk" bug
                models.FitbitData.activity_name == "Weights",
            )
            .join(models.FitbitData, models.FitbitData.workout_id == models.Workout.id)
        )
        if new_ids:
            retro_query = retro_query.filter(models.Workout.id.notin_(new_ids))
        retro_candidates = retro_query.all()
        for rw in retro_candidates:
            try:
                update_google_calendar_event(db, user_tokens, rw, rw.fitbit_data)
                cal_fixed += 1
            except Exception as cal_err:
                logger.warning(
                    "Retroactive Calendar fix failed for workout %s (%s): %s",
                    rw.id,
                    rw.title,
                    cal_err,
                )
        if cal_fixed:
            db.commit()
            logger.info(
                "Retroactive Calendar fix: corrected %d workout(s)",
                cal_fixed,
            )

    # Re-match pass: workouts that already have fitbit_log_id but were
    # incorrectly matched to "Walk" (stale calories/duration/HR). Re-fetch
    # the correct "Weights" activity from Fitbit and update the record.
    repaired = 0
    repaired_workouts: list[models.Workout] = []
    _rematch_interrupted = False
    stale_query = (
        db.query(models.Workout)
        .options(joinedload(models.Workout.fitbit_data))
        .filter(
            models.Workout.user_id == current_user.id,
            models.FitbitData.fitbit_log_id.isnot(None),
            models.FitbitData.fitbit_log_id != "",
            models.FitbitData.activity_name == "Weights",
        )
        .join(models.FitbitData, models.FitbitData.workout_id == models.Workout.id)
        .order_by(models.Workout.start_time.desc())
    )
    if new_ids:
        stale_query = stale_query.filter(models.Workout.id.notin_(new_ids))
    stale_candidates = stale_query.all()

    for sc in stale_candidates:
        if _rematch_interrupted:
            break
        try:
            correct_activity = fitbit_utils.get_fitbit_activity(
                db,
                user_tokens,
                sc.start_time,
                sc.end_time,
                required_activity_name="weights" if fitbit_utils.is_weights_workout(sc) else None,
                strict=True,
                correlation_id=correlation_id,
            )
            if not correct_activity:
                continue

            correct_log_id = str(correct_activity.get("logId", "")) or None
            if not correct_log_id or correct_log_id == sc.fitbit_data.fitbit_log_id:
                continue

            # Different log_id — this workout was matched to the wrong
            # activity (e.g. Walk). Update with correct Fitbit data.
            sc.fitbit_data.fitbit_log_id = correct_log_id
            sc.fitbit_data.calories = correct_activity.get("calories", 0)
            sc.fitbit_data.heart_rate_avg = correct_activity.get("averageHeartRate", 0)
            sc.fitbit_data.duration_ms = correct_activity.get("duration", 0)
            sc.fitbit_data.distance_km = correct_activity.get("distance", 0.0)
            sc.fitbit_data.elevation_gain_m = correct_activity.get("elevationGain", 0.0)
            sc.fitbit_data.activity_name = "Weights"
            rematch_azm = fitbit_utils.extract_azm(correct_activity)
            sc.fitbit_data.azm_fat_burn = rematch_azm.get("fatBurnMinutes", 0)
            sc.fitbit_data.azm_cardio = rematch_azm.get("cardioMinutes", 0)
            sc.fitbit_data.azm_peak = rematch_azm.get("peakMinutes", 0)
            logger.info(
                "Bulk sync: re-matched workout %s (%s) → new log_id=%s",
                sc.id,
                sc.title,
                correct_log_id,
            )
            repaired_workouts.append(sc)
            repaired += 1

        except fitbit_utils.FitbitSyncFailure as failure:
            if failure.code == "FITBIT_API_RATE_LIMITED":
                _rematch_interrupted = True
                break
            logger.warning(
                "Re-match error for workout %s (%s): stage=%s code=%s",
                sc.id,
                sc.title,
                failure.stage,
                failure.code,
            )
            continue
        except Exception as error:
            logger.warning(
                "Re-match exception for workout %s (%s): %s",
                sc.id,
                sc.title,
                error,
            )
            continue

    if repaired_workouts:
        db.flush()
        for rw in repaired_workouts:
            try:
                update_google_calendar_event(db, user_tokens, rw, rw.fitbit_data)
            except Exception as cal_err:
                logger.warning(
                    "Calendar update after re-match failed for workout %s: %s",
                    rw.id,
                    cal_err,
                )
        db.commit()
        logger.info(
            "Bulk sync: re-matched %d workout(s) to correct Fitbit activity",
            repaired,
        )

    # Merge re-match interruption into the main flow indicator
    if _rematch_interrupted and not _interrupted_by_rate_limit:
        _interrupted_by_rate_limit = True

    processed_total = len(prepared) + not_found + failed
    _was_interrupted = _interrupted_by_rate_limit or processed_total < len(workouts)

    issues: list[schemas.SyncIssue] = []
    outcome: schemas.SyncOutcome
    if _was_interrupted:
        outcome = schemas.SyncOutcome.PARTIAL
        if _interrupted_by_rate_limit:
            issues.append(
                schemas.SyncIssue(
                    stage=schemas.ServerSyncStage.FITBIT_API,
                    code="FITBIT_API_RATE_LIMITED",
                    retryable=True,
                )
            )
        elif _fatal_failure:
            issues.append(
                schemas.SyncIssue(
                    stage=schemas.ServerSyncStage.FITBIT_API,
                    code=_fatal_failure.code,
                    retryable=_fatal_failure.retryable,
                )
            )
    elif failed:
        outcome = schemas.SyncOutcome.PARTIAL
        issues.append(
            schemas.SyncIssue(
                stage=schemas.ServerSyncStage.PROCESSING,
                code="FITBIT_ACTIVITY_PROCESSING_FAILED",
                retryable=False,
                count=failed,
            )
        )
    elif prepared:
        outcome = schemas.SyncOutcome.SUCCESS
    else:
        outcome = schemas.SyncOutcome.NO_DATA

    remaining = max(0, len(workouts) - processed_total)
    msg_parts: list[str] = []
    if len(prepared) > 0:
        msg_parts.append(f"{len(prepared)} emparejado(s)")
        if cal_updated > 0:
            msg_parts.append(f"{cal_updated} actualizado(s) en Calendar")
    if repaired > 0:
        msg_parts.append(f"{repaired} re-matcher(s) (nuevos datos)")
    if not_found > 0:
        msg_parts.append(f"{not_found} sin match")
    if failed > 0:
        msg_parts.append(f"{failed} con error")
    if remaining > 0:
        msg_parts.append(f"{remaining} pendientes (rate limit)")
    message = f"Sincronización Fitbit: {', '.join(msg_parts)}." if msg_parts else "Sincronización Fitbit completada."

    result = schemas.FitbitBulkSyncResponse(
        synced=len(prepared),
        not_found=not_found,
        total=len(workouts),
        failed=failed,
        outcome=outcome,
        correlation_id=correlation_id,
        issues=issues,
        message=message,
    )
    _sync_log(
        "fitbit_sync.completed",
        correlation_id,
        route,
        outcome=outcome.value,
        synced=len(prepared),
        not_found=not_found,
        failed=failed,
        total=len(workouts),
        duration_ms=round((time.monotonic() - started_at) * 1000),
    )
    return result


@router.post(
    "/sync-fitbit-create-missing",
    response_model=schemas.FitbitCreateMissingResponse,
    responses={
        424: {"model": schemas.SyncErrorResponse},
        500: {"model": schemas.SyncErrorResponse},
        502: {"model": schemas.SyncErrorResponse},
        503: {"model": schemas.SyncErrorResponse},
        504: {"model": schemas.SyncErrorResponse},
    },
)
async def sync_fitbit_create_missing(
    days: int = 30,
    x_correlation_id: Optional[str] = Header(None, alias="X-Correlation-ID"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Fetch recent Fitbit activities and create workouts for any without a DB match."""
    correlation_id = _canonical_correlation_id(x_correlation_id)
    route = "sync_fitbit_create_missing"
    started_at = time.monotonic()
    _sync_log("fitbit_sync.started", correlation_id, route)
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        result = schemas.FitbitCreateMissingResponse(
            outcome=schemas.SyncOutcome.SKIPPED,
            correlation_id=correlation_id,
        )
        _sync_log(
            "fitbit_sync.completed",
            correlation_id,
            route,
            outcome=result.outcome.value,
            created=0,
            failed=0,
            duration_ms=round((time.monotonic() - started_at) * 1000),
        )
        return result

    processing_failures = []
    try:
        pending = _collect_pending_fitbit_activities(
            db,
            user_tokens,
            current_user.id,
            days,
            strict=True,
            correlation_id=correlation_id,
            processing_failures=processing_failures,
        )
    except fitbit_utils.FitbitSyncFailure as failure:
        db.rollback()
        _raise_sync_failure(failure, correlation_id, route, started_at)
    except Exception as error:
        db.rollback()
        failure = _processing_failure("FITBIT_MATCHING_FAILED")
        _sync_log(
            "fitbit_sync.failed",
            correlation_id,
            route,
            stage=failure.stage,
            code=failure.code,
            http_status=500,
            retryable=False,
            exception_type=type(error).__name__,
            duration_ms=round((time.monotonic() - started_at) * 1000),
        )
        detail = schemas.SyncErrorDetail(
            stage=failure.stage,
            code=failure.code,
            message=_SYNC_ERROR_MESSAGES[failure.code],
            correlation_id=correlation_id,
            retryable=False,
        )
        raise HTTPException(status_code=500, detail=detail.model_dump()) from None

    prepared = []
    for activity in pending:
        try:
            act_start = (
                datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
            act_end = act_start + timedelta(milliseconds=activity.get("duration", 0))
        except Exception:
            processing_failures.append("FITBIT_ACTIVITY_PROCESSING_FAILED")
            continue

        try:
            activity_name = _resolve_activity_name(activity)
            new_log_id = str(activity.get("logId", ""))
            azm = fitbit_utils.extract_azm(activity)
        except Exception:
            processing_failures.append("FITBIT_ACTIVITY_PROCESSING_FAILED")
            continue
        try:
            has_gps = fitbit_utils.probe_has_gps(
                db,
                user_tokens,
                new_log_id,
                strict=False,
                correlation_id=correlation_id,
            )
        except fitbit_utils.FitbitSyncFailure as failure:
            db.rollback()
            _raise_sync_failure(failure, correlation_id, route, started_at)
        prepared.append((activity, activity_name, act_start, act_end, new_log_id, azm, has_gps))

    cardio_ex = db.query(models.Exercise).filter(models.Exercise.name == "cardio").first()
    created_activities = []
    try:
        for activity, activity_name, act_start, act_end, new_log_id, azm, has_gps in prepared:
            workout = models.Workout(
                user_id=current_user.id,
                start_time=act_start,
                end_time=act_end,
                title=activity_name,
            )
            db.add(workout)
            db.flush()
            fitbit_data = models.FitbitData(
                workout_id=workout.id,
                fitbit_log_id=new_log_id,
                calories=activity.get("calories", 0),
                heart_rate_avg=activity.get("averageHeartRate", 0),
                duration_ms=activity.get("duration", 0),
                distance_km=activity.get("distance", 0.0),
                elevation_gain_m=activity.get("elevationGain", 0.0),
                activity_name=activity_name,
                azm_fat_burn=azm.get("fatBurnMinutes", 0),
                azm_cardio=azm.get("cardioMinutes", 0),
                azm_peak=azm.get("peakMinutes", 0),
                has_gps=has_gps,
            )
            db.add(fitbit_data)
            workout.fitbit_data = fitbit_data
            act_name_lower = activity_name.lower()
            if cardio_ex and "weights" not in act_name_lower and "walk" not in act_name_lower:
                db.add(
                    models.ExerciseSet(
                        workout_id=workout.id,
                        exercise_id=cardio_ex.id,
                        value=str(activity.get("duration", 0) // 60000),
                        measurement="min",
                        is_completed=True,
                    )
                )
            created_activities.append(
                {"activity_name": activity_name, "date": act_start.strftime("%Y-%m-%d %H:%M")}
            )
        db.flush()
        db.commit()
    except Exception as error:
        db.rollback()
        _raise_sync_failure(
            _persistence_failure(),
            correlation_id,
            route,
            started_at,
            type(error).__name__,
        )

    failed = len(processing_failures)
    outcome = (
        schemas.SyncOutcome.PARTIAL
        if failed
        else schemas.SyncOutcome.SUCCESS
        if prepared
        else schemas.SyncOutcome.NO_DATA
    )
    issues = (
        [
            schemas.SyncIssue(
                stage=schemas.ServerSyncStage.PROCESSING,
                code="FITBIT_ACTIVITY_PROCESSING_FAILED",
                retryable=False,
                count=failed,
            )
        ]
        if failed
        else []
    )
    msg_parts: list[str] = []
    if len(prepared) > 0:
        msg_parts.append(f"{len(prepared)} actividad(es) añadida(s) al calendario")
    if failed > 0:
        msg_parts.append(f"{failed} con error")
    message = f"Sincronización actividades Fitbit: {', '.join(msg_parts)}." if msg_parts else "No se encontraron actividades Fitbit nuevas."
    result = schemas.FitbitCreateMissingResponse(
        created=len(prepared),
        created_activities=created_activities,
        failed=failed,
        outcome=outcome,
        correlation_id=correlation_id,
        issues=issues,
        message=message,
    )
    _sync_log(
        "fitbit_sync.completed",
        correlation_id,
        route,
        outcome=outcome.value,
        created=len(prepared),
        failed=failed,
        duration_ms=round((time.monotonic() - started_at) * 1000),
    )
    return result


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
        db,
        user_tokens,
        db_workout.start_time,
        db_workout.end_time,
        required_activity_name="weights"
        if fitbit_utils.is_weights_workout(db_workout)
        else None,
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

    fitbit_data.fitbit_log_id = str(activity.get("logId", "")) or None
    fitbit_data.calories = activity.get("calories", 0)
    fitbit_data.heart_rate_avg = activity.get("averageHeartRate", 0)
    fitbit_data.duration_ms = activity.get("duration", 0)
    fitbit_data.distance_km = activity.get("distance", 0.0)
    fitbit_data.elevation_gain_m = activity.get("elevationGain", 0.0)
    fitbit_data.activity_name = _resolve_activity_name(activity)
    # The activities-list `hasGps` flag is False for Connected GPS (phone GPS
    # paired to the watch), yet the TCX still contains trackpoints. Probe the
    # TCX directly so manually-synced runs match the bulk/create-missing paths.
    log_id_for_gps = str(activity.get("logId", "")) or None
    fitbit_data.has_gps = (
        fitbit_utils.probe_has_gps(db, user_tokens, log_id_for_gps)
        if log_id_for_gps
        else False
    )

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


@router.post("/sync-gps-flags", response_model=dict)
async def sync_gps_flags(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Retroactively probe GPS for FitbitData records that have a log_id but has_gps=False."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        raise HTTPException(status_code=400, detail="Fitbit not connected.")

    skip_names = ("weights", "walk")
    candidates = (
        db.query(models.FitbitData)
        .join(models.Workout, models.FitbitData.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == current_user.id,
            models.FitbitData.fitbit_log_id.isnot(None),
            models.FitbitData.fitbit_log_id != "",
            models.FitbitData.has_gps.is_(False),
        )
        .all()
    )

    checked, updated = 0, 0
    for fd in candidates:
        if fd.activity_name and fd.activity_name.lower() in skip_names:
            continue
        checked += 1
        try:
            if fitbit_utils.probe_has_gps(db, user_tokens, fd.fitbit_log_id):
                fd.has_gps = True
                updated += 1
        except Exception as error:
            logger.warning(
                "Fitbit GPS probe failed",
                extra={"exception_type": type(error).__name__},
            )

    db.commit()
    return {"updated": updated, "checked": checked}


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

    log_id = workout.fitbit_data.fitbit_log_id
    logger.debug("Fetching GPS route for workout %s, log_id=%s", workout_id, log_id)
    points = fitbit_utils.get_fitbit_route(db, user_tokens, log_id)
    if not points:
        logger.warning(
            "No GPS trackpoints for workout %s (log_id=%s) — "
            "check Fitbit location scope or device GPS",
            workout_id,
            log_id,
        )
        raise HTTPException(
            status_code=404,
            detail="No GPS trackpoints found — reconnect Fitbit with location scope",
        )
    logger.debug("Returning %d GPS points for workout %s", len(points), workout_id)
    return points
