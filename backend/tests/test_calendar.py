import pytest
from app.calendar_utils import parse_calendar_description, generate_calendar_description
from app.models import Workout, ExerciseSet, Exercise, Muscle

def test_parse_calendar_description():
    description = """[GymHub]
✅Biceps - Curl 45kg
✅Biceps - Curl Banco Scott 20-15kg
Biceps - Curl Libre 15kg
✅Espalda - Jalon Agarre Largo 53-47kg
"""
    # Mock muscle_map if needed, but the current implementation returns raw names
    sets = parse_calendar_description(description, {})
    
    # Check ✅ lines
    assert len(sets) == 5 # 1 for Curl 45, 2 for Curl Banco Scott (20, 15), 2 for Jalon (53, 47)
    assert sets[0]["exercise_name"] == "Curl"
    assert sets[0]["value"] == "45"
    assert sets[1]["value"] == "20"
    assert sets[2]["value"] == "15"

def test_parse_pierna_alias():
    description = "[GymHub]\n✅Pierna - Prensa 100kg"
    sets = parse_calendar_description(description, {})
    # Pierna expands to 4 muscles
    assert len(sets) == 4
    muscles = [s["muscle_name"] for s in sets]
    assert "gluteos" in muscles
    assert "femoral" in muscles
    assert "cuadriceps" in muscles
    assert "gemelos" in muscles

def test_generate_calendar_description():
    m = Muscle(name="biceps")
    e = Exercise(name="Curl", muscle=m)
    w = Workout(title="Test Workout")
    es1 = ExerciseSet(exercise=e, value="45", measurement="kg")
    w.exercise_sets = [es1]
    
    desc = generate_calendar_description(w)
    assert "[GymHub]" in desc
    assert "✅Biceps - Curl 45kg" in desc
