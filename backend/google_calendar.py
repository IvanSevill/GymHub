import os
import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from sqlalchemy.orm import Session
from models import User

class GoogleCalendarService:
    def __init__(self, user: User, db: Session):
        self.user = user
        self.db = db
        self.creds = self._get_credentials()
        self.service = build('calendar', 'v3', credentials=self.creds)

    def _get_credentials(self):
        """
        Creates Google Credentials object from user tokens.
        Handles token refresh if needed.
        """
        creds = Credentials(
            token=self.user.google_access_token,
            refresh_token=self.user.google_refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
            scopes=['https://www.googleapis.com/auth/calendar.events']
        )

        if not creds.valid:
            if creds.expired and creds.refresh_token:
                creds.refresh(Request())
                # Update user tokens in DB
                self.user.google_access_token = creds.token
                self.db.commit()
        
        return creds

    def get_upcoming_events(self, calendar_id='primary', max_results=10):
        """
        Fetches upcoming events from the specified calendar.
        """
        now = datetime.datetime.utcnow().isoformat() + 'Z'
        events_result = self.service.events().list(
            calendarId=calendar_id,
            timeMin=now,
            maxResults=max_results,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        return events_result.get('items', [])

    def get_recent_events(self, calendar_id='primary', days=7):
        """
        Fetches events from the last X days.
        """
        time_min = (datetime.datetime.utcnow() - datetime.timedelta(days=days)).isoformat() + 'Z'
        events_result = self.service.events().list(
            calendarId=calendar_id,
            timeMin=time_min,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        return events_result.get('items', [])

    def create_event(self, title, description, start_time, end_time=None, calendar_id='primary'):
        """
        Creates a new event in Google Calendar.
        """
        if not end_time:
            end_time = (start_time + datetime.timedelta(hours=1))

        event = {
            'summary': title,
            'description': description,
            'start': {'dateTime': start_time.isoformat() + 'Z'},
            'end': {'dateTime': end_time.isoformat() + 'Z'},
        }
        
        created_event = self.service.events().insert(calendarId=calendar_id, body=event).execute()
        return created_event.get('id')

    def update_event(self, event_id, title=None, description=None, calendar_id='primary'):
        """
        Updates an existing event.
        """
        event = self.service.events().get(calendarId=calendar_id, eventId=event_id).execute()
        
        if title: event['summary'] = title
        if description: event['description'] = description
        
        updated_event = self.service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
        return updated_event

    def list_calendars(self):
        """
        Lists all calendars in the user's account.
        """
        calendar_list = self.service.calendarList().list().execute()
        return calendar_list.get('items', [])
