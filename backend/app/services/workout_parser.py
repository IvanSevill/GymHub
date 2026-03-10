import re
import unicodedata
from typing import List, Dict, Any, Optional

class WorkoutParser:
    """
    Parser to extract exercise data from Google Calendar event descriptions.
    """

    VALUE_PATTERN = re.compile(
        r"(?P<value>[\d.,'\-]+)\s*(?P<unit>kg|s|rep|reps|min|kilos|minutos)?",
        re.IGNORECASE
    )

    REPS_PATTERN = re.compile(
        r"(\d+)\s*(?:reps?|rpt|x)\s*(\d+)?",
        re.IGNORECASE
    )

    # Normalization map for muscle groups
    MUSCLE_SYNONYMS = {
        "Abdominales": ["Abdominales", "Abdomen", "Abs", "Core"],
        "Pierna": ["Pierna", "Piernas", "Tren Inferior"],
        "Gluteo": ["Gluteo", "Gluteos", "Glúteo", "Glúteos"],
        "Biceps": ["Bicep", "Biceps", "Bíceps"],
        "Triceps": ["Tricep", "Triceps", "Tríceps"],
        "Hombro": ["Hombro", "Hombros", "Deltoides"],
        "Pecho": ["Pecho", "Pectoral", "Pectorales"],
        "Espalda": ["Espalda", "Dorsal", "Dorsales"],
        "Cuadriceps": ["Cuadricep", "Cuadriceps", "Cuádriceps"],
        "Isquiotibiales": ["Isquios", "Isquiotibiales"],
        "Gemelos": ["Gemelo", "Gemelos"],
        "Trapecio": ["Trapecio", "Trapecios"],
        "Antebrazo": ["Antebrazo", "Antebrazos"],
        "Cardio": ["Cardio", "Circuito", "Aerobico", "Aerobicos", "Piscina", "Natacion", "Carrera", "Ciclismo"]
    }

    @staticmethod
    def normalize_string(text: str) -> str:
        if not text:
            return ""
        text = ''.join(c for c in unicodedata.normalize('NFD', text)
                      if unicodedata.category(c) != 'Mn')
        return text.strip()

    @staticmethod
    def normalize_muscle(muscle: str) -> str:
        if not muscle:
            return ""
        normalized = WorkoutParser.normalize_string(muscle).capitalize()
        for target, variations in WorkoutParser.MUSCLE_SYNONYMS.items():
            for var in variations:
                if WorkoutParser.normalize_string(var).lower() == normalized.lower():
                    return target
        return normalized

    @staticmethod
    def _is_muscle_prefix(token: str) -> bool:
        token = token.strip()
        if not token or any(c.isdigit() for c in token):
            return False
        return len(token.split()) <= 3

    @staticmethod
    def _parse_values(text: str):
        text = text.replace('(', '').replace(')', '')
        unit_match = re.search(r'(kg|s|rep|reps|min|kilos|minutos)', text, re.IGNORECASE)
        unit = unit_match.group(1).lower() if unit_match else None
        if unit in ('kilos',): unit = 'kg'
        if unit in ('minutos',): unit = 'min'
        if unit in ('reps',): unit = 'rep'
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
        results = []
        if not text:
            return results
        for line in text.split('\n'):
            line = line.strip()
            if not line or not line.startswith('✅'):
                continue
            content = line.lstrip('✅').strip()
            muscle_group = None
            exercise_part = content
            parts = re.split(r'\s[-–]\s', content, maxsplit=1)
            if len(parts) == 2 and WorkoutParser._is_muscle_prefix(parts[0]):
                muscle_group = WorkoutParser.normalize_muscle(parts[0])
                exercise_part = parts[1].strip()
            paren_match = re.search(r'\(([^)]+)\)', exercise_part)
            if paren_match:
                exercise_name = exercise_part[:paren_match.start()].strip()
                weight_text = paren_match.group(0)
            else:
                num_match = re.search(r'[\d]', exercise_part)
                if num_match:
                    exercise_name = exercise_part[:num_match.start()].strip()
                    weight_text = exercise_part[num_match.start():]
                else:
                    exercise_name = exercise_part
                    weight_text = ''
            exercise_name = re.sub(r'[\s\-–:]+$', '', exercise_name).strip()
            if not exercise_name:
                continue
            reps = 0
            reps_match = WorkoutParser.REPS_PATTERN.search(weight_text or exercise_part)
            if reps_match:
                reps = int(reps_match.group(1))
            values, unit = WorkoutParser._parse_values(weight_text)
            if not unit and values:
                unit = 'kg'
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
                "reps": reps
            })
        return results
