# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**GymHub** — a personal fitness platform for tracking workouts, planning routines, and visualizing analytics. It integrates with Google Calendar and Fitbit.

## Repository Structure

```
backend_v2/    FastAPI backend
frontend_v2/   React/Vite frontend
```

## Commands

### Backend

```powershell
# Install dependencies
cd backend_v2
pip install -r requirements.txt

# Run dev server (from repo root)
uvicorn backend_v2.app.main:app --reload

# Lint (must run after every .py edit)
cd backend_v2
ruff check .
ruff check --fix .
```

### Frontend

```powershell
# Install dependencies
cd frontend_v2
npm install

# Dev server
npm run dev           # http://localhost:5173

# Build
npm run build         # tsc then vite build

# Format (must run after every .ts/.tsx/.js/.jsx edit)
npx prettier --write <file>
```

## Mandatory Post-Edit Verification

- **Python files**: Run `ruff check .` immediately after every edit. Fix all issues before finishing.
- **Frontend files**: Run `npx prettier --write <file>` immediately after every edit.

## Environment Setup

Copy `backend_v2/.env.example` to `backend_v2/.env` and fill in:
- `DATABASE_URL` — SQLite default: `sqlite:///./test.db`; PostgreSQL for production
- `SECRET_KEY` — JWT signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for Google OAuth + Calendar
- `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` — for Fitbit integration
- `FRONTEND_URL` — CORS origin, default `http://localhost:5173`
- `ROOT_EMAILS` — comma-separated list of admin email addresses

Frontend requires `frontend_v2/.env` with:
- `VITE_GOOGLE_CLIENT_ID`

## Architecture

### Backend (`backend_v2/app/`)

- **`main.py`** — FastAPI app, CORS middleware, global exception handler, router registration.
- **`database.py`** — SQLAlchemy engine (SQLite dev / PostgreSQL prod), `get_db` session dependency.
- **`models.py`** — ORM models: `User`, `UserTokens` (Google + Fitbit tokens), `Workout`, `Muscle`, `Exercise`, `ExerciseSet`, `FitbitData`. All PKs are UUID strings.
- **`schemas.py`** — Pydantic request/response schemas.
- **`auth.py`** — JWT creation/verification, `get_current_user` / `get_root_user` FastAPI dependencies, Google OAuth flow.
- **`calendar_utils.py`** — Parse and generate Google Calendar event descriptions for workouts.
- **`fitbit_utils.py`** — Fitbit OAuth token refresh and activity data fetching.
- **`routers/`** — `auth_routes.py`, `workouts.py`, `exercises.py`, `analytics.py`.

### Frontend (`frontend_v2/src/`)

- **`App.tsx`** — React Router setup with `ProtectedRoute` (redirects to `/login` if unauthenticated).
- **`context/AuthContext.tsx`** — Auth state: JWT stored in `localStorage`, `useAuth()` hook.
- **`services/`** — Axios-based API clients: `api.ts` (base client), `auth.ts`, `workout.ts`, `exercise.ts`, `analytics.ts`.
- **`pages/`** — Dashboard, Login, Workouts, Calendar, Analytics, Settings, ParserTest, StandardizeExercises.
- **`components/`** — `Layout.tsx` (wraps all authenticated pages), `Sidebar.tsx`.

Key libraries: TanStack Query (server state), Recharts (charts), Framer Motion (animations), Tailwind CSS v4, Lucide React (icons).

## Commit Style

Use **Conventional Commits**: `<type>(<scope>): <short description>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

Scopes: `backend`, `frontend`, `auth`, `workouts`, `exercises`, `analytics`, `database`, `ui`

Example: `feat(backend): add Fitbit token refresh endpoint`

## Key Conventions

- All docstrings and comments must be in **English**.
- SOLID principles and Clean Code are mandatory.
- Never hardcode secrets — always read from `.env` via `python-dotenv` or `import.meta.env`.
- Use parameterized queries (SQLAlchemy ORM) — never raw string SQL.
- Feature branches off `main`; no direct commits to `main`.
