import logging
import os
from typing import Optional

from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy.orm import Session, joinedload

from .. import calendar_utils, models

logger = logging.getLogger(__name__)


def get_google_credentials(user_tokens: models.UserTokens, db: Session) -> Optional[Credentials]:
    """Get and refresh Google API credentials from stored tokens."""
    if not user_tokens or not user_tokens.google_access_token:
        return None

    creds = Credentials(
        token=user_tokens.google_access_token,
        refresh_token=user_tokens.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    )

    # We don't store token expiry, so creds.valid is always True (expired=False when
    # expiry=None). Always try to refresh proactively if a refresh_token is available.
    if creds.refresh_token:
        try:
            creds.refresh(GoogleAuthRequest())
            user_tokens.google_access_token = creds.token
            db.commit()
        except Exception as e:
            logger.warning("Failed to refresh Google token: %s", e)
            # Fall back to the stored access token — it may still be within its 1h window
    elif not creds.token:
        logger.warning("No Google access token and no refresh token available.")
        return None

    return creds


def update_google_calendar_event(
    db: Session,
    user_tokens: models.UserTokens,
    workout: models.Workout,
    fitbit_data: Optional[models.FitbitData] = None,
) -> Optional[str]:
    """Create or update a Google Calendar event for a workout. Returns event ID or None."""
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        logger.warning("No valid Google credentials for calendar sync.")
        return None

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    active_exercise_ids = [es.exercise_id for es in workout.exercise_sets if es.exercise_id]
    if active_exercise_ids:
        ex_map = {
            e.id: e
            for e in db.query(models.Exercise)
            .options(joinedload(models.Exercise.muscle))
            .filter(models.Exercise.id.in_(active_exercise_ids))
            .all()
        }
        for es in workout.exercise_sets:
            if es.exercise_id in ex_map:
                es.exercise = ex_map[es.exercise_id]

    exercises_by_muscle: dict = {}
    title_muscles = calendar_utils._muscles_from_title(workout.title or "")
    lookup_muscles = title_muscles if title_muscles else set()

    if not lookup_muscles and active_exercise_ids:
        lookup_muscles = {
            es.exercise.muscle.name
            for es in workout.exercise_sets
            if es.exercise and es.exercise.muscle
        }

    if lookup_muscles:
        muscle_objs = (
            db.query(models.Muscle)
            .filter(models.Muscle.name.in_(list(lookup_muscles)))
            .all()
        )
        muscle_ids = [m.id for m in muscle_objs]
        for ex in (
            db.query(models.Exercise)
            .options(joinedload(models.Exercise.muscle))
            .filter(models.Exercise.muscle_id.in_(muscle_ids))
            .all()
        ):
            exercises_by_muscle.setdefault(ex.muscle.name.lower(), []).append(ex)

    all_exercise_ids = [ex.id for exs in exercises_by_muscle.values() for ex in exs]
    prs = calendar_utils.get_exercise_prs_as_of(
        db=db,
        user_id=workout.user_id,
        as_of_date=workout.start_time,
        exercise_ids=all_exercise_ids,
    )
    description = calendar_utils.generate_calendar_description(
        workout, fitbit_data, exercises_by_muscle, prs
    )

    event_body = {
        "summary": workout.title,
        "description": description,
        "start": {"dateTime": workout.start_time.isoformat() + "Z"},
        "end": {"dateTime": workout.end_time.isoformat() + "Z"},
    }

    calendar_id = user_tokens.selected_calendar_id or "primary"

    try:
        if workout.google_event_id:
            event = service.events().update(
                calendarId=calendar_id,
                eventId=workout.google_event_id,
                body=event_body,
            ).execute()
        else:
            event = service.events().insert(
                calendarId=calendar_id, body=event_body
            ).execute()
            workout.google_event_id = event["id"]
        return event["id"]
    except Exception as e:
        logger.error("Calendar sync error: %s", e)
        return None
