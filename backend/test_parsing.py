from app.calendar_utils import parse_calendar_description

def test_parsing():
    description = """[GymHub]
✅Biceps - Mancuernas 14kg
✅Espalda - Remo agarre corto 50-55kg
✅Biceps - Low cable unilateral 15kg
✅Espalda - Lumbares 5kg
✅Biceps - Barra z 15kg
✅Espalda - Jalon agarre corto 50kg

[Fitbit Metrics]
Calorias: 585 kcal
FC Media: 123 bpm
Pasos: 645
Duracion: 70 min
Actividad: Weights
"""
    muscle_map = {
        "biceps": "b-id",
        "espalda": "e-id",
        "pecho": "p-id"
    }
    
    sets = parse_calendar_description(description, muscle_map)
    
    print(f"Total sets found: {len(sets)}")
    for i, s in enumerate(sets):
        print(f"Set {i+1}: {s['muscle_name']} - {s['exercise_name']} : {s['value']} {s['measurement']}")

if __name__ == "__main__":
    test_parsing()
