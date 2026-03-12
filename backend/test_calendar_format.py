import sys
import os
from datetime import datetime

# Add the current directory to sys.path to import from app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from app import models, calendar_utils

def test_format():
    # Mock data
    m_biceps = models.Muscle(name="biceps")
    m_espalda = models.Muscle(name="espalda")

    e_curl = models.Exercise(id="1", name="curl", muscle=m_biceps)
    e_martillo = models.Exercise(id="2", name="martillo", muscle=m_biceps)
    e_jalon = models.Exercise(id="3", name="jalon", muscle=m_espalda)

    # Manual mapping for relationship to avoid lazy load issues in test if needed, 
    # but since we are mocking objects it should be fine.
    e_curl.muscle = m_biceps
    e_martillo.muscle = m_biceps
    e_jalon.muscle = m_espalda

    w = models.Workout(id="w1", title="Entreno", start_time=datetime.now(), end_time=datetime.now())

    # Exercise sets
    # 1. Biceps - curl 10kg (Completed) -> Should NOT have emoji, Should have 10kg
    s1 = models.ExerciseSet(exercise=e_curl, value="10", measurement="kg", is_completed=True, exercise_id="1")
    # 2. Biceps - martillo 0kg (Not Completed) -> Should NOT have emoji, Should NOT have 0kg
    s2 = models.ExerciseSet(exercise=e_martillo, value="0", measurement="kg", is_completed=False, exercise_id="2")
    # 3. Espalda - jalon 0kg (Completed) -> Should NOT have emoji, Should NOT have 0kg
    s3 = models.ExerciseSet(exercise=e_jalon, value="0", measurement="kg", is_completed=True, exercise_id="3")

    # Ensure backward relationships for the generator
    s1.exercise = e_curl
    s2.exercise = e_martillo
    s3.exercise = e_jalon

    w.exercise_sets = [s1, s2, s3]

    all_exercises_by_muscle = {
        "biceps": [e_curl, e_martillo],
        "espalda": [e_jalon]
    }

    desc = calendar_utils.generate_calendar_description(w, all_exercises_by_muscle=all_exercises_by_muscle)
    print("--- GENERATED DESCRIPTION ---")
    print(desc)
    print("REPR:", repr(desc))
    print("-----------------------------")

    # Verification
    assert "[Gimnasio]" in desc
    assert "✅" not in desc
    assert "0kg" not in desc
    assert "10kg" in desc
    assert "Biceps - curl 10kg" in desc
    assert "Biceps - martillo" in desc
    assert "Biceps - martillo " not in desc.replace("Biceps - martillo\n", "") # Ensure no trailing space before newline
    assert "Espalda - jalon" in desc
    assert "Espalda - jalon 0kg" not in desc

    print("Verification SUCCESSFUL!")

if __name__ == "__main__":
    test_format()
