# GymHub Backend

FastAPI backend for tracking gym workouts with Google Calendar and Fitbit integration.

## Setup

1.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Environment Variables**:
    Copy `.env.example` to `.env` and fill in your credentials:
    - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (from Google Cloud Console)
    - `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` (from Fitbit Developer Portal)
    - `SECRET_KEY` (for JWT)
    - `ROOT_EMAILS` (comma-separated list of admin emails)

3.  **Run the application**:
    ```bash
    uvicorn app.main:app --reload
    ```

## Features

- **Google Calendar Sync**: Workouts are automatically created/updated in your selected Google Calendar.
- **Fitbit Integration**: Sync calorie and heart rate data from Fitbit activities directly into your workouts.
- **Analytics**: Track your progress with time-series charts and exercise frequency reports.
- **Flexible Muscle Mapping**: Automatic expansion of "Pierna" and other muscle groups.

## Testing

Run tests with pytest:
```bash
pytest
```
