import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, fitbit_utils, models, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fitbit", tags=["fitbit-health"])

_DAILY_RESOURCES = [
    "steps",
    "floors",
    "calories",
    "distance",
    "minutesSedentary",
    "minutesLightlyActive",
    "minutesFairlyActive",
    "minutesVeryActive",
]

_RESOURCE_FIELD_MAP = {
    "steps": "steps",
    "floors": "floors",
    "calories": "calories_out",
    "distance": "distance_km",
    "minutesSedentary": "minutes_sedentary",
    "minutesLightlyActive": "minutes_lightly_active",
    "minutesFairlyActive": "minutes_fairly_active",
    "minutesVeryActive": "minutes_very_active",
}


def _last_synced_date(db: Session, user_id: str, model) -> Optional[str]:
    """Return the most recent date string stored in `model` for this user, or None."""
    result = (
        db.query(func.max(model.date))
        .filter(model.user_id == user_id)
        .scalar()
    )
    return result  # "YYYY-MM-DD" or None


def _determine_sync_range(db: Session, user_id: str) -> tuple[str, str]:
    """Return (from_date, to_date) for the next sync.

    First sync: last 365 days.
    Subsequent: from 1 day before the latest known date to today (overlap to catch updates).
    """
    today = datetime.utcnow().date()
    to_date = today.strftime("%Y-%m-%d")

    last_sleep = _last_synced_date(db, user_id, models.SleepLog)
    last_daily = _last_synced_date(db, user_id, models.DailyHealth)

    known_dates = [d for d in [last_sleep, last_daily] if d]
    if not known_dates:
        from_date = (today - timedelta(days=365)).strftime("%Y-%m-%d")
    else:
        latest_known = max(known_dates)
        overlap_date = datetime.strptime(latest_known, "%Y-%m-%d").date() - timedelta(days=1)
        from_date = overlap_date.strftime("%Y-%m-%d")

    return from_date, to_date


def _upsert_sleep(db: Session, user_id: str, entry: dict) -> bool:
    """Upsert a SleepLog from a raw Fitbit sleep entry. Returns True if saved."""
    log_id = str(entry.get("logId", ""))
    if not log_id:
        return False

    levels = entry.get("levels", {})
    summary = levels.get("summary", {})

    def _parse_dt(val: Optional[str]) -> Optional[datetime]:
        if not val:
            return None
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None

    fields = dict(
        user_id=user_id,
        fitbit_log_id=log_id,
        date=entry.get("dateOfSleep", ""),
        start_time=_parse_dt(entry.get("startTime")),
        end_time=_parse_dt(entry.get("endTime")),
        duration_ms=entry.get("duration", 0),
        efficiency=entry.get("efficiency", 0),
        minutes_asleep=entry.get("minutesAsleep", 0),
        minutes_awake=entry.get("minutesAwake", 0),
        minutes_to_fall_asleep=entry.get("minutesToFallAsleep", 0),
        time_in_bed=entry.get("timeInBed", 0),
        minutes_deep=summary.get("deep", {}).get("minutes", 0),
        minutes_light=summary.get("light", {}).get("minutes", 0),
        minutes_rem=summary.get("rem", {}).get("minutes", 0),
        minutes_wake=summary.get("wake", {}).get("minutes", 0),
        is_main_sleep=bool(entry.get("isMainSleep", True)),
        log_type=entry.get("logType"),
    )

    existing = (
        db.query(models.SleepLog)
        .filter(models.SleepLog.fitbit_log_id == log_id)
        .first()
    )
    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
    else:
        db.add(models.SleepLog(**fields))
    return True


def _sync_sleep_range(
    db: Session,
    user_tokens: models.UserTokens,
    user_id: str,
    from_date: str,
    to_date: str,
) -> int:
    """Fetch sleep records for the range using the list endpoint and upsert. Returns count."""
    before_date = (
        datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    entries = fitbit_utils.get_sleep_list(db, user_tokens, before_date, limit=100)
    saved = 0
    for entry in entries:
        date_str = entry.get("dateOfSleep", "")
        if date_str < from_date:
            break  # list is sorted desc — stop once outside window
        if _upsert_sleep(db, user_id, entry):
            saved += 1
    return saved


def _sync_daily_range(
    db: Session,
    user_tokens: models.UserTokens,
    user_id: str,
    from_date: str,
    to_date: str,
) -> int:
    """Fetch daily activity data using batch time-series endpoints and upsert. Returns day count."""
    # One call per resource covers the entire date range
    ts: dict[str, dict[str, int | float]] = {}

    for resource in _DAILY_RESOURCES:
        try:
            rows = fitbit_utils.get_activity_time_series(
                db, user_tokens, resource, from_date, to_date
            )
            field = _RESOURCE_FIELD_MAP[resource]
            for row in rows:
                date = row["dateTime"]
                ts.setdefault(date, {})[field] = int(float(row.get("value", 0)))
        except Exception as e:
            logger.warning("Time series fetch error for %s: %s", resource, e)

    # Resting heart rate — separate endpoint with different response shape
    try:
        hr_by_date = fitbit_utils.get_resting_hr_time_series(
            db, user_tokens, from_date, to_date
        )
        for date, rhr in hr_by_date.items():
            ts.setdefault(date, {})["resting_heart_rate"] = rhr
    except Exception as e:
        logger.warning("Resting HR time series error: %s", e)

    # Upsert each date
    for date_str, values in ts.items():
        existing = (
            db.query(models.DailyHealth)
            .filter(
                models.DailyHealth.user_id == user_id,
                models.DailyHealth.date == date_str,
            )
            .first()
        )
        fields = {"user_id": user_id, "date": date_str, **values}
        if existing:
            for k, v in fields.items():
                setattr(existing, k, v)
        else:
            db.add(models.DailyHealth(**fields))

    return len(ts)


@router.post("/sync", response_model=dict)
async def sync_health_data(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Smart incremental sync of Fitbit sleep and daily activity.

    First call: fetches up to 365 days of history using batch APIs (~10 API calls).
    Subsequent calls: fetches only from the last known date forward (1-day overlap).
    """
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        return {"sleep_synced": 0, "days_synced": 0, "error": "Fitbit not connected"}

    from_date, to_date = _determine_sync_range(db, current_user.id)
    logger.info("Fitbit health sync for user %s: %s → %s", current_user.id, from_date, to_date)

    sleep_synced = 0
    days_synced = 0

    try:
        sleep_synced = _sync_sleep_range(db, user_tokens, current_user.id, from_date, to_date)
    except Exception as e:
        logger.error("Sleep sync failed: %s", e)

    try:
        days_synced = _sync_daily_range(db, user_tokens, current_user.id, from_date, to_date)
    except Exception as e:
        logger.error("Daily sync failed: %s", e)

    db.commit()
    return {
        "sleep_synced": sleep_synced,
        "days_synced": days_synced,
        "from_date": from_date,
        "to_date": to_date,
    }


@router.get("/sync-status", response_model=dict)
async def get_sync_status(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return the last synced date for sleep and daily data."""
    last_sleep = _last_synced_date(db, current_user.id, models.SleepLog)
    last_daily = _last_synced_date(db, current_user.id, models.DailyHealth)
    return {
        "last_sleep_date": last_sleep,
        "last_daily_date": last_daily,
        "has_data": bool(last_sleep or last_daily),
    }


@router.get("/sleep", response_model=List[schemas.SleepLog])
async def get_sleep_logs(
    days: int = Query(30, ge=1),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return sleep logs for the last N days, most-recent first (main sleep only)."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    return (
        db.query(models.SleepLog)
        .filter(
            models.SleepLog.user_id == current_user.id,
            models.SleepLog.date >= cutoff,
            models.SleepLog.is_main_sleep.is_(True),
        )
        .order_by(models.SleepLog.date.desc())
        .all()
    )


@router.get("/daily", response_model=List[schemas.DailyHealth])
async def get_daily_health(
    days: int = Query(30, ge=1),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return daily health summaries for the last N days, most-recent first."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    return (
        db.query(models.DailyHealth)
        .filter(
            models.DailyHealth.user_id == current_user.id,
            models.DailyHealth.date >= cutoff,
        )
        .order_by(models.DailyHealth.date.desc())
        .all()
    )
