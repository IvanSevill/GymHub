from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# Muscle Schemas
class MuscleBase(BaseModel):
    name: str

class MuscleCreate(MuscleBase):
    pass

class Muscle(MuscleBase):
    id: str

    class Config:
        from_attributes = True

# Exercise Schemas
class ExerciseBase(BaseModel):
    name: str
    muscle_id: str

class ExerciseCreate(ExerciseBase):
    pass

class Exercise(ExerciseBase):
    id: str
    muscle: Optional[Muscle] = None

    class Config:
        from_attributes = True

# ExerciseSet Schemas
class ExerciseSetBase(BaseModel):
    exercise_id: str
    value: str
    measurement: str

class ExerciseSetCreate(ExerciseSetBase):
    pass

class ExerciseSet(ExerciseSetBase):
    id: str
    exercise: Optional[Exercise] = None

    class Config:
        from_attributes = True

# FitbitData Schemas
class FitbitDataBase(BaseModel):
    calories: int
    heart_rate_avg: int
    duration_ms: int
    distance_km: float
    elevation_gain_m: float
    activity_name: str
    azm_fat_burn: int
    azm_cardio: int
    azm_peak: int

class FitbitData(FitbitDataBase):
    id: str
    workout_id: str

    class Config:
        from_attributes = True

# Workout Schemas
class WorkoutBase(BaseModel):
    start_time: datetime
    end_time: datetime
    title: str

class WorkoutCreate(WorkoutBase):
    exercise_sets: List[ExerciseSetCreate] = []

class WorkoutUpdate(WorkoutBase):
    exercise_sets: List[ExerciseSetCreate] = []

class Workout(WorkoutBase):
    id: str
    user_id: str
    google_event_id: Optional[str] = None
    exercise_sets: List[ExerciseSet] = []
    fitbit_data: Optional[FitbitData] = None

    class Config:
        from_attributes = True

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    name: str
    picture_url: Optional[str] = None

class User(UserBase):
    id: str
    is_root: int

    class Config:
        from_attributes = True

# Auth Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleAuthRequest(BaseModel):
    code: str

class FitbitAuthRequest(BaseModel):
    code: str

# Analytics Schemas
class WeightProgressPoint(BaseModel):
    date: datetime
    value: float # Max value for that day/period
    exercise_name: str

class ExerciseFrequency(BaseModel):
    exercise_name: str
    count: int
    muscle_name: str
