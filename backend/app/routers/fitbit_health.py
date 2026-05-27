import logging
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import auth, database, fitbit_utils, models, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fitbit", tags=["fitbit-health"])


def _upsert_sleep(db: Session, user_id: str, entry: dict) -> None:
    """Create or update a SleepLog record from a raw Fitbit sleep entry."""
    log_id = str(entry.get("logId", ""))
    if not log_id:
        return

    levels = entry.get("levels", {})
    summary = levels.get("summary", {})

    existing = (
        db.query(models.SleepLog)
        .filter(models.SleepLog.fitbit_log_id == log_id)
        .first()
    )

    def _parse_dt(val: str | None) -> datetime | None:
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

    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
    else:
        db.add(models.SleepLog(**fields))


def _upsert_daily(db: Session, user_id: str, date_str: str, summary: dict) -> None:
    """Create or update a DailyHealth record from a raw Fitbit daily summary."""
    distances = {d["activity"]: d["distance"] for d in summary.get("distances", [])}

    existing = (
        db.query(models.DailyHealth)
        .filter(
            models.DailyHealth.user_id == user_id,
            models.DailyHealth.date == date_str,
        )
        .first()
    )

    fields = dict(
        user_id=user_id,
        date=date_str,
        steps=summary.get("steps", 0),
        floors=summary.get("floors", 0),
        resting_heart_rate=summary.get("restingHeartRate", 0),
        calories_out=summary.get("caloriesOut", 0),
        minutes_sedentary=summary.get("sedentaryMinutes", 0),
        minutes_lightly_active=summary.get("lightlyActiveMinutes", 0),
        minutes_fairly_active=summary.get("fairlyActiveMinutes", 0),
        minutes_very_active=summary.get("veryActiveMinutes", 0),
        distance_km=distances.get("total", 0.0),
    )

    if existing:
        for k, v in fields.items():
            setattr(existing, k, v)
    else:
        db.add(models.DailyHealth(**fields))


@router.post("/sync", response_model=dict)
async def sync_health_data(
    days: int = Query(30, ge=1, le=365),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Sync Fitbit sleep logs and daily activity summaries for the last N days."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if not user_tokens or not user_tokens.fitbit_access_token:
        return {"sleep_synced": 0, "days_synced": 0, "error": "Fitbit not connected"}

    sleep_synced = 0
    days_synced = 0

    for i in range(days):
        date = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        try:
            sleep_entries = fitbit_utils.get_sleep_for_date(db, user_tokens, date)
            for entry in sleep_entries:
                _upsert_sleep(db, current_user.id, entry)
                sleep_synced += 1
        except Exception as e:
            logger.warning("Sleep sync error for %s: %s", date, e)

        try:
            summary = fitbit_utils.get_daily_activity(db, user_tokens, date)
            if summary:
                _upsert_daily(db, current_user.id, date, summary)
                days_synced += 1
        except Exception as e:
            logger.warning("Daily activity sync error for %s: %s", date, e)

    db.commit()
    return {"sleep_synced": sleep_synced, "days_synced": days_synced}


@router.get("/sleep", response_model=List[schemas.SleepLog])
async def get_sleep_logs(
    days: int = Query(30, ge=1, le=365),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return Fitbit sleep logs for the last N days, most-recent first."""
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
    days: int = Query(30, ge=1, le=365),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return Fitbit daily health summaries for the last N days, most-recent first."""
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
