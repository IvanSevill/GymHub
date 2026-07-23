import re
import unicodedata
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set, Tuple
from . import models

PIERNA_MUSCLES = ["gluteos", "femoral", "cuadriceps", "gemelos"]

# Typos / singular forms → canonical muscle name
MUSCLE_ALIASES: Dict[str, str] = {
    "abdominales": "abdomen",
    "gluteo":      "gluteos",
    "gemelo":      "gemelos",
    "buceps":      "biceps",
}

_VALID_MUSCLES = {
    "pecho", "hombro", "triceps", "biceps", "espalda",
    "abdomen", "gluteos", "femoral", "cuadriceps", "gemelos", "pierna",
}


def _normalise_muscle(raw: str) -> Optional[str]:
    """Return canonical muscle name or None if not recognised."""
    s = MUSCLE_ALIASES.get(raw.strip().lower(), raw.strip().lower())
    return s if s in _VALID_MUSCLES else None


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _muscles_from_title(title: str) -> Optional[Set[str]]:
    """Return the set of canonical muscle names referenced in *title*, or None if none found.

    None means no filtering should be applied (show all muscles in the event).
    'Pierna'/'Piernas' expands to all leg subgroups.
    """
    if not title:
        return None

    words = re.findall(r"[a-zà-ÿ]+", title.lower())
    muscles: Set[str] = set()

    for word in words:
        norm = _strip_accents(word)
        if norm in ("pierna", "piernas"):
            muscles.update(PIERNA_MUSCLES)
            continue
        canonical = MUSCLE_ALIASES.get(norm, norm)
        if canonical in _VALID_MUSCLES and canonical != "pierna":
            muscles.add(canonical)
            continue
        # Try singular (hombros → hombro)
        if norm.endswith("s"):
            singular = norm[:-1]
            canonical = MUSCLE_ALIASES.get(singular, singular)
            if canonical in _VALID_MUSCLES and canonical != "pierna":
                muscles.add(canonical)

    return muscles if muscles else None


def _parse_line_weight(rest: str) -> Optional[Tuple[str, List[str], str]]:
    """
    Extract (exercise_name, values, unit) from the right side of a 'Muscle - <rest>' line.
    Returns None to signal the line must be dropped.
    """
    # 1. Remove approximate-weight marker
    rest = rest.replace("~", "")

    # 2. Strip PR annotation at end: " pr 75kg", " PR 80kg", …
    rest = re.sub(r"\s+pr\s+[\d\.\,\']+\s*[a-zA-Z]*\s*$", "", rest, flags=re.I).strip()

    # 3. Normalise "15kg-13kg" → "15-13kg"
    rest = re.sub(
        r"(\d[\d\.\,\']*)\s*kg\s*-\s*(\d[\d\.\,\']*)\s*kg",
        r"\1-\2kg", rest, flags=re.I,
    )

    # 4. Strip leading '+' from weights  ("+5kg" → "5kg")
    rest = re.sub(r"\+(\d)", r"\1", rest)

    # 5. Extract weight at end of string.
    #    Handles both space-separated ("pecho plano 50kg") and
    #    glued ("femoral30-25kg") variants.
    weight_match = re.search(
        r"(?:\s+|(?<=[a-zA-Z]))(\d[\d\-\.\,\']*)\s*([a-zA-Z]+)\s*$", rest
    )

    if weight_match:
        values_str = weight_match.group(1).rstrip("-")
        unit        = weight_match.group(2).strip() or "kg"
        exercise_name = rest[: weight_match.start()].strip().lower().rstrip("- ").strip()
    else:
        exercise_name = rest.strip().lower().rstrip("- ").strip()
        values_str    = "0"
        unit          = "kg"

    if not exercise_name:
        return None

    # 6. Drop set-count annotation lines (x4, x3, …) wherever they appear
    if re.search(r"\bx\d+\b", f"{exercise_name} {values_str}", re.I):
        return None

    # 7. Split range "50-55" and normalise Spanish decimal apostrophe  ' → .
    values = [v.replace("'", ".").rstrip(".") for v in values_str.split("-") if v]
    if not values:
        values = ["0"]

    return exercise_name, values, unit


def _parse_fitbit_section(description: str) -> Optional[Dict]:
    """Parse the [Fitbit] (or legacy [Fitbit Metrics]) block from a description string."""
    if "[Fitbit]" in description:
        part = description.split("[Fitbit]")[1]
    elif "[Fitbit Metrics]" in description:
        part = description.split("[Fitbit Metrics]")[1]
    else:
        return None
    try:
        data: Dict = {}

        for pattern, key, cast in [
            (r"Calorias:\s*(\d+)",      "calories",        int),
            (r"FC Media:\s*(\d+)",      "heart_rate_avg",  int),
            (r"Duracion:\s*(\d+)",      "duration_ms",     lambda x: int(x) * 60_000),
            (r"AZM Fat Burn:\s*(\d+)",  "azm_fat_burn",    int),
            (r"AZM Cardio:\s*(\d+)",    "azm_cardio",      int),
            (r"AZM Peak:\s*(\d+)",      "azm_peak",        int),
        ]:
            m = re.search(pattern, part, re.I)
            if m:
                data[key] = cast(m.group(1))

        act = re.search(r"Actividad:\s*([^\|\n]+)", part, re.I)
        if act:
            data["activity_name"] = act.group(1).strip()

        return data or None
    except Exception:
        return None


def parse_calendar_description(
    description: str,
    muscle_map: Dict[str, str],
    title: str = "",
) -> Dict:
    """Parse a Google Calendar event description into exercise sets + Fitbit data."""
    if not description:
        return {"sets": [], "fitbit": None}

    # Auto-synced Fitbit activity: save Fitbit metrics only, no exercise sets
    if "Actividad sincronizada automáticamente desde Fitbit" in description:
        return {"sets": [], "fitbit": _parse_fitbit_section(description)}

    fitbit_data = _parse_fitbit_section(description)

    if "[Fitbit]" in description:
        exercise_block = description.split("[Fitbit]")[0]
    elif "[Fitbit Metrics]" in description:
        exercise_block = description.split("[Fitbit Metrics]")[0]
    else:
        exercise_block = description

    exercise_sets: List[Dict] = []

    for line in exercise_block.split("\n"):
        line = line.strip()
        if not line:
            continue

        is_completed = any(sym in line for sym in ("■", "✓", "✅"))

        # Strip GymHub tag, bullets and completion symbols
        line = re.sub(r"^\[GymHub\]", "", line).strip()
        line = re.sub(r"^[■✓✅•\-\*\s]+", "", line).strip()

        # Lines without "Muscle - Exercise" structure are always skipped
        if not line or " - " not in line:
            continue

        muscle_raw, _, rest = line.partition(" - ")
        muscle_name = _normalise_muscle(muscle_raw)
        if muscle_name is None:
            continue  # Unrecognised token (e.g. "Sentadilla", "Swim") → skip

        result = _parse_line_weight(rest)
        if result is None:
            continue

        exercise_name, values, unit = result

        muscles_to_process = PIERNA_MUSCLES if muscle_name == "pierna" else [muscle_name]

        for m_name in muscles_to_process:
            for val in values:
                exercise_sets.append({
                    "muscle_name":   m_name,
                    "exercise_name": exercise_name,
                    "value":         val,
                    "measurement":   unit,
                    "is_completed":  is_completed,
                })

    return {"sets": exercise_sets, "fitbit": fitbit_data}


def get_exercise_prs_as_of(
    db: "Session",  # type: ignore[name-defined]  # noqa: F821
    user_id: str,
    as_of_date: "datetime",  # type: ignore[name-defined]  # noqa: F821
    exercise_ids: List[str],
) -> Dict[str, Tuple[str, str]]:
    """Return {exercise_id: (value_str, measurement)} — the max for each exercise up to as_of_date.

    Returns the max from the last 60 days relative to as_of_date; if no records exist in that
    window, falls back to the all-time max up to as_of_date.
    Only numeric, non-zero values are considered. Exercises with no valid history are omitted.
    """
    if not exercise_ids:
        return {}

    sixty_days_before = as_of_date - timedelta(days=60)

    sets = (
        db.query(models.ExerciseSet)
        .join(models.Workout, models.ExerciseSet.workout_id == models.Workout.id)
        .filter(
            models.Workout.user_id == user_id,
            models.Workout.start_time <= as_of_date,
            models.ExerciseSet.exercise_id.in_(exercise_ids),
            models.ExerciseSet.value.isnot(None),
            models.ExerciseSet.value.notin_(["0", "0.0", ""]),
        )
        .all()
    )

    # exercise_id → (best_numeric, value_str, measurement)
    best_recent: Dict[str, Tuple[float, str, str]] = {}
    best_all_time: Dict[str, Tuple[float, str, str]] = {}

    for s in sets:
        try:
            num = float(s.value.replace("'", ".").strip())
            if num <= 0:
                continue
        except (ValueError, AttributeError):
            continue

        # Track all-time max
        prev_all_time = best_all_time.get(s.exercise_id)
        if prev_all_time is None or num > prev_all_time[0]:
            best_all_time[s.exercise_id] = (num, s.value, s.measurement or "kg")

        # Track recent (last 60 days) max
        if s.workout.start_time >= sixty_days_before:
            prev_recent = best_recent.get(s.exercise_id)
            if prev_recent is None or num > prev_recent[0]:
                best_recent[s.exercise_id] = (num, s.value, s.measurement or "kg")

    # Prefer recent max; fallback to all-time if no recent records
    best = {**best_all_time, **best_recent}
    return {ex_id: (val, meas) for ex_id, (_, val, meas) in best.items()}


def generate_calendar_description(
    workout: "models.Workout",
    fitbit_data: Optional["models.FitbitData"] = None,
    all_exercises_by_muscle: Optional[Dict[str, List["models.Exercise"]]] = None,
    prs: Optional[Dict[str, Tuple[str, str]]] = None,
) -> str:
    """Generate a Google Calendar description from a DB workout record."""
    description = "[GymHub]\n"

    session_sets_by_muscle: Dict[str, Dict[str, List]] = {}
    for es in workout.exercise_sets:
        if not es.exercise or not es.exercise.muscle:
            continue
        m_name = es.exercise.muscle.name
        e_name = es.exercise.name
        session_sets_by_muscle.setdefault(m_name, {}).setdefault(e_name, []).append(es)

    # Determine which muscles to render (from title or from session)
    title_muscles = _muscles_from_title(workout.title or "")
    muscles_to_render = sorted(title_muscles) if title_muscles else sorted(session_sets_by_muscle.keys())

    first_muscle = True
    for m_name in muscles_to_render:
        catalog_exs = sorted(
            (all_exercises_by_muscle or {}).get(m_name, []),
            key=lambda e: e.name,
        )
        # name → exercise_id mapping for PR lookups
        name_to_id: Dict[str, str] = {e.name: e.id for e in catalog_exs}
        for e_name, s_list in session_sets_by_muscle.get(m_name, {}).items():
            if e_name not in name_to_id and s_list and s_list[0].exercise_id:
                name_to_id[e_name] = s_list[0].exercise_id

        all_ex_names = sorted(set(name_to_id) | set(session_sets_by_muscle.get(m_name, {}).keys()))

        if not all_ex_names:
            continue

        if not first_muscle:
            description += "\n"
        first_muscle = False

        for e_name in all_ex_names:
            sets = session_sets_by_muscle.get(m_name, {}).get(e_name, [])
            is_completed = bool(sets) and any(s.is_completed for s in sets)

            if is_completed:
                # Exercise done and marked complete: show actual session values with ✅
                by_measure: Dict[str, List[str]] = {}
                for s in sets:
                    by_measure.setdefault(s.measurement, []).append(s.value)

                parts = [
                    f"{'-'.join(v for v in vals if v not in ('0', '0.0'))}{meas}"
                    for meas, vals in by_measure.items()
                    if any(v not in ("0", "0.0") for v in vals)
                ]
                line_text = f"✅ {m_name.capitalize()} - {e_name.capitalize()}"
                if parts:
                    line_text += f" {' '.join(parts)}"
            else:
                # Not completed (or no sets): show historical PR as the reference weight
                ex_id = name_to_id.get(e_name)
                pr = (prs or {}).get(ex_id) if ex_id else None
                line_text = f"{m_name.capitalize()} - {e_name.capitalize()}"
                if pr and pr[0] not in ("0", "0.0", ""):
                    line_text += f" {pr[0]}{pr[1]}"

            description += f"{line_text}\n"

    if fitbit_data:
        description += "\n[Fitbit]\n"
        description += f"Calorias: {fitbit_data.calories} kcal\n"
        description += f"FC Media: {fitbit_data.heart_rate_avg} bpm\n"
        description += f"Duracion: {fitbit_data.duration_ms // 60_000} min\n"
        # Only persist the activity_name when we have a real logId; placeholders
        # restored from a stale description would reintroduce "Walk" on every sync.
        stored_activity = (
            fitbit_data.activity_name
            if fitbit_data.fitbit_log_id
            else "Weights"
        )
        description += f"Actividad: {stored_activity or 'Weights'}\n"
        if fitbit_data.azm_fat_burn or fitbit_data.azm_cardio or fitbit_data.azm_peak:
            description += f"AZM Fat Burn: {fitbit_data.azm_fat_burn}\n"
            description += f"AZM Cardio: {fitbit_data.azm_cardio}\n"
            description += f"AZM Peak: {fitbit_data.azm_peak}\n"

    return description.strip()
