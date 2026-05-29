from app.calendar_utils import (
    _normalise_muscle,
    _strip_accents,
    parse_calendar_description,
    PIERNA_MUSCLES,
)


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
