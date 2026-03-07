import re
from typing import List, Dict, Any, Optional

class WorkoutParser:
    """
    Parser to extract exercise data from Google Calendar event descriptions.

    Supported line formats (lines must start with ✅):
        ✅ Pecho - Presa inclinado (40kg)
        ✅ Tríceps - Extensiones (25-30kg) 10 reps
        ✅ Press de Banca (60kg)           <- no muscle prefix (backward compat)
        ✅ Sentadilla 80'5kg 8x4

    The part before the first " - " (if it exists and is a single word / short token
    with no digits) is treated as the muscle group.
    """

    # Matches: optional muscle prefix via "MuscleWord - ", then exercise name,
    # then optional (value[unit]) and optional reps
    VALUE_PATTERN = re.compile(
        r"(?P<value>[\d.,'\-]+)\s*(?P<unit>kg|min|kilos|minutos)?",
        re.IGNORECASE
    )

    REPS_PATTERN = re.compile(
        r"(\d+)\s*(?:reps?|rpt|x)\s*(\d+)?",
        re.IGNORECASE
    )

    @staticmethod
    def _is_muscle_prefix(token: str) -> bool:
        """
        Returns True if the token looks like a muscle group name
        (no digits, reasonably short, typical muscle words).
        """
        token = token.strip()
        if not token or any(c.isdigit() for c in token):
            return False
        # Maximum word count for a muscle prefix
        return len(token.split()) <= 3

    @staticmethod
    def _parse_values(text: str):
        """
        Extract up to 4 numeric values and their unit from a string like:
          '(50-55kg)', '40kg', '80,5', "80'5kg 8 reps"
        Returns (values_list, unit_str)
        """
        # Remove parentheses
        text = text.replace('(', '').replace(')', '')

        # Find unit
        unit_match = re.search(r'(kg|min|kilos|minutos)', text, re.IGNORECASE)
        unit = unit_match.group(1).lower() if unit_match else None
        if unit in ('kilos',): unit = 'kg'
        if unit in ('minutos',): unit = 'min'

        # Find all numbers
        number_pattern = re.compile(r"[\d]+(?:[.,'][0-9]+)?")
        raw_nums = number_pattern.findall(text)

        values = []
        for n in raw_nums[:4]:
            try:
                clean = n.replace(',', '.').replace("'", '.')
                values.append(float(clean))
            except ValueError:
                pass

        return values, unit

    @staticmethod
    def parse_description(text: str) -> List[Dict[str, Any]]:
        """
        Parses multi-line description text and returns a list of extracted exercise sets.
        Only lines starting with ✅ are processed.
        """
        results = []
        if not text:
            return results

        for line in text.split('\n'):
            line = line.strip()
            if not line or not line.startswith('✅'):
                continue

            # Remove the ✅ and strip
            content = line.lstrip('✅').strip()

            # Try to detect "MuscleGroup - ExerciseName (weight)"
            muscle_group = None
            exercise_part = content

            # Split on first " - " or " – "
            parts = re.split(r'\s[-–]\s', content, maxsplit=1)
            if len(parts) == 2 and WorkoutParser._is_muscle_prefix(parts[0]):
                muscle_group = parts[0].strip()
                exercise_part = parts[1].strip()

            # Separate exercise name from weight info
            # Weight section is inside parentheses or at the end after a known unit
            paren_match = re.search(r'\(([^)]+)\)', exercise_part)
            if paren_match:
                exercise_name = exercise_part[:paren_match.start()].strip()
                weight_text = paren_match.group(0)
            else:
                # No parens: try to find where the number starts
                num_match = re.search(r'[\d]', exercise_part)
                if num_match:
                    exercise_name = exercise_part[:num_match.start()].strip()
                    weight_text = exercise_part[num_match.start():]
                else:
                    exercise_name = exercise_part
                    weight_text = ''

            # Clean trailing punctuation from exercise name
            exercise_name = re.sub(r'[\s\-–:]+$', '', exercise_name).strip()

            if not exercise_name:
                continue

            # Extract reps (e.g. "8 reps", "8x4")
            reps = 0
            reps_match = WorkoutParser.REPS_PATTERN.search(weight_text or exercise_part)
            if reps_match:
                reps = int(reps_match.group(1))

            # Parse weight values
            values, unit = WorkoutParser._parse_values(weight_text)
            if not unit and values:
                unit = 'kg'  # default

            # Pad to 4
            while len(values) < 4:
                values.append(None)

            results.append({
                "muscle_group": muscle_group,
                "exercise_name": exercise_name,
                "value1": values[0],
                "value2": values[1],
                "value3": values[2],
                "value4": values[3],
                "unit": unit,
                "reps": reps,
                "is_pr": 0,
                "raw_text": line
            })

        return results


if __name__ == "__main__":
    test_text = """
    ✅ Pecho - Presa inclinado (40kg)
    ✅ Pecho - Press plano (60-65kg) 8 reps
    ✅ Tríceps - Extensiones (30kg)
    ✅ Sentadilla 80'5kg
    ✅ Press Militar (40kg) 8 reps
    """
    print("Extracted Exercises:")
    for r in WorkoutParser.parse_description(test_text):
        vals = [str(v) for v in [r['value1'], r['value2'], r['value3'], r['value4']] if v is not None]
        print(f"  [{r['muscle_group'] or '?'}] {r['exercise_name']}: {'-'.join(vals)}{r['unit'] or ''} x{r['reps']}")
