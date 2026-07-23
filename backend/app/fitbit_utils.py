import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Optional

import defusedxml.ElementTree as ET
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"


@dataclass(frozen=True)
class FitbitSyncFailure(Exception):
    """Safe diagnostic raised only by opt-in Calendar sync callers."""

    stage: str
    code: str
    status_code: int
    retryable: bool
    provider_status: Optional[int] = None


def _failure(
    stage: str,
    code: str,
    status_code: int,
    retryable: bool,
    provider_status: Optional[int] = None,
) -> FitbitSyncFailure:
    return FitbitSyncFailure(stage, code, status_code, retryable, provider_status)


def refresh_fitbit_token(
    db: Session,
    user_tokens: models.UserTokens,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
) -> Optional[str]:
    """Refresh the Fitbit access token. Returns the new token or None on failure."""
    if not user_tokens.fitbit_refresh_token:
        if strict:
            raise _failure("fitbit_auth", "FITBIT_REAUTH_REQUIRED", 424, False)
        return None

    # Fitbit refresh tokens are single-use: each refresh rotates the token and
    # invalidates the old one. When the access token expires, the frontend fires
    # several Fitbit requests in parallel and each hits 401 at once, so multiple
    # refreshes race on the same refresh token — only the first succeeds and the
    # rest get `invalid_grant`, dropping the connection. Serialize the refresh on
    # the token row and re-read it: a request that loses the race reuses the
    # access token the winner just minted instead of double-spending the token.
    old_refresh = user_tokens.fitbit_refresh_token
    # populate_existing() overwrites the identity-mapped instance with the freshly
    # locked DB row, so a request that waited on the lock actually sees the token
    # a concurrent transaction just committed (otherwise SQLAlchemy keeps the
    # stale in-memory value and we'd re-spend the already-rotated refresh token).
    row = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.id == user_tokens.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if row is None:
        if strict:
            raise _failure("fitbit_auth", "FITBIT_REAUTH_REQUIRED", 424, False)
        return None
    if row.fitbit_refresh_token and row.fitbit_refresh_token != old_refresh:
        # Another request already rotated the token while we waited for the lock.
        user_tokens.fitbit_access_token = row.fitbit_access_token
        user_tokens.fitbit_refresh_token = row.fitbit_refresh_token
        db.commit()  # release the row lock
        return row.fitbit_access_token

    auth_header = base64.b64encode(
        f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()
    ).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "refresh_token",
        "refresh_token": row.fitbit_refresh_token,
    }

    try:
        response = requests.post(FITBIT_TOKEN_URL, headers=headers, data=data, timeout=10)
    except requests.Timeout:
        if strict:
            raise _failure("fitbit_auth", "FITBIT_AUTH_TIMEOUT", 504, True) from None
        return None
    except requests.RequestException:
        if strict:
            raise _failure("fitbit_auth", "FITBIT_AUTH_UNAVAILABLE", 503, True) from None
        return None

    if response.status_code == 200:
        try:
            new_tokens = response.json()
            access_token = new_tokens["access_token"]
            refresh_token = new_tokens["refresh_token"]
            if not isinstance(access_token, str) or not isinstance(refresh_token, str):
                raise ValueError
        except (KeyError, TypeError, ValueError, requests.JSONDecodeError):
            if strict:
                raise _failure("processing", "FITBIT_RESPONSE_INVALID", 502, False) from None
            return None
        user_tokens.fitbit_access_token = access_token
        user_tokens.fitbit_refresh_token = refresh_token
        db.commit()
        return user_tokens.fitbit_access_token

    logger.warning(
        "Fitbit token refresh failed",
        extra={"provider_status": response.status_code},
    )

    try:
        error_payload = response.json()
    except (ValueError, requests.JSONDecodeError):
        error_payload = {}
    if not isinstance(error_payload, dict):
        try:
            error_payload = json.loads(response.text)
        except (TypeError, ValueError):
            error_payload = {}
    invalid_grant = response.status_code == 400 and (
        error_payload.get("error") == "invalid_grant"
        or any(
            error.get("errorType") == "invalid_grant"
            for error in error_payload.get("errors", [])
            if isinstance(error, dict)
        )
    )

    if invalid_grant:
        logger.warning(
            "Fitbit refresh token permanently invalid; clearing credentials",
            extra={"provider_status": response.status_code},
        )
        user_tokens.fitbit_id = None
        user_tokens.fitbit_access_token = None
        user_tokens.fitbit_refresh_token = None
        db.commit()
        if strict:
            raise _failure(
                "fitbit_auth",
                "FITBIT_REAUTH_REQUIRED",
                424,
                False,
                response.status_code,
            )
        return None

    if strict:
        if response.status_code >= 500 or response.status_code == 429:
            raise _failure(
                "fitbit_auth",
                "FITBIT_AUTH_UNAVAILABLE",
                503,
                True,
                response.status_code,
            )
        raise _failure(
            "fitbit_auth",
            "FITBIT_REAUTH_REQUIRED",
            424,
            False,
            response.status_code,
        )

    return None


def _fitbit_get(
    db: Session,
    user_tokens: models.UserTokens,
    url: str,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
) -> Optional[requests.Response]:
    """Authenticated GET to Fitbit API. Retries once after a token refresh on 401."""
    access_token = user_tokens.fitbit_access_token
    if not access_token:
        if strict:
            raise _failure("fitbit_auth", "FITBIT_REAUTH_REQUIRED", 424, False)
        return None

    try:
        response = requests.get(
            url, headers={"Authorization": f"Bearer {access_token}"}, timeout=10
        )
    except requests.Timeout:
        if strict:
            raise _failure("fitbit_api", "FITBIT_API_TIMEOUT", 504, True) from None
        return None
    except requests.RequestException:
        if strict:
            raise _failure("fitbit_api", "FITBIT_API_UNAVAILABLE", 503, True) from None
        return None
    if response.status_code == 401:
        access_token = refresh_fitbit_token(
            db,
            user_tokens,
            strict=strict,
            correlation_id=correlation_id,
        )
        if not access_token:
            logger.warning("Fitbit token refresh failed; request not retried")
            return None
        try:
            response = requests.get(
                url, headers={"Authorization": f"Bearer {access_token}"}, timeout=10
            )
        except requests.Timeout:
            if strict:
                raise _failure("fitbit_api", "FITBIT_API_TIMEOUT", 504, True) from None
            return None
        except requests.RequestException:
            if strict:
                raise _failure("fitbit_api", "FITBIT_API_UNAVAILABLE", 503, True) from None
            return None

    if response.status_code == 200:
        return response
    if not strict:
        return None
    if response.status_code == 401:
        raise _failure(
            "fitbit_auth", "FITBIT_REAUTH_REQUIRED", 424, False, response.status_code
        )
    if response.status_code == 429:
        raise _failure(
            "fitbit_api", "FITBIT_API_RATE_LIMITED", 503, True, response.status_code
        )
    if response.status_code >= 500:
        raise _failure(
            "fitbit_api", "FITBIT_API_UNAVAILABLE", 503, True, response.status_code
        )
    raise _failure(
        "fitbit_api", "FITBIT_API_REJECTED", 502, False, response.status_code
    )


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
    db: Session,
    user_tokens: models.UserTokens,
    days: int = 30,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
    processing_failures: Optional[list] = None,
) -> list:
    """Fetch all Fitbit activities from the last N days, most-recent first."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    date_str = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%d")
    url = (
        "https://api.fitbit.com/1.1/user/-/activities/list.json"
        f"?beforeDate={date_str}&offset=0&limit=100&sort=desc"
    )

    response = _fitbit_get(
        db,
        user_tokens,
        url,
        strict=strict,
        correlation_id=correlation_id,
    )
    if response is None:
        return []

    try:
        payload = response.json()
        activities = payload["activities"]
        if not isinstance(activities, list):
            raise TypeError
    except (KeyError, TypeError, ValueError, requests.JSONDecodeError):
        if strict:
            raise _failure("processing", "FITBIT_RESPONSE_INVALID", 502, False) from None
        return []

    result = []
    for activity in activities:
        try:
            act_start = (
                datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
            if act_start < cutoff or activity["activityName"] == "Walk":
                break  # sorted desc — stop once outside the window
            result.append(activity)
        except Exception:
            if strict and processing_failures is not None:
                processing_failures.append("FITBIT_ACTIVITY_PROCESSING_FAILED")
            continue

    return result


def get_fitbit_route(
    db: Session, user_tokens: models.UserTokens, log_id: str
) -> list:
    """Fetch GPS trackpoints from a Fitbit activity's TCX file.

    Returns a list of {lat, lon, ele} dicts. Requires the 'location' OAuth scope.
    Connected GPS (phone GPS paired to watch) sets hasGps=false in the activities
    list API but still includes trackpoints in the TCX — so we always attempt the
    fetch when a log_id is present and let the parse result decide.
    """
    if not log_id:
        return []

    url = f"https://api.fitbit.com/1/user/-/activities/{log_id}.tcx?includePartialTCX=true"
    logger.debug("Fetching Fitbit TCX route")
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        logger.warning("Fitbit TCX route fetch failed")
        return []

    logger.debug("Fitbit TCX response received", extra={"response_bytes": len(response.text)})

    # Try standard Garmin namespace (Fitbit uses this for both onboard and connected GPS)
    ns = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        logger.warning("Fitbit TCX XML parse failed")
        return []

    trackpoints = root.findall(".//tcx:Trackpoint", ns)
    logger.debug("Fitbit TCX trackpoints parsed", extra={"trackpoint_count": len(trackpoints)})

    points = []
    for tp in trackpoints:
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

    logger.debug("Parsed %d GPS points for log_id=%s", len(points), log_id)
    return points


def probe_has_gps(
    db: Session,
    user_tokens: models.UserTokens,
    log_id: str,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
) -> bool:
    """Return True if the Fitbit activity TCX contains at least one GPS Position element."""
    if not log_id:
        return False
    url = f"https://api.fitbit.com/1/user/-/activities/{log_id}.tcx?includePartialTCX=true"
    response = _fitbit_get(
        db,
        user_tokens,
        url,
        strict=strict,
        correlation_id=correlation_id,
    )
    if response is None:
        return False
    ns = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}
    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        return False
    return root.find(".//tcx:Position", ns) is not None


def get_sleep_list(
    db: Session,
    user_tokens: models.UserTokens,
    before_date: str,
    limit: int = 100,
) -> list:
    """Fetch up to `limit` sleep records before a date using the list endpoint (one API call)."""
    url = (
        f"https://api.fitbit.com/1.2/user/-/sleep/list.json"
        f"?beforeDate={before_date}&offset=0&limit={limit}&sort=desc"
    )
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return []
    return response.json().get("sleep", [])


def get_activity_time_series(
    db: Session,
    user_tokens: models.UserTokens,
    resource: str,
    from_date: str,
    to_date: str,
) -> list:
    """Fetch a daily time series for an activity resource over a date range (one API call).

    Returns list of {"dateTime": "YYYY-MM-DD", "value": "<string>"}.
    """
    url = f"https://api.fitbit.com/1/user/-/activities/{resource}/date/{from_date}/{to_date}.json"
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return []
    return response.json().get(f"activities-{resource}", [])


def get_resting_hr_time_series(
    db: Session,
    user_tokens: models.UserTokens,
    from_date: str,
    to_date: str,
) -> dict:
    """Fetch resting heart rate for a date range. Returns {date_str: resting_hr_int}."""
    url = f"https://api.fitbit.com/1/user/-/activities/heart/date/{from_date}/{to_date}.json"
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return {}
    result = {}
    for entry in response.json().get("activities-heart", []):
        val = entry.get("value")
        if isinstance(val, dict) and "restingHeartRate" in val:
            result[entry["dateTime"]] = val["restingHeartRate"]
    return result


def get_sleep_for_date(
    db: Session,
    user_tokens: models.UserTokens,
    date_str: str,
) -> list:
    """Fetch Fitbit sleep logs for a given date (YYYY-MM-DD). Returns raw sleep list."""
    url = f"https://api.fitbit.com/1.2/user/-/sleep/date/{date_str}.json"
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return []
    return response.json().get("sleep", [])


def get_daily_activity(
    db: Session,
    user_tokens: models.UserTokens,
    date_str: str,
) -> Optional[dict]:
    """Fetch Fitbit daily activity summary for a given date (YYYY-MM-DD)."""
    url = f"https://api.fitbit.com/1/user/-/activities/date/{date_str}.json"
    response = _fitbit_get(db, user_tokens, url)
    if response is None:
        return None
    return response.json().get("summary")


def is_weights_workout(workout: models.Workout) -> bool:
    """Return whether a GymHub workout contains non-cardio exercise sets."""
    return any(
        exercise_set.exercise
        and exercise_set.exercise.name.lower() != "cardio"
        for exercise_set in workout.exercise_sets
    )


def get_fitbit_activity(
    db: Session,
    user_tokens: models.UserTokens,
    start_time: datetime,
    end_time: datetime,
    required_activity_name: Optional[str] = None,
    *,
    strict: bool = False,
    correlation_id: Optional[str] = None,
) -> Optional[dict]:
    """Find the closest Fitbit activity matching the workout time and type."""
    date_str = (start_time + timedelta(days=1)).strftime("%Y-%m-%d")
    url = (
        "https://api.fitbit.com/1.1/user/-/activities/list.json"
        f"?beforeDate={date_str}&offset=0&limit=20&sort=desc"
    )

    response = _fitbit_get(
        db,
        user_tokens,
        url,
        strict=strict,
        correlation_id=correlation_id,
    )
    if response is None:
        return None

    try:
        payload = response.json()
        activities = payload["activities"]
        if not isinstance(activities, list):
            raise TypeError
    except (KeyError, TypeError, ValueError, requests.JSONDecodeError):
        if strict:
            raise _failure("processing", "FITBIT_RESPONSE_INVALID", 502, False) from None
        return None

    matches = []
    invalid_activity = False
    for activity in activities:
        try:
            act_start = (
                datetime.fromisoformat(activity["startTime"].replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .replace(tzinfo=None)
            )
            act_end = act_start + timedelta(milliseconds=activity["duration"])
        except Exception:
            invalid_activity = True
            continue

        # Match if activity started within ±3 h of the workout start.
        # Calendar events are often manually entered and can misalign by 1-2 h.
        mid_workout = start_time + (end_time - start_time) / 2
        start_delta = abs((act_start - start_time).total_seconds())
        if start_delta >= 10800 and not act_start <= mid_workout <= act_end:
            continue

        if required_activity_name and required_activity_name.lower() not in activity.get(
            "activityName", ""
        ).lower():
            continue

        matches.append((start_delta, activity))

    if matches:
        return min(matches, key=lambda match: match[0])[1]
    if strict and invalid_activity:
        raise _failure(
            "processing", "FITBIT_ACTIVITY_PROCESSING_FAILED", 500, False
        )
    return None
