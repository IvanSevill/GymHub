import re
from typing import Dict, List, Optional, Tuple
from . import models

PIERNA_MUSCLES = ["gluteos", "femoral", "cuadriceps", "gemelos"]

# Typos / singular forms → canonical muscle name
MUSCLE_ALIASES: Dict[str, str] = {
    "abdomen": "abdominales",
    "gluteo":  "gluteos",
    "gemelo":  "gemelos",
    "buceps":  "biceps",
}

_VALID_MUSCLES = {
    "pecho", "hombro", "triceps", "biceps", "espalda",
    "abdominales", "gluteos", "femoral", "cuadriceps", "gemelos", "pierna",
}


def _normalise_muscle(raw: str) -> Optional[str]:
    """Return canonical muscle name or None if not recognised."""
    s = MUSCLE_ALIASES.get(raw.strip().lower(), raw.strip().lower())
    return s if s in _VALID_MUSCLES else None


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
    """Parse the [Fitbit Metrics] block from a description string."""
    if "[Fitbit Metrics]" not in description:
        return None
    try:
        part = description.split("[Fitbit Metrics]")[1]
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

    exercise_block = (
        description.split("[Fitbit Metrics]")[0]
        if "[Fitbit Metrics]" in description
        else description
    )

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


def generate_calendar_description(
    workout: "models.Workout",
    fitbit_data: Optional["models.FitbitData"] = None,
    all_exercises_by_muscle: Optional[Dict[str, List["models.Exercise"]]] = None,
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

    for m_name in sorted(session_sets_by_muscle):
        for e_name in sorted(session_sets_by_muscle[m_name]):
            sets = session_sets_by_muscle[m_name][e_name]
            is_completed = any(s.is_completed for s in sets)
            prefix = "■ " if is_completed else ""
            line_text = f"{prefix}{m_name.capitalize()} - {e_name}"

            by_measure: Dict[str, List[str]] = {}
            for s in sets:
                by_measure.setdefault(s.measurement, []).append(s.value)

            parts = [
                f"{'-'.join(v for v in vals if v not in ('0', '0.0'))}{meas}"
                for meas, vals in by_measure.items()
                if any(v not in ("0", "0.0") for v in vals)
            ]
            if parts:
                line_text += f" {' '.join(parts)}"

            description += f"{line_text}\n"

    if fitbit_data:
        description += "\n[Fitbit Metrics]\n"
        metrics = [
            f"Calorias: {fitbit_data.calories} kcal",
            f"FC Media: {fitbit_data.heart_rate_avg} bpm",
            f"Duracion: {fitbit_data.duration_ms // 60_000} min",
            f"Actividad: {fitbit_data.activity_name or 'Weights'}",
        ]
        description += " | ".join(metrics) + "\n"

    return description.strip()
