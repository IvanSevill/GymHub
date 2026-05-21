import os
import requests
import base64
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from . import models

FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
FITBIT_AUTH_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"

def refresh_fitbit_token(db: Session, user_tokens: models.UserTokens) -> Optional[str]:
    """
    Refreshes the Fitbit access token using the refresh token.
    """
    if not user_tokens.fitbit_refresh_token:
        return None

    auth_header = base64.b64encode(f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "grant_type": "refresh_token",
        "refresh_token": user_tokens.fitbit_refresh_token
    }

    response = requests.post(FITBIT_TOKEN_URL, headers=headers, data=data)
    
    if response.status_code == 200:
        new_tokens = response.json()
        user_tokens.fitbit_access_token = new_tokens["access_token"]
        user_tokens.fitbit_refresh_token = new_tokens["refresh_token"]
        db.commit()
        return user_tokens.fitbit_access_token
    else:
        # Handle error or log
        return None

def extract_azm(activity_data: dict) -> dict:
    """
    Extracts Active Zone Minutes from Fitbit activity data.
    API v1.1 returns activeZoneMinutes.minutesInHeartRateZones as a typed list.
    """
    azm = activity_data.get("activeZoneMinutes", {})

    if isinstance(azm, dict) and "minutesInHeartRateZones" in azm:
        zones = {z["type"]: z["minutes"] for z in azm.get("minutesInHeartRateZones", [])}
        return {
            "fatBurnMinutes": zones.get("FAT_BURN", 0),
            "cardioMinutes": zones.get("CARDIO", 0),
            "peakMinutes": zones.get("PEAK", 0),
        }

    if isinstance(azm, dict) and any(k in azm for k in ["fatBurnMinutes", "cardioMinutes", "peakMinutes"]):
        return {
            "fatBurnMinutes": azm.get("fatBurnMinutes", 0),
            "cardioMinutes": azm.get("cardioMinutes", 0),
            "peakMinutes": azm.get("peakMinutes", 0),
        }

    return {
        "fatBurnMinutes": activity_data.get("fatBurnMinutes", 0),
        "cardioMinutes": activity_data.get("cardioMinutes", 0),
        "peakMinutes": activity_data.get("peakMinutes", 0),
    }

def get_fitbit_activities_range(db: Session, user_tokens: models.UserTokens, days: int = 30) -> list:
    """
    Fetches all Fitbit activities from the last N days, most-recent first.
    """
    access_token = user_tokens.fitbit_access_token
    if not access_token:
        return []

    cutoff = datetime.utcnow() - timedelta(days=days)
    date_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")

    def make_request(token):
        url = (
            f"https://api.fitbit.com/1.1/user/-/activities/list.json"
            f"?beforeDate={date_str}&offset=0&limit=100&sort=desc"
        )
        return requests.get(url, headers={"Authorization": f"Bearer {token}"})

    response = make_request(access_token)
    if response.status_code == 401:
        access_token = refresh_fitbit_token(db, user_tokens)
        if access_token:
            response = make_request(access_token)

    if response.status_code != 200:
        return []

    result = []
    for activity in response.json().get("activities", []):
        try:
            raw_start = activity["startTime"].replace("Z", "+00:00")
            act_start = datetime.fromisoformat(raw_start).replace(tzinfo=None)
            if act_start < cutoff:
                break  # sorted desc — stop once outside the window
            result.append(activity)
        except Exception:
            continue

    return result


def get_fitbit_activity(db: Session, user_tokens: models.UserTokens, start_time: datetime, end_time: datetime) -> Optional[dict]:
    """
    Finds a Fitbit activity within a time range, handles token refresh.
    """
    access_token = user_tokens.fitbit_access_token
    if not access_token:
        return None

    def make_request(token):
        # Use v1.1 for better Active Zone Minutes support
        date_str = (start_time + timedelta(days=1)).strftime("%Y-%m-%d")
        url = f"https://api.fitbit.com/1.1/user/-/activities/list.json?beforeDate={date_str}&offset=0&limit=20&sort=desc"
        headers = {"Authorization": f"Bearer {token}"}
        return requests.get(url, headers=headers)

    response = make_request(access_token)
    
    if response.status_code == 401:
        # Token expired, try refresh
        access_token = refresh_fitbit_token(db, user_tokens)
        if access_token:
            response = make_request(access_token)
    
    if response.status_code == 200:
        activities = response.json().get("activities", [])
        for activity in activities:
            # Fitbit 'startTime' is ISO format: 2023-10-27T10:00:00.000+02:00
            try:
                raw_start = activity["startTime"].replace("Z", "+00:00")
                act_start = datetime.fromisoformat(raw_start).replace(tzinfo=None)
                act_duration = timedelta(milliseconds=activity["duration"])
                act_end = act_start + act_duration
            except Exception:
                continue
            
            # Match if Fitbit activity started within ±3 h of the workout start time.
            # Calendar events are often entered manually and can misalign by 1-2 h.
            start_diff = abs((act_start - start_time).total_seconds())
            if start_diff < 10800:
                return activity
                
            # Or if the activity covers the middle of our workout
            mid_workout = start_time + (end_time - start_time) / 2
            if act_start <= mid_workout <= act_end:
                return activity
                
    return None
