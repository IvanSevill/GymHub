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

def refresh_fitbit_token(db: Session, user_tokens: models.UserTokens):
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
    Handles both flat and nested structures.
    """
    azm = activity_data.get("activeZoneMinutes", {})
    
    # If it's a list or doesn't have the expected keys, try flat structure
    if not isinstance(azm, dict) or not any(k in azm for k in ["fatBurnMinutes", "cardioMinutes", "peakMinutes"]):
        return {
            "fatBurnMinutes": activity_data.get("fatBurnMinutes", 0),
            "cardioMinutes": activity_data.get("cardioMinutes", 0),
            "peakMinutes": activity_data.get("peakMinutes", 0)
        }
    
    return azm

def get_fitbit_activity(db: Session, user_tokens: models.UserTokens, start_time: datetime, end_time: datetime):

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
            except:
                continue
            
            # Check for overlap: Activity starts within 15 mins of workout OR covers the same time
            # Using a more robust overlap check
            start_diff = abs((act_start - start_time).total_seconds())
            if start_diff < 900: # 15 min margin
                return activity
                
            # Or if the activity covers the middle of our workout
            mid_workout = start_time + (end_time - start_time) / 2
            if act_start <= mid_workout <= act_end:
                return activity
                
    return None
