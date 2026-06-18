from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.calendar_utils import (
    _muscles_from_title,
    _normalise_muscle,
    _parse_line_weight,
    _strip_accents,
    generate_calendar_description,
    get_exercise_prs_as_of,
    parse_calendar_description,
    PIERNA_MUSCLES,
)
from app.database import Base
from app import models


def test_strip_accents():
    assert _strip_accents("pecho") == "pecho"
    assert _strip_accents("bíceps") == "biceps"
    assert _strip_accents("abdómen") == "abdomen"


def test_normalise_muscle_canonical():
    assert _normalise_muscle("pecho") == "pecho"
    assert _normalise_muscle("espalda") == "espalda"
    assert _normalise_muscle("biceps") == "biceps"


def test_normalise_muscle_alias():
    assert _normalise_muscle("abdominales") == "abdomen"
    assert _normalise_muscle("gluteo") == "gluteos"
    assert _normalise_muscle("gemelo") == "gemelos"
    assert _normalise_muscle("buceps") == "biceps"


def test_normalise_muscle_unknown():
    assert _normalise_muscle("natacion") is None
    assert _normalise_muscle("cardio") is None
    assert _normalise_muscle("") is None


def test_parse_description_basic():
    desc = "[GymHub]\nPecho - Press banca 50kg"
    result = parse_calendar_description(desc, {})
    assert result["fitbit"] is None
    sets = result["sets"]
    assert len(sets) == 1
    s = sets[0]
    assert s["muscle_name"] == "pecho"
    assert s["exercise_name"] == "press banca"
    assert s["value"] == "50"
    assert s["measurement"] == "kg"
    assert s["is_completed"] is False


def test_parse_description_completed_symbols():
    for symbol in ("■", "✓", "✅"):
        desc = f"[GymHub]\n{symbol} Pecho - Press banca 50kg"
        result = parse_calendar_description(desc, {})
        assert result["sets"][0]["is_completed"] is True, f"Failed for symbol: {symbol}"


def test_parse_description_fitbit_block():
    desc = (
        "[GymHub]\n"
        "Pecho - Press banca 80kg\n"
        "\n"
        "[Fitbit]\n"
        "Calorias: 350 kcal\n"
        "FC Media: 140 bpm\n"
        "Duracion: 60 min\n"
        "Actividad: Weights\n"
        "AZM Fat Burn: 5\n"
        "AZM Cardio: 20\n"
        "AZM Peak: 10\n"
    )
    result = parse_calendar_description(desc, {})
    fitbit = result["fitbit"]
    assert fitbit is not None
    assert fitbit["calories"] == 350
    assert fitbit["heart_rate_avg"] == 140
    assert fitbit["duration_ms"] == 60 * 60_000
    assert fitbit["activity_name"] == "Weights"
    assert fitbit["azm_fat_burn"] == 5
    assert fitbit["azm_cardio"] == 20
    assert fitbit["azm_peak"] == 10
    assert result["sets"][0]["muscle_name"] == "pecho"


def test_parse_description_pierna_expansion():
    desc = "[GymHub]\nPierna - Sentadilla 80kg"
    result = parse_calendar_description(desc, {}, title="Pierna")
    sets = result["sets"]
    muscle_names = {s["muscle_name"] for s in sets}
    for leg_muscle in PIERNA_MUSCLES:
        assert leg_muscle in muscle_names
    assert len(sets) == len(PIERNA_MUSCLES)
    assert all(s["exercise_name"] == "sentadilla" for s in sets)
    assert all(s["value"] == "80" for s in sets)


def test_parse_description_empty():
    result = parse_calendar_description("", {})
    assert result["sets"] == []
    assert result["fitbit"] is None


def test_parse_description_fitbit_auto_sync():
    desc = "[GymHub]\nActividad sincronizada automáticamente desde Fitbit\n[Fitbit]\nCalorias: 400 kcal\n"
    result = parse_calendar_description(desc, {})
    assert result["sets"] == []
    assert result["fitbit"] is not None
    assert result["fitbit"]["calories"] == 400


def test_parse_description_fitbit_legacy_block():
    desc = "[GymHub]\nPecho - Press banca 50kg\n[Fitbit Metrics]\nCalorias: 300 kcal\n"
    result = parse_calendar_description(desc, {})
    assert result["fitbit"]["calories"] == 300
    assert len(result["sets"]) == 1


# ---------------------------------------------------------------------------
# _muscles_from_title
# ---------------------------------------------------------------------------


def test_muscles_from_title_none_for_empty():
    assert _muscles_from_title("") is None


def test_muscles_from_title_single_muscle():
    muscles = _muscles_from_title("Pecho fuerte")
    assert muscles == {"pecho"}


def test_muscles_from_title_pierna_expands():
    muscles = _muscles_from_title("Pierna dura")
    for leg in PIERNA_MUSCLES:
        assert leg in muscles


def test_muscles_from_title_plural():
    muscles = _muscles_from_title("Hombros y biceps")
    assert "hombro" in muscles
    assert "biceps" in muscles


def test_muscles_from_title_unknown_word():
    muscles = _muscles_from_title("Natación cardio")
    assert muscles is None


# ---------------------------------------------------------------------------
# _parse_line_weight
# ---------------------------------------------------------------------------


def test_parse_line_weight_basic():
    result = _parse_line_weight("Press banca 50kg")
    assert result is not None
    name, values, unit = result
    assert name == "press banca"
    assert "50" in values
    assert unit == "kg"


def test_parse_line_weight_range():
    result = _parse_line_weight("Sentadilla 80-70kg")
    assert result is not None
    name, values, unit = result
    assert "80" in values
    assert "70" in values


def test_parse_line_weight_no_weight():
    result = _parse_line_weight("Press banca")
    assert result is not None
    name, values, unit = result
    assert name == "press banca"
    assert values == ["0"]


def test_parse_line_weight_pr_annotation_stripped():
    result = _parse_line_weight("Press banca 50kg pr 55kg")
    assert result is not None
    name, values, unit = result
    assert name == "press banca"


def test_parse_line_weight_set_count_drops_line():
    result = _parse_line_weight("Curl x4 12kg")
    assert result is None


def test_parse_line_weight_no_recognizable_exercise():
    result = _parse_line_weight("")
    assert result is None


# ---------------------------------------------------------------------------
# get_exercise_prs_as_of
# ---------------------------------------------------------------------------


def _make_test_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def test_get_exercise_prs_as_of_empty():
    db = _make_test_db()
    result = get_exercise_prs_as_of(db, "user-1", datetime.now(), [])
    assert result == {}


def test_get_exercise_prs_as_of_returns_max():
    import uuid
    db = _make_test_db()

    muscle = models.Muscle(name="pecho")
    db.add(muscle)
    db.flush()
    exercise = models.Exercise(name="press banca", muscle_id=muscle.id)
    db.add(exercise)
    db.flush()
    user = models.User(id=str(uuid.uuid4()), email="pr@test.com", name="PR User")
    db.add(user)
    db.flush()

    workout = models.Workout(
        user_id=user.id,
        title="Test PR",
        start_time=datetime(2026, 1, 10, 10, 0),
        end_time=datetime(2026, 1, 10, 11, 0),
    )
    db.add(workout)
    db.flush()

    db.add(models.ExerciseSet(workout_id=workout.id, exercise_id=exercise.id, value="80", measurement="kg", is_completed=True))
    db.add(models.ExerciseSet(workout_id=workout.id, exercise_id=exercise.id, value="90", measurement="kg", is_completed=True))
    db.commit()

    result = get_exercise_prs_as_of(db, user.id, datetime(2026, 6, 1), [exercise.id])
    assert exercise.id in result
    val, meas = result[exercise.id]
    assert val == "90"
    assert meas == "kg"


# ---------------------------------------------------------------------------
# generate_calendar_description
# ---------------------------------------------------------------------------


def test_generate_calendar_description_basic():
    import uuid
    db = _make_test_db()

    muscle = models.Muscle(name="pecho")
    db.add(muscle)
    db.flush()
    exercise = models.Exercise(name="press banca", muscle_id=muscle.id)
    db.add(exercise)
    db.flush()
    user = models.User(id=str(uuid.uuid4()), email="gen@test.com", name="Gen User")
    db.add(user)
    db.flush()
    workout = models.Workout(
        user_id=user.id,
        title="Pecho",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
    )
    db.add(workout)
    db.flush()
    db.add(models.ExerciseSet(
        workout_id=workout.id,
        exercise_id=exercise.id,
        value="75",
        measurement="kg",
        is_completed=True,
    ))
    db.commit()
    db.refresh(workout)

    desc = generate_calendar_description(workout)
    assert "[GymHub]" in desc
    assert "press banca" in desc.lower() or "Press banca" in desc


def test_generate_calendar_description_with_fitbit():
    import uuid
    db = _make_test_db()

    muscle = models.Muscle(name="hombro")
    db.add(muscle)
    db.flush()
    exercise = models.Exercise(name="press militar", muscle_id=muscle.id)
    db.add(exercise)
    db.flush()
    user = models.User(id=str(uuid.uuid4()), email="fit@test.com", name="Fit User")
    db.add(user)
    db.flush()
    workout = models.Workout(
        user_id=user.id,
        title="Hombro",
        start_time=datetime(2026, 5, 2, 10, 0),
        end_time=datetime(2026, 5, 2, 11, 0),
    )
    db.add(workout)
    db.flush()
    fitbit = models.FitbitData(
        workout_id=workout.id,
        calories=400,
        heart_rate_avg=145,
        duration_ms=3600000,
        activity_name="Weights",
        azm_fat_burn=10,
        azm_cardio=25,
        azm_peak=5,
    )
    db.add(fitbit)
    db.commit()
    db.refresh(workout)

    desc = generate_calendar_description(workout, fitbit_data=fitbit)
    assert "[Fitbit]" in desc
    assert "400" in desc
    assert "145" in desc
