from app.calendar_utils import parse_calendar_description

def test_repro():
    description = """[GymHub]
✅Biceps - Mancuernas 10-12'5kg
"""
    muscle_map = {"biceps": "b-id"}
    result = parse_calendar_description(description, muscle_map)
    sets = result["sets"]
    
    print(f"Total sets found: {len(sets)}")
    for i, s in enumerate(sets):
        print(f"Set {i+1}: Muscle: {s['muscle_name']}, Exercise: {s['exercise_name']}, Value: {s['value']}, Unit: {s['measurement']}")

if __name__ == "__main__":
    test_repro()
