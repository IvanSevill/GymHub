import sys
import os

# Mock models and objects
class MockMuscle:
    def __init__(self, name):
        self.name = name

class MockExercise:
    def __init__(self, name, muscle_name):
        self.name = name
        self.muscle = MockMuscle(muscle_name)

class MockWorkout:
    def __init__(self, title, exercise_sets):
        self.title = title
        self.exercise_sets = exercise_sets

# Mock the calendar_utils.py imports and environment if needed
# But we can just import the function if we fix the path

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from app import calendar_utils

def test_repro():
    print("Testing KeyError reproduction...")
    
    # Workout with "pierna" in title but NO sets
    workout = MockWorkout(title="Pierna Workout", exercise_sets=[])
    
    # This should trigger the "if 'pierna' in workout.title.lower()" block
    # then if all_exercises_by_muscle is empty or missing 'pierna' sub-muscles,
    # it will fall back to session_sets_by_muscle[m_name]
    
    try:
        description = calendar_utils.generate_calendar_description(workout, fitbit_data=None, all_exercises_by_muscle={})
        print("Description generated successfully (unexpected if bug exists):")
        print(description)
    except KeyError as e:
        print(f"Caught expected KeyError: {e}")
    except Exception as e:
        print(f"Caught unexpected Exception: {type(e).__name__}: {e}")

if __name__ == "__main__":
    test_repro()
