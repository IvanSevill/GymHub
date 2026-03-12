import re
from typing import List, Dict, Optional
from . import models

PIERNA_MUSCLES = ["gluteos", "femoral", "cuadriceps", "gemelos"]

def parse_calendar_description(description: str, muscle_map: Dict[str, str]) -> Dict:
    """
    Parses the Google Calendar event description and returns sets and fitbit data.
    """
    if not description:
        return {"sets": [], "fitbit": None}

    lines = description.split("\n")
    exercise_sets = []
    fitbit_data = None
    
    # Check for Fitbit Metrics
    if "[Fitbit Metrics]" in description:
        try:
            fitbit_part = description.split("[Fitbit Metrics]")[1]
            fitbit_data = {}
            
            cal_match = re.search(r"Calorias:\s*(\d+)", fitbit_part, re.I)
            if cal_match: fitbit_data["calories"] = int(cal_match.group(1))
            
            hr_match = re.search(r"FC Media:\s*(\d+)", fitbit_part, re.I)
            if hr_match: fitbit_data["heart_rate_avg"] = int(hr_match.group(1))
            
            dur_match = re.search(r"Duracion:\s*(\d+)", fitbit_part, re.I)
            if dur_match: fitbit_data["duration_ms"] = int(dur_match.group(1)) * 60000
            
            act_match = re.search(r"Actividad:\s*([^\n]+)", fitbit_part, re.I)
            if act_match: fitbit_data["activity_name"] = act_match.group(1).strip()

            azm_fat_match = re.search(r"AZM Fat Burn:\s*(\d+)", fitbit_part, re.I)
            if azm_fat_match: fitbit_data["azm_fat_burn"] = int(azm_fat_match.group(1))

            azm_cardio_match = re.search(r"AZM Cardio:\s*(\d+)", fitbit_part, re.I)
            if azm_cardio_match: fitbit_data["azm_cardio"] = int(azm_cardio_match.group(1))

            azm_peak_match = re.search(r"AZM Peak:\s*(\d+)", fitbit_part, re.I)
            if azm_peak_match: fitbit_data["azm_peak"] = int(azm_peak_match.group(1))
            
            # Remove fitbit part for exercise parsing
            lines = description.split("[Fitbit Metrics]")[0].split("\n")
        except:
            pass

    for line in lines:
        line = line.strip()
        if not line or "[GymHub]" in line:
            continue
        
        # Detect completion status if checkmark is present
        is_completed = "✅" in line
        # Strip any leading bullets or emojis if present
        line = re.sub(r"^[✅•\-\*\s]+", "", line).strip()
        
        # Split by " - " to separate muscle and exercise
        if " - " not in line:
            continue
            
        parts = line.split(" - ", 1)
        muscle_name = parts[0].strip().lower()
        rest = parts[1].strip()
        
        # Try to extract weight/value from the end of the rest string
        # Match pattern like "Exercise Name 50-55kg" or just "Exercise Name"
        # We look for a pattern of numbers followed by optional units at the end
        # UPDATED: More robust pattern to handle trailing dashes or spaces
        weight_match = re.search(r"\s+([\d\-\.\,']+)\s*([a-zA-Z]*)\s*[-]*$", rest)
        
        if weight_match:
            exercise_name = rest[:weight_match.start()].strip().lower()
            values_str = weight_match.group(1).strip()
            unit = weight_match.group(2).strip() or "kg"
        else:
            # Clean up the exercise name if no weight match
            exercise_name = rest.strip().lower().rstrip("- ").strip()
            values_str = "0"
            unit = "kg"

        muscles_to_process = [muscle_name]
        if muscle_name == "pierna":
            muscles_to_process = PIERNA_MUSCLES
        
        # Split values like "50-55" into multiple sets
        values = values_str.split("-")
        
        for m_name in muscles_to_process:
            for val in values:
                if not val: continue
                exercise_sets.append({
                    "muscle_name": m_name,
                    "exercise_name": exercise_name,
                    "value": val,
                    "measurement": unit,
                    "is_completed": is_completed
                })
    
    return {"sets": exercise_sets, "fitbit": fitbit_data}

def generate_calendar_description(workout: models.Workout, fitbit_data: Optional[models.FitbitData] = None, all_exercises_by_muscle: Dict[str, List[models.Exercise]] = None) -> str:
    """
    Generates the Google Calendar event description from a Workout object.
    all_exercises_by_muscle: {muscle_name: [Exercise, ...]}
    """
    description = "[Gimnasio]\n"
    
    # Group sets by muscle for easy lookup
    session_sets_by_muscle = {}
    for es in workout.exercise_sets:
        # Safety check: ensure exercise and muscle are loaded
        if not es.exercise or not es.exercise.muscle:
            continue
            
        m_name = es.exercise.muscle.name
        if m_name not in session_sets_by_muscle:
            session_sets_by_muscle[m_name] = {}
        
        e_name = es.exercise.name
        if e_name not in session_sets_by_muscle[m_name]:
            session_sets_by_muscle[m_name][e_name] = []
        session_sets_by_muscle[m_name][e_name].append(es)
    
    # Determine muscles to show
    involved_muscles = set(session_sets_by_muscle.keys())
    
    # If "Pierna" is in title, include ALL leg muscles even if no sets recorded
    if workout.title and "pierna" in workout.title.lower():
        involved_muscles.update([m.capitalize() for m in PIERNA_MUSCLES])
    
    # Sort muscles
    sorted_muscles = sorted(list(involved_muscles))
    
    for m_name in sorted_muscles:
        # Get all catalog exercises for this muscle
        catalog_exercises = all_exercises_by_muscle.get(m_name.lower(), []) if all_exercises_by_muscle else []
        
        # We need to list ALL exercises from the catalog for this muscle
        # Sort catalog exercises alphabetically
        sorted_catalog_names = sorted([ex.name for ex in catalog_exercises])
        
        # If catalog is empty for some reason, fallback to session exercises
        if not sorted_catalog_names:
            sorted_catalog_names = sorted(session_sets_by_muscle.get(m_name, {}).keys())

        for e_name in sorted_catalog_names:
            session_sets = session_sets_by_muscle.get(m_name, {}).get(e_name, [])
            is_completed = any(s.is_completed for s in session_sets)
            
            line_text = f"{m_name.capitalize()} - {e_name.lower()}"
            
            if session_sets:
                # Group values by measurement
                by_measure = {}
                for s in session_sets:
                    if s.measurement not in by_measure: by_measure[s.measurement] = []
                    by_measure[s.measurement].append(s.value)
                
                # Append weights if any
                weights_parts = []
                for meas, vals in by_measure.items():
                    # Only include values that are not "0" or "0.0"
                    valid_vals = [v for v in vals if v and v not in ["0", "0.0", "0,0"]]
                    if valid_vals:
                        vals_str = "-".join(valid_vals)
                        weights_parts.append(f"{vals_str}{meas}")
                
                if weights_parts:
                    line_text += f" {' '.join(weights_parts)}"

            description += f"{line_text}\n"
        
        description += "\n" # Blank line between muscle groups

    if fitbit_data:
        description += "\n\n[Fitbit Metrics]\n"
        description += f"Calorias: {fitbit_data.calories} kcal\n"
        description += f"FC Media: {fitbit_data.heart_rate_avg} bpm\n"
        description += f"Duracion: {fitbit_data.duration_ms // 60000} min\n"
        description += f"Actividad: {fitbit_data.activity_name or 'Weights'}\n"
        description += f"AZM Fat Burn: {fitbit_data.azm_fat_burn or 0} min\n"
        description += f"AZM Cardio: {fitbit_data.azm_cardio or 0} min\n"
        description += f"AZM Peak: {fitbit_data.azm_peak or 0} min\n"

    return description.strip()
