import base64
import logging
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Optional

import requests
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"


def refresh_fitbit_token(db: Session, user_tokens: models.UserTokens) -> Optional[str]:
    """Refresh the Fitbit access token. Returns the new token or None on failure."""
    if not user_tokens.fitbit_refresh_token:
        return None

    auth_header = base64.b64encode(
        f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "refresh_token",
        "refresh_token": user_tokens.fitbit_refresh_token,
    }

    response = requests.post(FITBIT_TOKEN_URL, headers=headers, data=data)
    if response.status_code == 200:
        new_tokens = response.json()
        user_tokens.fitbit_access_token = new_tokens["access_token"]
        user_tokens.fitbit_refresh_token = new_tokens["refresh_token"]
        db.commit()
        return user_tokens.fitbit_access_token

    logger.warning(
        "Fitbit token refresh failed — status %s: %s",
        response.status_code,
        response.text,
    )
    return None


def _fitbit_get(
    db: Session,
    user_tokens: models.UserTokens,
    url: str,
) -> Optional[requests.Response]:
    """Authenticated GET to Fitbit API. Retries once after a token refresh on 401."""
    access_token = user_tokens.fitbit_access_token
    if not access_token:
        return None

    response = requests.get(url, headers={"Authorization": f"Bearer {access_token}"})
    if response.status_code == 401:
        access_token = refresh_fitbit_token(db, user_tokens)
        if not access_token:
            logger.warning("Fitbit token refresh failed — cannot retry request.")
            return None
        response = requests.get(
            url, headers={"Authorization": f"Bearer {access_token}"}
        )

    return response if response.status_code == 200 else None


def extract_azm(activity_data: dict) -> dict:
    """Extract Active Zone Minutes from Fitbit activity data.

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

    if isinstance(azm, dict) and any(
        k in azm for k in ["fatBurnMinutes", "cardioMinutes", "peakMinutes"]
    ):
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


def get_fitbit_activities_range(
    db: Session, user_tokens: models.UserTokens, days: int = 30
) -> list:
    """Fetch all Fitbit activities from the last N days, most-recent first."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    date_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    url = (
        "https://api.fitbit.com/1.1/user/-/activities/list.json"
        f"?beforeDate={date_str}&offset=0&limit=100&sort=desc"
    )

    response = _fitbit_get(db, user_tokens, url)
    if response is None:
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


def get_fitbit_route(
    db: Session, user_tokens: models.UserTokens, log_id: str
) -> list:
    """Fetch GPS trackpoints from a Fitbit activity's TCX file.

    Returns a list of {lat, lon, ele} dicts. Requires the 'location' OAuth scope.
    """
    if not log_id:
        return []

    url = f"https://api.fitbit.com/1/user/-/activities/{log_id}.tcx?includePartialTCX=true"
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return []

    ns = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        return []

    points = []
    for tp in root.findall(".//tcx:Trackpoint", ns):
        pos = tp.find("tcx:Position", ns)
        if pos is None:
            continue
        lat_el = pos.find("tcx:LatitudeDegrees", ns)
        lon_el = pos.find("tcx:LongitudeDegrees", ns)
        ele_el = tp.find("tcx:AltitudeMeters", ns)
        if lat_el is None or lon_el is None:
            continue
        try:
            points.append(
                {
                    "lat": float(lat_el.text),
                    "lon": float(lon_el.text),
                    "ele": float(ele_el.text) if ele_el is not None else None,
                }
            )
        except (ValueError, TypeError):
            continue

    return points


def get_fitbit_activity(
    db: Session,
    user_tokens: models.UserTokens,
    start_time: datetime,
    end_time: datetime,
) -> Optional[dict]:
    """Find a Fitbit activity matching the given workout time window (±3 h)."""
    date_str = (start_time + timedelta(days=1)).strftime("%Y-%m-%d")
    url = (
        "https://api.fitbit.com/1.1/user/-/activities/list.json"
        f"?beforeDate={date_str}&offset=0&limit=20&sort=desc"
    )

    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return None

    for activity in response.json().get("activities", []):
        try:
            raw_start = activity["startTime"].replace("Z", "+00:00")
            act_start = datetime.fromisoformat(raw_start).replace(tzinfo=None)
            act_end = act_start + timedelta(milliseconds=activity["duration"])
        except Exception:
            continue

        # Match if activity started within ±3 h of the workout start.
        # Calendar events are often manually entered and can misalign by 1-2 h.
        if abs((act_start - start_time).total_seconds()) < 10800:
            return activity

        mid_workout = start_time + (end_time - start_time) / 2
        if act_start <= mid_workout <= act_end:
            return activity

    return None
