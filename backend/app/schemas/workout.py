from pydantic import BaseModel
from typing import Optional, List
import datetime

class ExerciseSetOut(BaseModel):
    exercise_name: str
    muscle_group: Optional[str]
    value1: Optional[float]
    value2: Optional[float]
    value3: Optional[float]
    value4: Optional[float]
    unit: Optional[str]
    reps: Optional[int]
    is_pr: int

    class Config:
        from_attributes = True

class FitbitDataOut(BaseModel):
    calories: Optional[int] = None
    heart_rate_avg: Optional[int] = None
    duration_ms: Optional[int] = None
    steps: Optional[int] = None
    distance_km: Optional[float] = None
    elevation_gain_m: Optional[float] = None
    activity_name: Optional[str] = None
    azm_fat_burn: Optional[int] = None
    azm_cardio: Optional[int] = None
    azm_peak: Optional[int] = None

    class Config:
        from_attributes = True

class WorkoutCreate(BaseModel):
    user_email: str
    title: str
    description: str

class WorkoutOut(BaseModel):
    id: int
    title: str
    date: datetime.datetime
    start_time: Optional[datetime.datetime]
    end_time: Optional[datetime.datetime]
    source: str
    muscle_groups: Optional[str]
    exercise_sets: List[ExerciseSetOut]
    fitbit_data: Optional[FitbitDataOut]

    class Config:
        from_attributes = True

class CreateEventTemplateRequest(BaseModel):
    user_email: str
    title: str
    muscles: List[str]
    date: str
    start_hour: int
    start_minute: int
    end_hour: int
    end_minute: int

class WeeklyWorkout(BaseModel):
    title: str
    muscles: List[str]
    date: str
    start_hour: int
    start_minute: int
    end_hour: int
    end_minute: int

class CreateWeeklyPlanRequest(BaseModel):
    user_email: str
    workouts: List[WeeklyWorkout]
