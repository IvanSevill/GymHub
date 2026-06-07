from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime

# Muscle Schemas
class MuscleBase(BaseModel):
    name: str = Field(..., description="Name of the muscle group (e.g., 'pecho', 'hombro')")

class MuscleCreate(MuscleBase):
    """Schema for creating a new muscle group."""
    pass

class MuscleUpdate(BaseModel):
    """Schema for renaming a muscle group."""
    name: str = Field(..., description="New name for the muscle group")

class Muscle(MuscleBase):
    """Schema for returning muscle group details."""
    id: str = Field(..., description="Unique identifier of the muscle group")

    class Config:
        orm_mode = True

# Exercise Schemas
class ExerciseBase(BaseModel):
    name: str = Field(..., description="Name of the exercise (e.g., 'Press Banca')")
    muscle_id: str = Field(..., description="ID of the muscle group this exercise targets")

class ExerciseCreate(ExerciseBase):
    """Schema for creating a new exercise."""
    pass

class ExerciseUpdate(BaseModel):
    """Schema for renaming an exercise or reassigning its muscle group."""
    name: str = Field(..., description="New name for the exercise")
    muscle_id: Optional[str] = Field(None, description="New muscle group ID")

class Exercise(ExerciseBase):
    """Schema for returning exercise details."""
    id: str = Field(..., description="Unique identifier of the exercise")
    muscle: Optional[Muscle] = Field(None, description="Details of the associated muscle group")

    class Config:
        orm_mode = True

class ExerciseMedia(BaseModel):
    """Cached media URLs for an exercise (YouTube videos + Google image)."""
    video_url_1: Optional[str] = None
    video_url_2: Optional[str] = None
    image_url: Optional[str] = None

# ExerciseSet Schemas
class ExerciseSetBase(BaseModel):
    exercise_id: str = Field(..., description="ID of the exercise performed in this set")
    value: str = Field(..., description="Recorded value for the set (e.g., '45-40', '10')")
    measurement: str = Field(..., description="Unit of measurement (e.g., 'kg', 'rep', 's')")
    is_completed: bool = Field(False, description="Whether the exercise set was completed")

class ExerciseSetCreate(ExerciseSetBase):
    """Schema for creating a new exercise set."""
    pass

class ExerciseSet(ExerciseSetBase):
    """Schema for returning exercise set details."""
    id: str = Field(..., description="Unique identifier of the exercise set")
    exercise: Optional[Exercise] = Field(None, description="Details of the associated exercise")

    class Config:
        orm_mode = True

# FitbitData Schemas
class FitbitDataBase(BaseModel):
    calories: Optional[int] = Field(0, description="Total calories burned")
    heart_rate_avg: Optional[int] = Field(0, description="Average heart rate during activity")
    duration_ms: Optional[int] = Field(0, description="Duration of the activity in milliseconds")
    distance_km: Optional[float] = Field(0.0, description="Distance covered in kilometers")
    elevation_gain_m: Optional[float] = Field(0.0, description="Elevation gain in meters")
    activity_name: Optional[str] = Field("Unknown", description="Name of the Fitbit activity")
    azm_fat_burn: Optional[int] = Field(0, description="Active Zone Minutes in Fat Burn zone")
    azm_cardio: Optional[int] = Field(0, description="Active Zone Minutes in Cardio zone")
    azm_peak: Optional[int] = Field(0, description="Active Zone Minutes in Peak zone")
    has_gps: bool = Field(False, description="Whether this activity has a GPS route available")

class FitbitData(FitbitDataBase):
    """Schema for returning Fitbit data details."""
    id: str = Field(..., description="Unique identifier of the Fitbit data record")
    workout_id: str = Field(..., description="ID of the associated workout")
    fitbit_log_id: Optional[str] = Field(None, description="Fitbit's internal activity ID")

    class Config:
        orm_mode = True

# SleepLog Schemas
class SleepLog(BaseModel):
    """Schema for returning a Fitbit sleep session."""
    id: str
    user_id: str
    fitbit_log_id: Optional[str] = None
    date: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: int = 0
    efficiency: int = 0
    minutes_asleep: int = 0
    minutes_awake: int = 0
    minutes_to_fall_asleep: int = 0
    time_in_bed: int = 0
    minutes_deep: int = 0
    minutes_light: int = 0
    minutes_rem: int = 0
    minutes_wake: int = 0
    is_main_sleep: bool = True
    log_type: Optional[str] = None

    class Config:
        orm_mode = True


# DailyHealth Schemas
class DailyHealth(BaseModel):
    """Schema for returning a Fitbit daily activity summary."""
    id: str
    user_id: str
    date: str
    steps: int = 0
    floors: int = 0
    resting_heart_rate: int = 0
    calories_out: int = 0
    minutes_sedentary: int = 0
    minutes_lightly_active: int = 0
    minutes_fairly_active: int = 0
    minutes_very_active: int = 0
    distance_km: float = 0.0

    class Config:
        orm_mode = True


# Workout Schemas
class WorkoutBase(BaseModel):
    start_time: datetime = Field(..., description="Start time of the workout in ISO 8601 format")
    end_time: datetime = Field(..., description="End time of the workout in ISO 8601 format")
    title: str = Field(..., description="Title or name of the workout")

class WorkoutCreate(WorkoutBase):
    """Schema for creating a new workout."""
    exercise_sets: List[ExerciseSetCreate] = Field([], description="List of exercise sets included in the workout")

class WorkoutUpdate(WorkoutBase):
    """Schema for updating an existing workout."""
    exercise_sets: List[ExerciseSetCreate] = Field([], description="Updated list of exercise sets for the workout")

class Workout(WorkoutBase):
    """Schema for returning workout details."""
    id: str = Field(..., description="Unique identifier of the workout")
    user_id: str = Field(..., description="ID of the user who owns this workout")
    google_event_id: Optional[str] = Field(None, description="Google Calendar event ID if synced")
    exercise_sets: List[ExerciseSet] = Field([], description="List of exercise sets in the workout")
    fitbit_data: Optional[FitbitData] = Field(None, description="Fitbit activity data associated with the workout")

    class Config:
        orm_mode = True

# User Schemas
class UserBase(BaseModel):
    email: EmailStr = Field(..., description="User's email address")
    name: str = Field(..., description="User's full name")
    picture_url: Optional[str] = Field(None, description="URL to the user's profile picture")

class UserCreate(UserBase):
    """Schema for creating a new user (e.g., for email/password sign-up)."""
    password: str = Field(..., min_length=8, description="User's password")

class UserUpdate(BaseModel):
    """Schema for updating optional user profile fields."""
    height_cm: Optional[float] = Field(None, description="User's height in centimetres", ge=50, le=300)

class User(UserBase):
    """Schema for returning user details."""
    id: str = Field(..., description="Unique identifier of the user")
    is_root: int = Field(0, description="User's root status (0: regular, 1: root)")
    has_calendar: bool = Field(False, description="Indicates if user has connected a Google Calendar")
    fitbit_connected: bool = Field(False, description="Indicates if user has connected Fitbit")
    height_cm: Optional[float] = Field(None, description="User's height in centimetres")

    class Config:
        orm_mode = True

# Auth Schemas
class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: Optional[User] = Field(None, description="Authenticated user details")

class TokenData(BaseModel):
    """Schema for data contained in the JWT token."""
    email: Optional[str] = None

class GoogleAuthRequest(BaseModel):
    """Schema for Google OAuth code exchange request."""
    code: str = Field(..., description="Authorization code from Google OAuth")

class FitbitAuthRequest(BaseModel):
    """Schema for Fitbit OAuth code exchange request."""
    code: str = Field(..., description="Authorization code from Fitbit OAuth")

class UserLogin(BaseModel):
    """Schema for traditional email/password login."""
    email: EmailStr
    password: str

# Analytics Schemas
class WeightProgressPoint(BaseModel):
    """Schema for a single data point in weight progress analytics."""
    date: datetime = Field(..., description="Date of the weight recording")
    value: float = Field(..., description="Maximum weight value recorded for that day/period")

class ExerciseFrequency(BaseModel):
    """Schema for exercise frequency analytics."""
    exercise_name: str = Field(..., description="Name of the exercise")
    count: int = Field(..., description="Number of times the exercise was performed")
    muscle_name: str = Field(..., description="Name of the muscle group targeted")

class MaxLift(BaseModel):
    """Schema for maximum lift records."""
    exercise_id: str
    exercise_name: str
    muscle_name: str
    max_value: float
    measurement: str
    date: datetime

# Weight Log Schemas
class WeightLogCreate(BaseModel):
    date: str = Field(..., description="Date of the entry (YYYY-MM-DD)")
    weight_kg: float = Field(..., description="Body weight in kilograms", gt=0, le=500)
    body_fat_pct: Optional[float] = Field(None, description="Body fat percentage", ge=1, le=70)

class WeightLogResponse(BaseModel):
    id: str
    date: str
    weight_kg: float
    body_fat_pct: Optional[float]
    created_at: datetime

    class Config:
        orm_mode = True

# Feedback Schemas
class FeedbackCreate(BaseModel):
    message: str = Field(..., min_length=5, description="Feedback message from the user")
    rating: Optional[int] = Field(None, description="Optional 1–5 rating", ge=1, le=5)

class FeedbackResponse(BaseModel):
    id: str
    message: str
    rating: Optional[int]
    created_at: datetime
    user_name: str
    user_email: str

    class Config:
        orm_mode = True


class AnalyticsSummary(BaseModel):
    """KPI summary with current and previous period for trend comparison."""
    workout_count: int
    prev_workout_count: int
    total_volume_kg: float
    prev_total_volume_kg: float
    avg_duration_min: Optional[float]
    prev_avg_duration_min: Optional[float]
    pr_count: int
    prev_pr_count: int


class WorkoutFrequencyPoint(BaseModel):
    """Workout count per ISO week."""
    week: str
    count: int


class VolumeTrendPoint(BaseModel):
    """Total exercise volume (kg) per session date."""
    date: datetime
    volume: float


class MuscleBalancePoint(BaseModel):
    """Volume (kg) for a muscle group in a given ISO week."""
    week: str
    muscle: str
    volume: float


class SessionDuration(BaseModel):
    """Duration (minutes) of a single workout session."""
    date: datetime
    duration_min: float


# Cardio sync schemas
class SyncCardioRequest(BaseModel):
    """List of workout IDs to push to Google Calendar as cardio events."""
    workout_ids: List[str]


# Exercise Request Schemas
class ExerciseRequestUserInfo(BaseModel):
    """Minimal user info embedded in exercise request responses."""
    id: str
    name: str
    email: str
    picture_url: Optional[str] = None

    class Config:
        orm_mode = True


class ExerciseRequestCreate(BaseModel):
    """Schema for submitting a new exercise or muscle request."""
    type: str
    exercise_name: str
    muscle_id: Optional[str] = None
    muscle_name: Optional[str] = None


class ExerciseRequestReview(BaseModel):
    """Schema for rejecting a request with an optional reason."""
    rejection_reason: Optional[str] = None


class ExerciseRequestUpdate(BaseModel):
    """Schema for editing an exercise request's fields."""
    exercise_name: Optional[str] = None
    muscle_id: Optional[str] = None
    muscle_name: Optional[str] = None


class ExerciseRequestResponse(BaseModel):
    """Schema for returning exercise request details."""
    id: str
    type: str
    exercise_name: str
    muscle_id: Optional[str] = None
    muscle_name: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    exercise_id: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    requested_by: ExerciseRequestUserInfo
    muscle: Optional[Muscle] = None

    class Config:
        orm_mode = True
