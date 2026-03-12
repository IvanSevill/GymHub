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

def get_fitbit_activity(access_token: str, start_time: datetime, end_time: datetime):
    """
    Finds a Fitbit activity within a time range.
    """
    # Fitbit API uses date strings. We might need to fetch activities for the day.
    date_str = start_time.strftime("%Y-%m-%d")
    url = f"https://api.fitbit.com/1/user/-/activities/list.json?beforeDate={date_str}&offset=0&limit=20&sort=desc"
    headers = {"Authorization": f"Bearer {access_token}"}
    
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        activities = response.json().get("activities", [])
        for activity in activities:
            # Check if activity overlaps with workout
            # Fitbit 'startTime' is ISO format: 2023-10-27T10:00:00.000+02:00
            # We compare with a margin of error (e.g., 5 minutes)
            act_start = datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
            act_duration = timedelta(milliseconds=activity["duration"])
            act_end = act_start + act_duration
            
            # Simple overlap check
            if abs((act_start - start_time).total_seconds()) < 600: # 10 min margin
                return activity
    return None
