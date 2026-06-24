"""Read tools — fetch the user's data through the GymHub backend REST API.

Tools no longer touch the database directly; they call the backend via
``backend_client`` (authenticated with the user's JWT from the environment).
The ``user_id``/``db`` parameters are kept in the signatures for backward
compatibility with the server wrappers but are ignored.
"""

import re
import statistics
from datetime import datetime, timedelta, timezone

import backend_client


def _days_cutoff_str(days: int) -> str:
    """YYYY-MM-DD cutoff `days` days ago (UTC, naive)."""
    return (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).strftime("%Y-%m-%d")


def _parse_exercise_value(value_str: str) -> float:
    """Return the numeric weight stored in an ExerciseSet value.

    Normalises Spanish decimal comma. Non-numeric values yield 0.0.
    """
    m = re.match(r"\s*(\d+\.?\d*)", value_str.replace(",", "."))
    return float(m.group(1)) if m else 0.0


def _find_exercise_by_name(exercise_name: str) -> tuple:
    """Return (exercise_id, resolved_name) by partial name match via REST."""
    data = backend_client.get("/exercises")
    if backend_client.is_error(data) or not isinstance(data, list):
        return None, None
    n = exercise_name.lower()
    for ex in data:
        if n in ex.get("name", "").lower():
            return ex.get("id"), ex.get("name")
    return None, None


def _duration_min_from_workout(w: dict):
    """Compute duration in minutes from a REST workout dict."""
    fitbit = w.get("fitbit_data") or {}
    dur_ms = fitbit.get("duration_ms") or 0
    if dur_ms > 0:
        return round(dur_ms / 60_000, 1)
    start = w.get("start_time", "")
    end = w.get("end_time", "")
    if start and end and end > start:
        try:
            s = datetime.fromisoformat(start.rstrip("Z"))
            e = datetime.fromisoformat(end.rstrip("Z"))
            return round((e - s).total_seconds() / 60, 1)
        except Exception:
            pass
    return None


def _group_sets(w: dict) -> dict:
    """Group exercise sets by exercise name into {name: ['80 kg', ...]}."""
    exercises: dict = {}
    for s in w.get("exercise_sets", []):
        ex = s.get("exercise") or {}
        name = ex.get("name", "Unknown")
        label = f"{s.get('value', '')} {s.get('measurement', '')}".strip()
        exercises.setdefault(name, []).append(label)
    return exercises


def _volume_from_workouts(workouts_list: list) -> float:
    """Sum parsed weight values across all sets in a list of REST workout dicts."""
    total = 0.0
    for w in workouts_list:
        for s in w.get("exercise_sets", []):
            total += _parse_exercise_value(s.get("value", ""))
    return total


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def get_workouts(args: dict, user_id: str, db) -> dict:
    """Return recent workouts with exercise sets and Fitbit data."""
    days = int(args.get("days", 30))
    limit = int(args.get("limit", 20))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    data = backend_client.get("/workouts", {"start_date": cutoff.isoformat()})
    if backend_client.is_error(data):
        return data
    workouts = data if isinstance(data, list) else []
    result = []
    for w in workouts[:limit]:
        fitbit = w.get("fitbit_data") or {}
        fitbit_dict = None
        if any(fitbit.get(k) for k in ("calories", "heart_rate_avg", "duration_ms", "distance_km")):
            fitbit_dict = {
                "calories": fitbit.get("calories"),
                "heart_rate_avg": fitbit.get("heart_rate_avg"),
                "distance_km": fitbit.get("distance_km"),
                "azm_fat_burn": fitbit.get("azm_fat_burn"),
                "azm_cardio": fitbit.get("azm_cardio"),
                "azm_peak": fitbit.get("azm_peak"),
            }
        start_str = w.get("start_time", "")
        result.append({
            "id": w.get("id"),
            "title": w.get("title"),
            "date": start_str[:16].replace("T", " ") if start_str else "",
            "duration_min": _duration_min_from_workout(w),
            "exercises": _group_sets(w),
            "fitbit": fitbit_dict,
        })
    return {"workouts": result, "total": len(result)}


def get_exercise_prs(args: dict, user_id: str, db) -> dict:
    """All-time personal records per exercise (optionally a single exercise)."""
    exercise_name = args.get("exercise_name")
    data = backend_client.get("/analytics/max-lifts", {"days": 3650})
    if backend_client.is_error(data):
        return data
    items = data if isinstance(data, list) else []
    if exercise_name:
        n = exercise_name.lower()
        items = [p for p in items if n in str(p).lower()]
    return {"prs": items}


def get_analytics_summary(args: dict, user_id: str, db) -> dict:
    """Return KPI summary (current vs previous period) from the backend."""
    days = int(args.get("days", 30))
    data = backend_client.get("/analytics/summary", {"days": days})
    if backend_client.is_error(data):
        return data
    data["period_days"] = days
    return data


def get_exercise_frequency(args: dict, user_id: str, db) -> dict:
    """Most-trained exercises in the period (optionally filtered by muscle)."""
    days = int(args.get("days", 90))
    muscle_name = args.get("muscle_name")
    data = backend_client.get("/analytics/frequency", {"days": days})
    if backend_client.is_error(data):
        return data
    items = data if isinstance(data, list) else []
    if muscle_name:
        m = muscle_name.lower()
        items = [e for e in items if m in str(e).lower()]
    return {"exercises": items}


def get_exercise_history(args: dict, user_id: str, db) -> dict:
    """Return all sets for a specific exercise grouped by session date."""
    exercise_name = args.get("exercise_name", "")
    days = int(args.get("days", 90))
    cutoff = _days_cutoff_str(days)

    exercise_id, resolved_name = _find_exercise_by_name(exercise_name)
    if not exercise_id:
        return {"error": f"Exercise not found: {exercise_name}"}

    data = backend_client.get(f"/analytics/exercise-history/{exercise_id}")
    if backend_client.is_error(data):
        return data

    rows = [r for r in (data if isinstance(data, list) else []) if str(r.get("date", ""))[:10] >= cutoff]
    by_date: dict = {}
    for r in rows:
        date_key = str(r.get("date", ""))[:10]
        by_date.setdefault(date_key, []).append({"value": r.get("value"), "measurement": r.get("measurement")})
    history = [{"date": d, "sets": sets_list} for d, sets_list in sorted(by_date.items(), reverse=True)]
    return {"exercise": resolved_name, "history": history}


def get_weight_progress(args: dict, user_id: str, db) -> dict:
    """Return daily maximum value for a specific exercise over time."""
    exercise_name = args.get("exercise_name", "")
    days = int(args.get("days", 60))

    exercise_id, resolved_name = _find_exercise_by_name(exercise_name)
    if not exercise_id:
        return {"error": f"Exercise not found: {exercise_name}"}

    data = backend_client.get("/analytics/weight-progress", {"exercise_id": exercise_id, "days": days})
    if backend_client.is_error(data):
        return data

    points = data if isinstance(data, list) else []
    result_data = [{"date": str(p.get("date", ""))[:10], "max_value": p.get("value")} for p in points]
    return {"exercise": resolved_name, "unit": "kg", "data": result_data}


def get_daily_health(args: dict, user_id: str, db) -> dict:
    """Return Fitbit daily health data (steps, calories, active minutes, etc.)."""
    days = int(args.get("days", 14))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/fitbit/daily", {"days": days})
    if backend_client.is_error(data):
        return data
    rows = [d for d in data if str(d.get("date", "")) >= cutoff] if isinstance(data, list) else []
    avg_steps = round(sum(d.get("steps") or 0 for d in rows) / len(rows)) if rows else 0
    avg_calories = round(sum(d.get("calories_out") or 0 for d in rows) / len(rows)) if rows else 0
    return {"data": rows, "avg_steps": avg_steps, "avg_calories": avg_calories}


def get_pending_cardio(args: dict, user_id: str, db) -> dict:
    """List Fitbit activities (last N days) not yet imported as GymHub workouts."""
    days = int(args.get("days", 30))
    data = backend_client.get("/workouts/fitbit-pending", {"days": days})
    if backend_client.is_error(data):
        return data
    pending = data if isinstance(data, list) else []
    return {"pending": pending, "total": len(pending)}


def get_sleep_logs(args: dict, user_id: str, db) -> dict:
    """Return Fitbit sleep logs with duration, efficiency, and stage breakdown."""
    days = int(args.get("days", 14))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/fitbit/sleep", {"days": days})
    if backend_client.is_error(data):
        return data
    rows = [s for s in data if str(s.get("date", "")) >= cutoff] if isinstance(data, list) else []
    logs = [
        {
            "date": r.get("date"),
            "duration_h": round((r.get("duration_ms") or 0) / 3_600_000, 2),
            "efficiency": r.get("efficiency"),
            "minutes_deep": r.get("minutes_deep"),
            "minutes_rem": r.get("minutes_rem"),
            "minutes_light": r.get("minutes_light"),
            "minutes_awake": r.get("minutes_wake", r.get("minutes_awake")),
        }
        for r in rows
    ]
    avg_duration_h = round(sum(x["duration_h"] for x in logs) / len(logs), 2) if logs else 0.0
    avg_efficiency = round(sum((x["efficiency"] or 0) for x in logs) / len(logs)) if logs else 0
    return {"logs": logs, "avg_duration_h": avg_duration_h, "avg_efficiency": avg_efficiency}


def get_muscle_balance(args: dict, user_id: str, db) -> dict:
    """Return training volume per muscle group per ISO week (from the backend)."""
    days = int(args.get("days", 90))
    data = backend_client.get("/analytics/muscle-balance", {"days": days})
    if backend_client.is_error(data):
        return data
    balance = data if isinstance(data, list) else []
    totals_by_muscle: dict = {}
    for entry in balance:
        m = entry.get("muscle")
        vol = entry.get("volume_kg") or entry.get("volume") or 0
        totals_by_muscle[m] = round(totals_by_muscle.get(m, 0.0) + vol, 1)
    return {"balance": balance, "totals_by_muscle": totals_by_muscle}


def get_workout_count_in_period(args: dict, user_id: str, db) -> dict:
    """Count workouts between two dates (inclusive). Dates as YYYY-MM-DD."""
    start_date: str = args["start_date"]
    end_date: str = args["end_date"]
    start_iso = datetime.strptime(start_date, "%Y-%m-%d").isoformat()
    end_iso = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).isoformat()
    data = backend_client.get("/workouts", {"start_date": start_iso, "end_date": end_iso})
    if backend_client.is_error(data):
        return data
    count = len(data) if isinstance(data, list) else 0
    return {"count": count, "start_date": start_date, "end_date": end_date}


def get_workouts_in_period(args: dict, user_id: str, db) -> list:
    """Return workouts with full exercise detail between two dates (inclusive)."""
    start_date: str = args["start_date"]
    end_date: str = args["end_date"]
    start_iso = datetime.strptime(start_date, "%Y-%m-%d").isoformat()
    end_iso = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).isoformat()
    data = backend_client.get("/workouts", {"start_date": start_iso, "end_date": end_iso})
    if backend_client.is_error(data):
        return data
    result = []
    for w in (data if isinstance(data, list) else []):
        start_str = w.get("start_time", "")
        result.append({
            "id": w.get("id"),
            "title": w.get("title"),
            "date": start_str[:10] if start_str else "",
            "start_time": start_str,
            "end_time": w.get("end_time", ""),
            "duration_min": _duration_min_from_workout(w),
            "exercises": _group_sets(w),
        })
    return result


def get_user_profile(args: dict, user_id: str, db) -> dict:
    """Return the user's profile plus their latest weight/body fat."""
    profile = backend_client.get("/auth/me")
    if backend_client.is_error(profile):
        return profile
    logs = backend_client.get("/weight")
    latest = logs[-1] if isinstance(logs, list) and logs else None
    return {
        "name": profile.get("name"),
        "height_cm": profile.get("height_cm"),
        "weight_kg": latest.get("weight_kg") if latest else None,
        "body_fat_pct": latest.get("body_fat_pct") if latest else None,
        "weight_date": latest.get("date") if latest else None,
    }


def get_weight_logs(args: dict, user_id: str, db) -> dict:
    """Return the user's weight and body fat history (from the backend)."""
    days = int(args.get("days", 90))
    cutoff = _days_cutoff_str(days)
    data = backend_client.get("/weight")
    if backend_client.is_error(data):
        return data
    rows = sorted(
        (r for r in data if str(r.get("date", "")) >= cutoff),
        key=lambda r: r.get("date", ""),
    ) if isinstance(data, list) else []
    logs = [
        {"date": r.get("date"), "weight_kg": r.get("weight_kg"), "body_fat_pct": r.get("body_fat_pct")}
        for r in rows
    ]
    return {
        "logs": logs,
        "latest_weight_kg": logs[-1]["weight_kg"] if logs else None,
        "latest_body_fat_pct": logs[-1]["body_fat_pct"] if logs else None,
    }


# ---------------------------------------------------------------------------
# Advanced analysis tools (compute via REST data)
# ---------------------------------------------------------------------------


def analyze_performance_correlation(args: dict, user_id: str, db) -> dict:
    """Pearson correlation between two health/performance metrics."""
    metric1: str = args.get("metric1", "")
    metric2: str = args.get("metric2", "")
    days: int = int(args.get("days", 60))
    cutoff = _days_cutoff_str(days)

    def _get_series(metric: str) -> dict:
        series: dict = {}
        if metric in ("sleep_duration", "sleep_efficiency"):
            data = backend_client.get("/fitbit/sleep", {"days": days})
            if backend_client.is_error(data) or not isinstance(data, list):
                return series
            for r in data:
                date = str(r.get("date", ""))[:10]
                if date < cutoff:
                    continue
                if metric == "sleep_duration":
                    ms = r.get("duration_ms") or 0
                    if ms > 0:
                        series[date] = ms / 3_600_000
                else:
                    eff = r.get("efficiency")
                    if eff is not None:
                        series[date] = float(eff)
        elif metric in ("resting_hr", "steps"):
            data = backend_client.get("/fitbit/daily", {"days": days})
            if backend_client.is_error(data) or not isinstance(data, list):
                return series
            field = "resting_heart_rate" if metric == "resting_hr" else "steps"
            for r in data:
                date = str(r.get("date", ""))[:10]
                if date < cutoff:
                    continue
                val = r.get(field) or 0
                if val > 0:
                    series[date] = float(val)
        elif metric == "workout_volume":
            cutoff_dt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
            data = backend_client.get("/workouts", {"start_date": cutoff_dt.isoformat()})
            if backend_client.is_error(data) or not isinstance(data, list):
                return series
            for w in data:
                date = str(w.get("start_time", ""))[:10]
                if not date or date < cutoff:
                    continue
                vol = _volume_from_workouts([w])
                if vol > 0:
                    series[date] = series.get(date, 0.0) + vol
        elif metric == "weight":
            data = backend_client.get("/weight")
            if backend_client.is_error(data) or not isinstance(data, list):
                return series
            for r in data:
                date = str(r.get("date", ""))[:10]
                if date < cutoff:
                    continue
                val = r.get("weight_kg")
                if val:
                    series[date] = float(val)
        return series

    s1 = _get_series(metric1)
    s2 = _get_series(metric2)

    common_dates = sorted(set(s1.keys()) & set(s2.keys()))
    if len(common_dates) < 3:
        return {
            "metric1": metric1,
            "metric2": metric2,
            "correlation_r": None,
            "sample_size": len(common_dates),
            "interpretation": "Datos insuficientes para calcular correlación (mín. 3 puntos).",
        }

    v1 = [s1[d] for d in common_dates]
    v2 = [s2[d] for d in common_dates]

    try:
        r = statistics.correlation(v1, v2)
    except statistics.StatisticsError:
        r = None

    abs_r = abs(r) if r is not None else 0
    if r is None:
        interpretation = "No se pudo calcular la correlación."
    elif abs_r >= 0.7:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} fuerte ({r:.3f})"
    elif abs_r >= 0.4:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} moderada ({r:.3f})"
    else:
        direction = "positiva" if r > 0 else "negativa"
        interpretation = f"Correlación {direction} débil ({r:.3f})"

    return {
        "metric1": metric1,
        "metric2": metric2,
        "correlation_r": round(r, 4) if r is not None else None,
        "sample_size": len(common_dates),
        "interpretation": interpretation,
    }


def predict_performance_trend(args: dict, user_id: str, db) -> dict:
    """Simple OLS linear regression to predict exercise performance trend."""
    exercise_name: str = args.get("exercise_name", "")
    days: int = int(args.get("days", 30))

    exercise_id, resolved_name = _find_exercise_by_name(exercise_name)
    if not exercise_id:
        return {"error": f"Exercise not found: {exercise_name}"}

    data = backend_client.get("/analytics/weight-progress", {"exercise_id": exercise_id, "days": days})
    if backend_client.is_error(data):
        return data

    daily_max: dict = {}
    for p in (data if isinstance(data, list) else []):
        date_key = str(p.get("date", ""))[:10]
        val = float(p.get("value") or 0)
        if val > 0:
            daily_max[date_key] = max(daily_max.get(date_key, 0.0), val)

    if len(daily_max) < 2:
        return {
            "exercise": resolved_name,
            "data_points": len(daily_max),
            "slope_per_week": None,
            "current_max": max(daily_max.values()) if daily_max else None,
            "projected_max_in_days": None,
            "trend": "insufficient_data",
        }

    sorted_dates = sorted(daily_max.keys())
    values = [daily_max[d] for d in sorted_dates]
    n = len(values)
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n

    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))

    slope = num / den if den != 0 else 0.0
    slope_per_week = slope * 7
    current_max = values[-1]
    projected = current_max + slope * 30

    if abs(slope_per_week) < 0.01:
        trend = "estable"
    elif slope_per_week > 0:
        trend = "mejorando"
    else:
        trend = "bajando"

    return {
        "exercise": resolved_name,
        "data_points": n,
        "slope_per_week": round(slope_per_week, 4),
        "current_max": current_max,
        "projected_max_in_days": round(projected, 2),
        "trend": trend,
    }


def suggest_recovery_protocol(args: dict, user_id: str, db) -> dict:
    """Evaluate recovery signals: last 3 workouts, sleep, resting HR."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff_14d = (now - timedelta(days=14)).isoformat()

    workouts_data = backend_client.get("/workouts", {"start_date": cutoff_14d})
    workouts = (workouts_data if isinstance(workouts_data, list) else [])[-3:]

    total_volume = _volume_from_workouts(workouts)
    total_duration = 0.0
    for w in workouts:
        total_duration += (_duration_min_from_workout(w) or 0)

    sleep_data = backend_client.get("/fitbit/sleep", {"days": 7})
    sleep_rows = [
        s for s in (sleep_data if isinstance(sleep_data, list) else [])
        if s.get("efficiency") is not None
    ]
    avg_sleep_efficiency = (
        round(sum(r["efficiency"] for r in sleep_rows) / len(sleep_rows)) if sleep_rows else None
    )
    avg_sleep_duration_h = (
        round(sum((r.get("duration_ms") or 0) for r in sleep_rows) / len(sleep_rows) / 3_600_000, 2)
        if sleep_rows else None
    )

    health_data = backend_client.get("/fitbit/daily", {"days": 7})
    health_rows = [
        r for r in (health_data if isinstance(health_data, list) else [])
        if (r.get("resting_heart_rate") or 0) > 0
    ]
    avg_resting_hr = (
        round(sum(r["resting_heart_rate"] for r in health_rows) / len(health_rows)) if health_rows else None
    )

    sleep_deficit = avg_sleep_duration_h is not None and avg_sleep_duration_h < 7.0

    return {
        "total_load_kg": round(total_volume, 1),
        "total_duration_min": round(total_duration, 1),
        "workout_count": len(workouts),
        "avg_sleep_efficiency": avg_sleep_efficiency,
        "avg_sleep_duration_h": avg_sleep_duration_h,
        "sleep_deficit": sleep_deficit,
        "avg_resting_hr": avg_resting_hr,
    }


def generate_workout_plan(args: dict, user_id: str, db) -> dict:
    """Gather data for LLM to build a personalized workout plan."""
    focus_groups: list = args.get("focus_muscle_groups", [])
    goal: str = args.get("goal", "")
    intensity_level: str = args.get("intensity_level", "moderate")

    exercises_data = backend_client.get("/exercises")
    exercises_list = exercises_data if isinstance(exercises_data, list) else []

    exercises_by_muscle: dict = {}
    for focus in focus_groups:
        f = focus.lower()
        exercises_by_muscle[focus] = [
            ex["name"] for ex in exercises_list
            if f in (ex.get("muscle") or {}).get("name", "").lower()
        ]

    prs_data = backend_client.get("/analytics/max-lifts")
    prs_list = prs_data if isinstance(prs_data, list) else []

    prs = []
    for focus in focus_groups:
        f = focus.lower()
        pr_map: dict = {}
        for pr in prs_list:
            muscle_name = (pr.get("muscle_name") or "").lower()
            if f in muscle_name:
                ex_name = pr.get("exercise_name") or pr.get("exercise", "")
                val = pr.get("max_value") or 0
                if val > 0 and (ex_name not in pr_map or val > pr_map[ex_name]["value"]):
                    pr_map[ex_name] = {"value": val, "measurement": pr.get("measurement", "kg")}
        for ex_name, d in pr_map.items():
            prs.append({"exercise": ex_name, "max_value": d["value"], "unit": d["measurement"]})

    balance_data = backend_client.get("/analytics/muscle-balance", {"days": 90})
    balance_list = balance_data if isinstance(balance_data, list) else []
    muscle_balance: dict = {}
    for entry in balance_list:
        m = entry.get("muscle")
        vol = entry.get("volume_kg") or entry.get("volume") or 0
        muscle_balance[m] = round(muscle_balance.get(m, 0.0) + vol, 1)

    return {
        "focus_muscle_groups": focus_groups,
        "goal": goal,
        "intensity_level": intensity_level,
        "exercises_by_muscle": exercises_by_muscle,
        "personal_records": prs,
        "muscle_balance": muscle_balance,
    }


def get_overtraining_risk_assessment(args: dict, user_id: str, db) -> dict:
    """Assess overtraining risk based on volume, HR and sleep trends."""
    days: int = int(args.get("days", 14))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoff = now - timedelta(days=days)
    mid = now - timedelta(days=days // 2)

    recent_data = backend_client.get("/workouts", {"start_date": mid.isoformat()})
    prev_data = backend_client.get("/workouts", {"start_date": cutoff.isoformat(), "end_date": mid.isoformat()})

    recent_workouts = recent_data if isinstance(recent_data, list) else []
    prev_workouts = prev_data if isinstance(prev_data, list) else []

    recent_volume = _volume_from_workouts(recent_workouts)
    previous_volume = _volume_from_workouts(prev_workouts)
    recent_count = len(recent_workouts)
    previous_count = len(prev_workouts)

    risk_factors = []
    if previous_volume > 0 and recent_volume > previous_volume * 1.2:
        risk_factors.append(
            f"Aumento de volumen >20% ({previous_volume:.0f} → {recent_volume:.0f} kg)"
        )

    health_data = backend_client.get("/fitbit/daily", {"days": days})
    health_rows = sorted(
        [r for r in (health_data if isinstance(health_data, list) else [])
         if (r.get("resting_heart_rate") or 0) > 0],
        key=lambda r: r.get("date", ""),
    )
    if len(health_rows) >= 4:
        half = len(health_rows) // 2
        first_hr = sum(r["resting_heart_rate"] for r in health_rows[:half]) / half
        last_hr = sum(r["resting_heart_rate"] for r in health_rows[half:]) / (len(health_rows) - half)
        if last_hr > first_hr * 1.05:
            risk_factors.append(
                f"FC en reposo en aumento ({first_hr:.0f} → {last_hr:.0f} bpm)"
            )

    sleep_data = backend_client.get("/fitbit/sleep", {"days": days})
    sleep_rows = [
        s for s in (sleep_data if isinstance(sleep_data, list) else [])
        if s.get("efficiency") is not None
    ]
    avg_eff = None
    if sleep_rows:
        avg_eff = sum(r["efficiency"] for r in sleep_rows) / len(sleep_rows)
        if avg_eff < 80:
            risk_factors.append(f"Eficiencia de sueño baja ({avg_eff:.0f}%)")

    if len(risk_factors) >= 3:
        risk_level = "alto"
    elif len(risk_factors) >= 1:
        risk_level = "moderado"
    else:
        risk_level = "bajo"

    recommendations = []
    combined = " ".join(risk_factors).lower()
    if "volumen" in combined:
        recommendations.append("Reducir el volumen de entrenamiento un 20% esta semana.")
    if "sueño" in combined:
        recommendations.append("Priorizar descanso: mínimo 7-8 horas de sueño.")
    if "FC" in " ".join(risk_factors):
        recommendations.append("Tomar una semana de descarga o actividad ligera.")
    if not recommendations:
        recommendations.append("Mantener la rutina actual. Los indicadores son positivos.")

    return {
        "risk_level": risk_level,
        "risk_factors": risk_factors,
        "recommendations": recommendations,
        "data_summary": {
            "recent_workout_count": recent_count,
            "previous_workout_count": previous_count,
            "recent_volume_kg": round(recent_volume, 1),
            "previous_volume_kg": round(previous_volume, 1),
            "avg_sleep_efficiency": round(avg_eff, 1) if avg_eff is not None else None,
        },
    }
