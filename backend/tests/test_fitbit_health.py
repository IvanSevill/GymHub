"""Tests for fitbit_health.py — helper functions and route endpoints."""
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import models
from app.routers.fitbit_health import (
    _apply_upsert,
    _determine_sync_range,
    _last_synced_date,
    _upsert_sleep,
)


# ---------------------------------------------------------------------------
# Shared in-memory DB for pure-function tests
# ---------------------------------------------------------------------------

def _make_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _new_user(db):
    user = models.User(id=str(uuid.uuid4()), email=f"fitbit{uuid.uuid4().hex[:6]}@test.com", name="FitbitUser")
    db.add(user)
    db.commit()
    return user


# ---------------------------------------------------------------------------
# _apply_upsert
# ---------------------------------------------------------------------------

def test_apply_upsert_inserts():
    db = _make_db()
    user = _new_user(db)
    _apply_upsert(db, None, models.DailyHealth, {
        "user_id": user.id, "date": "2026-05-01",
        "steps": 8000, "calories_out": 500,
    })
    db.commit()
    entry = db.query(models.DailyHealth).filter(models.DailyHealth.user_id == user.id).first()
    assert entry is not None
    assert entry.steps == 8000


def test_apply_upsert_updates_existing():
    db = _make_db()
    user = _new_user(db)
    existing = models.DailyHealth(user_id=user.id, date="2026-05-02", steps=5000)
    db.add(existing)
    db.commit()
    db.refresh(existing)

    _apply_upsert(db, existing, models.DailyHealth, {"steps": 9000, "calories_out": 600})
    db.commit()
    assert existing.steps == 9000


# ---------------------------------------------------------------------------
# _last_synced_date
# ---------------------------------------------------------------------------

def test_last_synced_date_none_when_empty():
    db = _make_db()
    user = _new_user(db)
    result = _last_synced_date(db, user.id, models.SleepLog)
    assert result is None


def test_last_synced_date_returns_latest():
    db = _make_db()
    user = _new_user(db)
    for date in ["2026-04-01", "2026-05-15", "2026-03-20"]:
        db.add(models.SleepLog(user_id=user.id, fitbit_log_id=f"log_{date}", date=date))
    db.commit()

    result = _last_synced_date(db, user.id, models.SleepLog)
    assert result == "2026-05-15"


# ---------------------------------------------------------------------------
# _determine_sync_range
# ---------------------------------------------------------------------------

def test_determine_sync_range_first_sync():
    db = _make_db()
    user = _new_user(db)
    from_date, to_date = _determine_sync_range(db, user.id)
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt = datetime.strptime(to_date, "%Y-%m-%d")
    assert (to_dt - from_dt).days >= 364


def test_determine_sync_range_incremental():
    db = _make_db()
    user = _new_user(db)
    db.add(models.SleepLog(user_id=user.id, fitbit_log_id="log1", date="2026-05-10"))
    db.commit()

    from_date, to_date = _determine_sync_range(db, user.id)
    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    # Should be 1 day before 2026-05-10 = 2026-05-09
    assert from_dt <= datetime(2026, 5, 10)
    assert (datetime.strptime(to_date, "%Y-%m-%d") - from_dt).days < 100


# ---------------------------------------------------------------------------
# _upsert_sleep
# ---------------------------------------------------------------------------

def test_upsert_sleep_creates_record():
    db = _make_db()
    user = _new_user(db)
    entry = {
        "logId": 12345678,
        "dateOfSleep": "2026-05-01",
        "startTime": "2026-05-01T23:00:00",
        "endTime": "2026-05-02T07:00:00",
        "duration": 28800000,
        "efficiency": 92,
        "minutesAsleep": 450,
        "minutesAwake": 30,
        "minutesToFallAsleep": 10,
        "timeInBed": 480,
        "isMainSleep": True,
        "levels": {
            "summary": {
                "deep": {"minutes": 60},
                "light": {"minutes": 200},
                "rem": {"minutes": 120},
                "wake": {"minutes": 30},
            }
        },
    }
    result = _upsert_sleep(db, user.id, entry)
    assert result is True
    db.commit()

    log = db.query(models.SleepLog).filter(models.SleepLog.fitbit_log_id == "12345678").first()
    assert log is not None
    assert log.efficiency == 92
    assert log.minutes_deep == 60
    assert log.minutes_rem == 120


def test_upsert_sleep_skips_missing_log_id():
    db = _make_db()
    user = _new_user(db)
    result = _upsert_sleep(db, user.id, {"dateOfSleep": "2026-05-01"})
    assert result is False


def test_upsert_sleep_updates_existing():
    db = _make_db()
    user = _new_user(db)
    existing = models.SleepLog(user_id=user.id, fitbit_log_id="99999", date="2026-04-01", efficiency=80)
    db.add(existing)
    db.commit()
    db.refresh(existing)

    _upsert_sleep(db, user.id, {
        "logId": 99999,
        "dateOfSleep": "2026-04-01",
        "efficiency": 90,
        "levels": {"summary": {}},
    })
    db.commit()
    db.expire_all()
    updated = db.query(models.SleepLog).filter(models.SleepLog.fitbit_log_id == "99999").first()
    assert updated.efficiency == 90


# ---------------------------------------------------------------------------
# Route endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_fitbit_sync_no_tokens_returns_zero(client, auth_headers):
    resp = await client.post("/fitbit/sync", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["sleep_synced"] == 0
    assert data["days_synced"] == 0
    assert "error" in data


@pytest.mark.anyio
async def test_fitbit_sync_status(client, auth_headers):
    resp = await client.get("/fitbit/sync-status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "last_sleep_date" in data
    assert "has_data" in data
    assert data["has_data"] is False


@pytest.mark.anyio
async def test_fitbit_sleep_empty(client, auth_headers):
    resp = await client.get("/fitbit/sleep", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_fitbit_daily_empty(client, auth_headers):
    resp = await client.get("/fitbit/daily", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []
