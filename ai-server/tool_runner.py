"""Executes the 13 GymHub AI tools: 9 read (direct DB) + 4 write (backend API)."""

import asyncio
import os
import re
from datetime import datetime, timedelta

import httpx
from sqlalchemy import desc, func
from sqlalchemy.orm import Session, joinedload

from database import SessionLocal
from models import (
    DailyHealth,
    Exercise,
    ExerciseSet,
    FitbitData,
    Muscle,
    SleepLog,
    Workout,
)


# ---------------------------------------------------------------------------
# Shared helpers (adapted from backend/app/routers/analytics.py)
# ---------------------------------------------------------------------------

def _parse_value(value_str: str) -> float:
    # Each set stores a single weight; only the Spanish decimal comma needs
    # normalizing. Non-numeric values (e.g. 'bodyweight') yield 0.0.
    m = re.match(r"\s*(\d+\.?\d*)", value_str.replace(",", "."))
    return float(m.group(1)) if m else 0.0


def _count_workouts(db: Session, uid: str, start: datetime, end: datetime) -> int:
    return (
        db.query(func.count(Workout.id))
        .filter(Workout.user_id == uid, Workout.start_time >= start, Workout.start_time < end)
        .scalar()
        or 0
    )


def _sum_volume(db: Session, uid: str, start: datetime, end: datetime) -> float:
    rows = (
        db.query(ExerciseSet.value)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(Workout.user_id == uid, Workout.start_time >= start, Workout.start_time < end, ExerciseSet.value != "")
        .all()
    )
    return sum(_parse_value(r.value) for r in rows)


def _avg_duration(db: Session, uid: str, start: datetime, end: datetime):
    rows = (
        db.query(Workout.start_time, Workout.end_time, FitbitData.duration_ms)
        .outerjoin(FitbitData, FitbitData.workout_id == Workout.id)
        .filter(Workout.user_id == uid, Workout.start_time >= start, Workout.start_time < end)
        .all()
    )
    durations = []
    for s, e, ms in rows:
        if ms and ms > 0:
            durations.append(ms / 60000)
        elif e and e > s:
            durations.append((e - s).total_seconds() / 60)
    return round(sum(durations) / len(durations), 1) if durations else None


def _count_prs(db: Session, uid: str, start: datetime, end: datetime) -> int:
    period = (
        db.query(ExerciseSet.exercise_id, ExerciseSet.value)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(Workout.user_id == uid, Workout.start_time >= start, Workout.start_time < end, ExerciseSet.value != "")
        .all()
    )
    pre = (
        db.query(ExerciseSet.exercise_id, ExerciseSet.value)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .filter(Workout.user_id == uid, Workout.start_time < start, ExerciseSet.value != "")
        .all()
    )
    pre_max: dict[str, float] = {}
    for eid, v in pre:
        val = _parse_value(v)
        if val > 0:
            pre_max[eid] = max(pre_max.get(eid, 0.0), val)
    period_max: dict[str, float] = {}
    for eid, v in period:
        val = _parse_value(v)
        if val > 0:
            period_max[eid] = max(period_max.get(eid, 0.0), val)
    return sum(1 for eid, mv in period_max.items() if mv > pre_max.get(eid, 0.0))


# ---------------------------------------------------------------------------
# Read tools
# ---------------------------------------------------------------------------

def _get_workouts(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 30))
    limit = int(args.get("limit", 20))
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Workout)
        .options(
            joinedload(Workout.exercise_sets).joinedload(ExerciseSet.exercise).joinedload(Exercise.muscle),
            joinedload(Workout.fitbit_data),
        )
        .filter(Workout.user_id == uid, Workout.start_time >= cutoff)
        .order_by(Workout.start_time.desc())
        .limit(limit)
        .all()
    )
    result = []
    for w in rows:
        exercises: dict[str, list[str]] = {}
        for s in w.exercise_sets:
            if s.exercise:
                nm = s.exercise.name
                if s.value:
                    exercises.setdefault(nm, []).append(f"{s.value} {s.measurement}")
        dur = None
        if w.fitbit_data and w.fitbit_data.duration_ms:
            dur = round(w.fitbit_data.duration_ms / 60000, 1)
        elif w.end_time and w.start_time:
            dur = round((w.end_time - w.start_time).total_seconds() / 60, 1)
        fitbit = None
        if w.fitbit_data:
            fitbit = {
                "calories": w.fitbit_data.calories,
                "heart_rate_avg": w.fitbit_data.heart_rate_avg,
                "azm_fat_burn": w.fitbit_data.azm_fat_burn,
                "azm_cardio": w.fitbit_data.azm_cardio,
                "azm_peak": w.fitbit_data.azm_peak,
                "activity_name": w.fitbit_data.activity_name,
            }
        result.append({
            "id": w.id,
            "title": w.title,
            "date": w.start_time.strftime("%Y-%m-%d %H:%M"),
            "duration_min": dur,
            "exercises": exercises,
            "fitbit": fitbit,
        })
    return {"workouts": result, "total": len(result)}


def _get_exercise_prs(args: dict, uid: str, db: Session) -> dict:
    name_filter = args.get("exercise_name")
    q = (
        db.query(Exercise.id, Exercise.name, Muscle.name.label("muscle"), ExerciseSet.value, ExerciseSet.measurement, Workout.start_time)
        .join(ExerciseSet, Exercise.id == ExerciseSet.exercise_id)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .join(Muscle, Exercise.muscle_id == Muscle.id)
        .filter(Workout.user_id == uid, ExerciseSet.value != "", ExerciseSet.value != "0")
    )
    if name_filter:
        q = q.filter(Exercise.name.ilike(f"%{name_filter}%"))
    max_lifts: dict[str, dict] = {}
    for eid, ename, muscle, val, meas, date in q.all():
        v = _parse_value(val)
        if v > 0 and (eid not in max_lifts or v > max_lifts[eid]["value"]):
            max_lifts[eid] = {"exercise": ename, "muscle": muscle, "value": v, "measurement": meas, "date": date.strftime("%Y-%m-%d")}
    return {"prs": sorted(max_lifts.values(), key=lambda x: x["muscle"])}


def _get_analytics_summary(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 30))
    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)
    curr = {
        "workout_count": _count_workouts(db, uid, cutoff, now),
        "total_volume_kg": round(_sum_volume(db, uid, cutoff, now), 1),
        "avg_duration_min": _avg_duration(db, uid, cutoff, now),
        "pr_count": _count_prs(db, uid, cutoff, now),
    }
    if days >= 365:
        prev = {"workout_count": 0, "total_volume_kg": 0.0, "avg_duration_min": None, "pr_count": 0}
    else:
        pc = cutoff - timedelta(days=days)
        prev = {
            "workout_count": _count_workouts(db, uid, pc, cutoff),
            "total_volume_kg": round(_sum_volume(db, uid, pc, cutoff), 1),
            "avg_duration_min": _avg_duration(db, uid, pc, cutoff),
            "pr_count": _count_prs(db, uid, pc, cutoff),
        }
    return {"current": curr, "previous": prev, "period_days": days}


def _get_exercise_frequency(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 90))
    muscle_filter = args.get("muscle_name")
    cutoff = datetime.utcnow() - timedelta(days=days)
    q = (
        db.query(Exercise.name, Muscle.name.label("muscle"), func.count(func.distinct(Workout.id)).label("sessions"))
        .join(ExerciseSet, Exercise.id == ExerciseSet.exercise_id)
        .join(Workout, ExerciseSet.workout_id == Workout.id)
        .join(Muscle, Exercise.muscle_id == Muscle.id)
        .filter(Workout.user_id == uid, Workout.start_time >= cutoff)
    )
    if muscle_filter:
        q = q.filter(Muscle.name.ilike(f"%{muscle_filter}%"))
    rows = q.group_by(Exercise.id, Muscle.id).order_by(desc("sessions")).all()
    return {"exercises": [{"exercise": n, "muscle": m, "sessions": s} for n, m, s in rows]}


def _get_exercise_history(args: dict, uid: str, db: Session) -> dict:
    name = args.get("exercise_name", "")
    days = int(args.get("days", 90))
    cutoff = datetime.utcnow() - timedelta(days=days)
    ex = db.query(Exercise).filter(Exercise.name.ilike(f"%{name}%")).first()
    if not ex:
        return {"error": f"Ejercicio '{name}' no encontrado.", "history": []}
    rows = (
        db.query(Workout.start_time, ExerciseSet.value, ExerciseSet.measurement)
        .join(ExerciseSet, Workout.id == ExerciseSet.workout_id)
        .filter(Workout.user_id == uid, ExerciseSet.exercise_id == ex.id, Workout.start_time >= cutoff)
        .order_by(Workout.start_time)
        .all()
    )
    sessions: dict[str, list] = {}
    for st, v, m in rows:
        k = st.strftime("%Y-%m-%d")
        sessions.setdefault(k, []).append({"value": v, "measurement": m})
    return {"exercise": ex.name, "history": [{"date": d, "sets": s} for d, s in sorted(sessions.items())]}


def _get_weight_progress(args: dict, uid: str, db: Session) -> dict:
    name = args.get("exercise_name", "")
    days = int(args.get("days", 60))
    cutoff = datetime.utcnow() - timedelta(days=days)
    ex = db.query(Exercise).filter(Exercise.name.ilike(f"%{name}%")).first()
    if not ex:
        return {"error": f"Ejercicio '{name}' no encontrado.", "data": []}
    rows = (
        db.query(Workout.start_time, ExerciseSet.value, ExerciseSet.measurement)
        .join(ExerciseSet, Workout.id == ExerciseSet.workout_id)
        .filter(Workout.user_id == uid, ExerciseSet.exercise_id == ex.id, Workout.start_time >= cutoff, ExerciseSet.value != "", ExerciseSet.value != "0")
        .order_by(Workout.start_time)
        .all()
    )
    daily: dict[str, float] = {}
    unit = "kg"
    for st, v, m in rows:
        val = _parse_value(v)
        if val > 0:
            k = st.strftime("%Y-%m-%d")
            unit = m
            daily[k] = max(daily.get(k, 0.0), val)
    return {"exercise": ex.name, "unit": unit, "data": [{"date": d, "max_value": v} for d, v in sorted(daily.items())]}


def _get_daily_health(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 14))
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = db.query(DailyHealth).filter(DailyHealth.user_id == uid, DailyHealth.date >= cutoff).order_by(DailyHealth.date).all()
    data = [
        {"date": r.date, "steps": r.steps, "floors": r.floors, "resting_heart_rate": r.resting_heart_rate,
         "calories_out": r.calories_out, "distance_km": r.distance_km, "minutes_sedentary": r.minutes_sedentary,
         "minutes_lightly_active": r.minutes_lightly_active, "minutes_fairly_active": r.minutes_fairly_active,
         "minutes_very_active": r.minutes_very_active}
        for r in rows
    ]
    avg_steps = round(sum(d["steps"] for d in data) / len(data)) if data else 0
    avg_cal = round(sum(d["calories_out"] for d in data) / len(data)) if data else 0
    return {"data": data, "avg_steps": avg_steps, "avg_calories": avg_cal}


def _get_sleep_logs(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 14))
    cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = (
        db.query(SleepLog)
        .filter(SleepLog.user_id == uid, SleepLog.is_main_sleep.is_(True), SleepLog.date >= cutoff)
        .order_by(SleepLog.date)
        .all()
    )
    logs = [
        {"date": r.date, "duration_h": round(r.duration_ms / 3600000, 2) if r.duration_ms else 0,
         "efficiency": r.efficiency, "minutes_deep": r.minutes_deep, "minutes_rem": r.minutes_rem,
         "minutes_light": r.minutes_light, "minutes_awake": r.minutes_wake}
        for r in rows
    ]
    avg_dur = round(sum(lg["duration_h"] for lg in logs) / len(logs), 2) if logs else 0
    avg_eff = round(sum(lg["efficiency"] for lg in logs) / len(logs)) if logs else 0
    return {"logs": logs, "avg_duration_h": avg_dur, "avg_efficiency": avg_eff}


def _get_muscle_balance(args: dict, uid: str, db: Session) -> dict:
    days = int(args.get("days", 90))
    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(Workout.start_time, Muscle.name, ExerciseSet.value)
        .join(ExerciseSet, Workout.id == ExerciseSet.workout_id)
        .join(Exercise, ExerciseSet.exercise_id == Exercise.id)
        .join(Muscle, Exercise.muscle_id == Muscle.id)
        .filter(Workout.user_id == uid, Workout.start_time >= cutoff, ExerciseSet.value != "")
        .all()
    )
    vol_map: dict[tuple, float] = {}
    totals: dict[str, float] = {}
    for st, muscle, v in rows:
        val = _parse_value(v)
        if val <= 0:
            continue
        week = st.strftime("%G-W%V")
        vol_map[(week, muscle)] = vol_map.get((week, muscle), 0.0) + val
        totals[muscle] = totals.get(muscle, 0.0) + val
    return {
        "balance": [{"week": w, "muscle": m, "volume_kg": round(v, 1)} for (w, m), v in sorted(vol_map.items())],
        "totals_by_muscle": {m: round(v, 1) for m, v in sorted(totals.items())},
    }


_READ_DISPATCH = {
    "get_workouts": _get_workouts,
    "get_exercise_prs": _get_exercise_prs,
    "get_analytics_summary": _get_analytics_summary,
    "get_exercise_frequency": _get_exercise_frequency,
    "get_exercise_history": _get_exercise_history,
    "get_weight_progress": _get_weight_progress,
    "get_daily_health": _get_daily_health,
    "get_sleep_logs": _get_sleep_logs,
    "get_muscle_balance": _get_muscle_balance,
}


# ---------------------------------------------------------------------------
# Write tools (call backend API)
# ---------------------------------------------------------------------------

_BACKEND = os.getenv("BACKEND_URL", "http://localhost:8000")


async def _create_workout(args: dict, token: str) -> dict:
    db = SessionLocal()
    try:
        sets = []
        for item in args.get("exercises", []):
            ex = db.query(Exercise).filter(Exercise.name.ilike(f"%{item['exercise_name']}%")).first()
            if not ex:
                return {"error": f"Ejercicio '{item['exercise_name']}' no encontrado."}
            for s in item.get("sets", []):
                sets.append({"exercise_id": ex.id, "value": s["value"], "measurement": s["measurement"], "is_completed": True})
    finally:
        db.close()
    payload = {"title": args["title"], "start_time": args["start_time"], "end_time": args["end_time"], "exercise_sets": sets}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{_BACKEND}/workouts", json=payload, headers={"Authorization": f"Bearer {token}"}, timeout=30.0)
    if r.status_code == 200:
        w = r.json()
        return {"success": True, "workout_id": w["id"], "title": w["title"], "sets_created": len(w.get("exercise_sets", []))}
    return {"error": f"Error {r.status_code}: {r.text}"}


async def _add_set_to_workout(args: dict, token: str) -> dict:
    wid = args["workout_id"]
    db = SessionLocal()
    try:
        ex = db.query(Exercise).filter(Exercise.name.ilike(f"%{args['exercise_name']}%")).first()
        if not ex:
            return {"error": f"Ejercicio '{args['exercise_name']}' no encontrado."}
        w = db.query(Workout).options(joinedload(Workout.exercise_sets)).filter(Workout.id == wid).first()
        if not w:
            return {"error": f"Workout '{wid}' no encontrado."}
        existing = [{"exercise_id": s.exercise_id, "value": s.value, "measurement": s.measurement, "is_completed": s.is_completed} for s in w.exercise_sets]
        existing.append({"exercise_id": ex.id, "value": args["value"], "measurement": args["measurement"], "is_completed": True})
        payload = {"title": w.title, "start_time": w.start_time.isoformat(), "end_time": w.end_time.isoformat(), "exercise_sets": existing}
        ex_name = ex.name
    finally:
        db.close()
    async with httpx.AsyncClient() as client:
        r = await client.put(f"{_BACKEND}/workouts/{wid}", json=payload, headers={"Authorization": f"Bearer {token}"}, timeout=30.0)
    if r.status_code == 200:
        return {"success": True, "exercise": ex_name, "set_added": f"{args['value']} {args['measurement']}", "total_sets": len(existing)}
    return {"error": f"Error {r.status_code}: {r.text}"}


async def _sync_pending_cardio(args: dict, token: str) -> dict:
    days = int(args.get("days", 30))
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{_BACKEND}/workouts/sync-fitbit-create-missing?days={days}", headers={"Authorization": f"Bearer {token}"}, timeout=60.0)
    if r.status_code == 200:
        return {"success": True, "created": r.json().get("created", 0)}
    return {"error": f"Error {r.status_code}: {r.text}"}


async def _sync_fitbit_to_workout(args: dict, token: str) -> dict:
    wid = args["workout_id"]
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{_BACKEND}/workouts/{wid}/sync-fitbit", headers={"Authorization": f"Bearer {token}"}, timeout=30.0)
    if r.status_code == 200:
        d = r.json()
        return {"success": True, "calories": d.get("calories"), "heart_rate_avg": d.get("heart_rate_avg"), "duration_min": round(d.get("duration_ms", 0) / 60000, 1)}
    return {"error": f"Error {r.status_code}: {r.text}"}


_WRITE_DISPATCH = {
    "create_workout": _create_workout,
    "add_set_to_workout": _add_set_to_workout,
    "sync_pending_cardio": _sync_pending_cardio,
    "sync_fitbit_to_workout": _sync_fitbit_to_workout,
}


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

async def execute_tool(name: str, args: dict, user_id: str, token: str) -> dict:
    if name in _READ_DISPATCH:
        db = SessionLocal()
        try:
            return await asyncio.to_thread(_READ_DISPATCH[name], args, user_id, db)
        finally:
            db.close()
    if name in _WRITE_DISPATCH:
        return await _WRITE_DISPATCH[name](args, token)
    return {"error": f"Herramienta desconocida: {name}"}
