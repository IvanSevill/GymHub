from app.calendar_utils import parse_calendar_description

def test_parsing():
    muscle_map = {"hombro": "1", "pecho": "2", "espalda": "3"}
    
    test_cases = [
        {
            "desc": "Hombro - Elevaciones Laterales Con Mancuernas 7 -",
            "expected_exercise": "elevaciones laterales con mancuernas 7"
        },
        {
            "desc": "Hombro - en multi-power 50kg",
            "expected_exercise": "en multi-power",
            "expected_value": "50"
        },
        {
            "desc": "✅ Hombro - s elevaciones laterales con mancuernas",
            "expected_exercise": "s elevaciones laterales con mancuernas"
        },
        {
            "desc": "Pecho - en maquina barra fija 40-45kg",
            "expected_exercise": "en maquina barra fija",
            "expected_value": "40"
        }
    ]
    
    for case in test_cases:
        result = parse_calendar_description(case["desc"], muscle_map)
        sets = result["sets"]
        if not sets:
            print(f"FAILED: No sets found for '{case['desc']}'")
            continue
            
        got_exercise = sets[0]["exercise_name"]
        got_value = sets[0]["value"]
        
        print(f"Testing: '{case['desc']}'")
        print(f"  Got exercise: '{got_exercise}'")
        print(f"  Got value: '{got_value}'")
        
        if got_exercise != case["expected_exercise"]:
            print(f"  ERROR: Expected exercise '{case['expected_exercise']}'")
        if "expected_value" in case and got_value != case["expected_value"]:
            print(f"  ERROR: Expected value '{case['expected_value']}'")
        print("-" * 20)

if __name__ == "__main__":
    test_parsing()
