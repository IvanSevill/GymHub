import re
from typing import List, Dict, Any, Optional

class WorkoutParser:
    """
    Parser to extract exercise data from Google Calendar descriptions.
    Expected formats: 
    - ✅ Ejercicio (Peso kg)
    - ✅ Pecho plano (50-55kg) 10 reps
    - Pecho Press de banca (50kg) (pr 75kg)
    """
    
    # Improved regex to capture weight and optional reps/PR
    # Examples:
    # ✅ Bench Press (80kg) 10 reps
    # ✅ Squat (100kg)
    # ✅ Deadlift (120-130kg) (pr 140kg) 5 reps
    EXERCISE_PATTERN = re.compile(
        r"✅\s*(?P<name>[^(\n]+?)\s*"  # Match name until ( or newline
        r"\((?P<weight_range>[\d\.\-]+)\s*kg\)"  # Match (weight kg)
        r"(?:\s*\(pr\s*(?P<pr_weight>[\d\.]+)\s*kg\))?"  # Optional (pr weight kg)
        r"(?:\s*(?P<reps>\d+)\s*(?:reps|rpt|x)?)?",  # Optional reps
        re.IGNORECASE
    )

    @staticmethod
    def parse_description(text: str) -> List[Dict[str, Any]]:
        """
        Parses multi-line description text and returns a list of extracted exercise sets.
        Only lines starting with ✅ are considered.
        """
        results = []
        if not text:
            return results

        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line or not line.startswith("✅"):
                continue

            match = WorkoutParser.EXERCISE_PATTERN.search(line)
            if match:
                data = match.groupdict()
                
                # Extract the weight (max of range)
                weight_str = data.get('weight_range', '0')
                try:
                    if '-' in weight_str:
                        weights = [float(w) for w in weight_str.split('-') if w.strip()]
                        weight = max(weights) if weights else 0.0
                    else:
                        weight = float(weight_str)
                except ValueError:
                    weight = 0.0

                # Extract reps
                reps_str = data.get('reps')
                reps = int(reps_str) if reps_str else 0

                # Check for PR entry
                pr_weight_str = data.get('pr_weight')
                if pr_weight_str:
                    try:
                        results.append({
                            "exercise_name": data.get('name', '').strip(),
                            "weight_kg": float(pr_weight_str),
                            "reps": reps,
                            "is_pr": 1,
                            "raw_text": line
                        })
                    except ValueError:
                        pass
                
                # Add the standard set
                results.append({
                    "exercise_name": data.get('name', '').strip(),
                    "weight_kg": weight,
                    "reps": reps,
                    "is_pr": 0,
                    "raw_text": line
                })

        return results

if __name__ == "__main__":
    test_text = """
    ✅ Pecho plano (50-55kg) 10 reps
    ✅ Sentadilla (80kg)
    Pecho Press de banca (50kg) (pr 75kg)
    ✅ Press Militar (40kg) (pr 45kg) 8 reps
    """
    print("Extracted Exercises:")
    for res in WorkoutParser.parse_description(test_text):
        print(f"- {res['exercise_name']}: {res['weight_kg']}kg x {res['reps']} (PR: {res['is_pr']})")
