# GymHub Project Context

This document provides essential context for anyone working on the GymHub project, covering its purpose, architectural overview, key technologies, and important development considerations.

## 1. Project Purpose

GymHub is a personal fitness platform designed to help users track, plan, and analyze their workouts. Its core functionalities include:

*   **Workout Tracking:** Detailed logging of exercises, sets, reps, and weights.
*   **Workout Planning:** Tools for creating and managing customizable workout routines.
*   **Data Visualization & Analytics:** Graphs and charts to visualize progress, identify trends, and gain insights.
*   **Google Calendar Integration:** Seamlessly syncs workouts with Google Calendar for scheduling and overview.
*   **Fitbit Integration:** Automatically pulls activity data from Fitbit to enrich workout logs.

## 2. Architectural Overview

GymHub follows a microservices-oriented architecture with distinct components:

*   **Backend (FastAPI):**
    *   **Purpose:** Provides a RESTful API for all application logic, data storage, and third-party integrations (Google Calendar, Fitbit).
    *   **Key Components:**
        *   **`main.py`**: Main application entry point, CORS, global exception handling, router inclusion.
        *   **`database.py`**: SQLAlchemy engine and session management. Configured for SQLite (development) and PostgreSQL (production).
        *   **`models.py`**: SQLAlchemy ORM models for `User`, `Workout`, `Exercise`, `Muscle`, `ExerciseSet`, `UserTokens`, `FitbitData`.
        *   **`schemas.py`**: Pydantic schemas for request/response data validation and serialization.
        *   **`auth.py`**: User authentication (JWT, password hashing, OAuth), current user/root user dependencies.
        *   **`calendar_utils.py`**: Logic for parsing/generating Google Calendar event descriptions.
        *   **`fitbit_utils.py`**: Logic for Fitbit OAuth, token refresh, and activity data fetching/parsing.
        *   **`routers/`**: Directory containing separate modules for API endpoints (e.g., `auth_routes.py`, `workouts.py`, `exercises.py`, `analytics.py`).
    *   **Database:** Currently using SQLite for development, but designed for PostgreSQL in production. SQLAlchemy is the ORM.

*   **Frontend (React/Vite):**
    *   **Purpose:** Provides the web-based user interface and interacts with the FastAPI backend.
    *   **Key Technologies:** React, Vite (build tool).
    *   **Future Focus:** Modern UI/UX, advanced data visualization, responsive design, robust state management.

*   **Mobile App (Android):**
    *   **Purpose:** Provides a native mobile experience.
    *   **Current Status:** Existing implementation, but future development will align it with the refactored backend.

## 3. Key Technologies

*   **Backend:**
    *   Python 3.x
    *   FastAPI (Web Framework)
    *   SQLAlchemy (ORM)
    *   PostgreSQL (Production Database, currently using SQLite for development)
    *   Pydantic (Data Validation)
    *   `python-jose` (JWT)
    *   `passlib` (Password Hashing)
    *   `requests` (HTTP client)
    *   `google-api-python-client` / `google-auth-oauthlib` (Google APIs)
    *   `python-dotenv` (Environment Variables)
    *   `ruff` (Linter/Formatter)

*   **Frontend:**
    *   JavaScript/TypeScript
    *   React (UI Library)
    *   Vite (Build Tool)
    *   (Future: Modern UI library like Material UI, Chakra UI, or Tailwind CSS; Charting library for analytics)

## 4. Development Considerations

*   **SOLID Principles & Clean Code:** Strict adherence to these principles is mandatory across the codebase.
*   **Documentation:** All docstrings and comments MUST be written in English.
*   **Environment Variables:** Sensitive information (API keys, database URLs) must be loaded from `.env` files and never hardcoded or committed to version control.
*   **Testing:** Comprehensive unit and integration tests are crucial for both backend and frontend.
*   **CI/CD:** Utilize GitHub Actions for automated testing, linting, and deployment.
*   **Error Handling:** Implement robust error handling on both client and server sides, providing meaningful feedback to users.
*   **Security:** Prioritize security best practices, especially concerning authentication, data storage, and API interactions. Use parameterized queries for database interactions.

## 5. Future Enhancements

*   **Offline Capabilities:** For the mobile app.
*   **Personalized Recommendations:** AI-powered suggestions for workouts, nutrition, etc.
*   **More Wearable Integrations:** Expand beyond Fitbit.
*   **Real-time Updates:** For workout tracking or collaborative features.

---

This `PROJECT_CONTEXT.md` provides a foundation for understanding the GymHub project.
