import re
from typing import List, Dict, Optional
from . import models

PIERNA_MUSCLES = ["gluteos", "femoral", "cuadriceps", "gemelos"]

def parse_calendar_description(description: str, muscle_map: Dict[str, str]) -> List[Dict]:
    """
    Parses the Google Calendar event description and returns a list of exercise sets.
    muscle_map: maps lowercase muscle names to their IDs.
    """
    if not description or "[GymHub]" not in description:
        return []

    lines = description.split("\n")
    exercise_sets = []
    
    # Remove metadata blocks for parsing exercises
    if "[Fitbit Metrics]" in description:
        lines = description.split("[Fitbit Metrics]")[0].split("\n")

    for line in lines:
        line = line.strip()
        if not line or line == "[GymHub]":
            continue
        
        is_completed = line.startswith("✅")
        if is_completed:
            line = line[1:].strip()
        else:
            # According to spec, only ✅ lines are saved in ExerciseSets
            continue

        # Pattern: Muscle - Exercise Name ValueUNIT (e.g., Biceps - Curl 45kg or 20-15kg)
        match = re.match(r"^(.*?) - (.*?) ([\d\-\.]+)([a-zA-Z]*)$", line)
        if match:
            muscle_name = match.group(1).strip().lower()
            exercise_name = match.group(2).strip()
            values_str = match.group(3).strip()
            unit = match.group(4).strip()

            muscles_to_process = [muscle_name]
            if muscle_name == "pierna":
                muscles_to_process = PIERNA_MUSCLES
            
            # Split values like 20-15
            values = values_str.split("-")
            
            for m_name in muscles_to_process:
                # We need to find the exercise ID. This function assumes the caller handles DB lookups or provides a map.
                # For now, we return the names and the caller will resolve IDs.
                for val in values:
                    exercise_sets.append({
                        "muscle_name": m_name,
                        "exercise_name": exercise_name,
                        "value": val,
                        "measurement": unit
                    })
    
    return exercise_sets

def generate_calendar_description(workout: models.Workout, fitbit_data: Optional[models.FitbitData] = None) -> str:
    """
    Generates the Google Calendar event description from a Workout object.
    """
    description = "[GymHub]\n"
    
    # Group sets by muscle
    sets_by_muscle = {}
    for es in workout.exercise_sets:
        m_name = es.exercise.muscle.name
        if m_name not in sets_by_muscle:
            sets_by_muscle[m_name] = []
        sets_by_muscle[m_name].append(es)
    
    # Sort muscles alphabetically
    sorted_muscles = sorted(sets_by_muscle.keys())
    
    for m_name in sorted_muscles:
        # Group exercises within muscle
        exercises_in_muscle = {}
        for es in sets_by_muscle[m_name]:
            e_name = es.exercise.name
            if e_name not in exercises_in_muscle:
                exercises_in_muscle[e_name] = {}
            
            # Group different weights/measurements for the same exercise
            key = (es.measurement)
            if key not in exercises_in_muscle[e_name]:
                exercises_in_muscle[e_name][key] = []
            exercises_in_muscle[e_name][key].append(es.value)
        
        # Sort exercises alphabetically
        sorted_exercises = sorted(exercises_in_muscle.keys())
        
        for e_name in sorted_exercises:
            for measurement, values in exercises_in_muscle[e_name].items():
                values_str = "-".join(values)
                description += f"✅{m_name.capitalize()} - {e_name} {values_str}{measurement}\n"
        
        description += "\n" # Blank line between muscle groups

    if fitbit_data:
        description += "\n[Fitbit Metrics]\n"
        description += f"Calorias: {fitbit_data.calories} kcal\n"
        description += f"FC Media: {fitbit_data.heart_rate_avg} bpm\n"
        description += f"Duracion: {fitbit_data.duration_ms // 60000} min\n"
        description += f"Actividad: {fitbit_data.activity_name}\n"

    return description.strip()
