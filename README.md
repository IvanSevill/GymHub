<div align="center">

# GymHub

**Personal fitness platform — workout tracking, performance analytics, Fitbit health sync, and Google Calendar integration**
*Plataforma personal de fitness con analítica de rendimiento*

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-prod-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

</div>

---

## What is GymHub?

GymHub is a full-stack personal fitness app built to bridge the gap between raw workout logs and actionable training insight. It stores workouts and exercise sets, syncs activity and sleep data from Fitbit, mirrors sessions to Google Calendar, and surfaces everything through an analytics dashboard designed around the principles in [`docs/data-analysis-design-principles.md`](docs/data-analysis-design-principles.md).

The project is **single-user by design** — the data model, auth flow, and API surface are all oriented toward one athlete who wants full control over their own data, not a SaaS product.

---

## Architecture
*Arquitectura general*

```
Browser (React SPA)
    │  REST + JSON
    ▼
FastAPI (Python)          ← handles auth, business logic, integrations
    │
    ├── SQLAlchemy ORM
    │       ├── SQLite (local dev)
    │       └── PostgreSQL (production on Render)
    │
    ├── Google Calendar API  ← bidirectional workout ↔ calendar event sync
    └── Fitbit API           ← OAuth token refresh + activity/sleep/HR fetch
```

**Why FastAPI?** It generates OpenAPI docs automatically (useful for rapid iteration), has first-class async support, and integrates cleanly with SQLAlchemy's sync ORM via `Depends`. Pydantic models double as request validation and response serialisation, which removes an entire class of bugs.

**Why React + Vite (not Next.js)?** GymHub is a pure SPA — there is no need for SSR, ISR, or file-based routing. Vite gives near-instant HMR and a leaner build pipeline. TanStack Query handles all server state (caching, background refetching, loading/error states) without Redux or Context boilerplate.

**Why SQLite locally?** Zero-config local dev. The SQLAlchemy ORM abstracts the difference between SQLite and PostgreSQL almost entirely — the only incompatibilities live in a couple of `func.*` expressions in analytics queries.

---

## Data Model
*Modelo de datos*

All primary keys are UUID strings generated in Python (`str(uuid.uuid4())`), not database auto-increment integers. This avoids ID collisions when migrating between SQLite and PostgreSQL and makes IDs safe to expose in URLs.

```
User
 ├── UserTokens (1:1)       — Google + Fitbit OAuth tokens, selected calendar ID
 ├── Workout (1:N)
 │    ├── ExerciseSet (1:N)  — set value ("45-40"), measurement ("kg"/"rep"/"s"), completion flag
 │    │    └── Exercise (N:1)
 │    │         └── Muscle (N:1)   — muscle group (pecho, hombro, espalda…)
 │    └── FitbitData (1:1)  — calories, avg HR, AZM zones, GPS flag, linked by workout time
 ├── DailyHealth (1:N)      — Fitbit daily summary: steps, floors, HR, active minutes
 └── SleepLog (1:N)         — Fitbit sleep session: duration, efficiency, sleep stage breakdown
```

**`ExerciseSet.value` encoding** — sets don't store separate reps and weight columns. Instead, `value` is a free-form string like `"45-40"` (range), `"42.5"` (single), or `"45/40"` (slash-separated). The analytics layer parses this with `_parse_exercise_value()` which extracts the maximum numeric value from any notation. This keeps the input flexible and avoids forcing users into a rigid reps×weight grid.

**`FitbitData` linked to `Workout`** — rather than keeping Fitbit activity logs as a standalone table, they are joined 1:1 with a `Workout`. The sync logic matches a Fitbit activity log to a GymHub workout by overlapping time windows. This means the analytics page can show heart rate and calorie data alongside exercise volume for the same session.

---

## Auth Flow
*Flujo de autenticación*

GymHub uses **Google OAuth 2.0** as the only sign-in method. There is no email/password registration (the `hashed_password` column on `User` exists but is unused).

```
1. Frontend sends Google ID token (from @react-oauth/google)
   to POST /auth/google

2. Backend verifies the ID token with Google's public keys,
   extracts email + name + picture

3. User is created if first login, or fetched if returning

4. Backend issues its own short-lived JWT (HS256, SECRET_KEY)
   — this JWT is stored in localStorage and sent as Bearer token

5. All protected routes use get_current_user() dependency
   which decodes the JWT and loads the User from DB
```

**Google Calendar OAuth** is separate — it uses an authorization code flow (`/auth/google/calendar`) to get a refresh token with Calendar scope. The refresh token is stored in `UserTokens.google_refresh_token`. This is not requested at login to avoid showing a scary permissions screen on first visit.

**Fitbit OAuth** follows the same pattern: an explicit `/auth/fitbit` flow stores the Fitbit refresh token in `UserTokens.fitbit_refresh_token`. `fitbit_utils.refresh_fitbit_token()` handles automatic token rotation on every API call.

---

## Features in Detail
*Funcionalidades en detalle*

### Workouts (`/workouts`)
Workouts map 1:1 to Google Calendar events. Creating or editing a workout writes back to Calendar; importing from Calendar creates a Workout. The `calendar_utils.py` module owns a custom text encoding that packs exercise/set data into the Calendar event description so it survives the round-trip without a separate sync DB.

### Analytics (`/` — root route)
The analytics dashboard is built around the 9 analytical chart patterns documented in `docs/data-analysis-design-principles.md`. Key charts:

| Component | What it shows |
|---|---|
| `KPICards` | Workout count, total volume (kg), avg duration — current vs. previous period |
| `VolumeTrendChart` | Weekly training volume over time (Recharts AreaChart) |
| `WorkoutFrequencyChart` | Days trained per week (BarChart) |
| `WeightProgressCard` | Max weight per day for a selected exercise (LineChart) |
| `FrequencyAnalysisCard` | Heatmap-style frequency by day-of-week and hour |
| `MuscleBalanceChart` | RadarChart of volume by muscle group |
| `DurationHistogram` | Distribution of session durations |

### Salud — Fitbit Health (`/salud`)
Displays synced Fitbit data in two sub-sections:

- **Daily Activity** — steps, floors, calories, resting HR, active/sedentary minutes from `DailyHealth`. Rendered as `ActivityCharts` + `ActivityTable`.
- **Sleep** — nightly sleep sessions with stage breakdown (deep/light/REM/wake) from `SleepLog`. Rendered as `SleepCharts` + `SleepTable`.
- **Health KPIs** — summary cards at the top (`HealthKpiCards`) averaging key metrics over the selected period.

Fitbit data is fetched lazily per day range from the Fitbit API and upserted into the local DB. The backend calls `GET /1/user/-/activities/date/{date}.json` and `GET /1.2/user/-/sleep/date/{start}/{end}.json` for each resource.

### Calendar (`/calendar`)
Custom calendar grid built from scratch (no FullCalendar or similar). `CalendarGrid` renders a month view; `DayDetailModal` opens on click and shows the workout(s) for that day. `CreateEventModal` lets you plan a future workout. `RouteMap` renders a Leaflet map if the Fitbit activity has GPS data.

### Records (`/records`)
Personal records per exercise, automatically derived from the max value across all `ExerciseSet` rows. The backend computes PRs on the fly — no separate records table.

### Settings (`/settings`)
Three admin-gated panels:
- **Exercise Manager** — create/rename exercises and map them to muscle groups
- **Exercise Library** — bulk view of all exercises
- **Admin Panel** — root-user-only data management

---

## Key Technical Patterns
*Patrones técnicos notables*

**`BackendWakeup`** — Render's free tier spins down after inactivity. `BackendWakeup.tsx` polls the health endpoint on app load and shows a "waking up the server" overlay while waiting. This avoids the first request timing out silently.

**`ProtectedRoute` + Calendar gate** — `ProtectedRoute` doesn't just check auth; if the user is authenticated but has no `selected_calendar_id`, it renders `CalendarSetup` instead. The user must pick or create a Google Calendar before accessing any other route. This enforces the invariant that every workout is linked to a calendar.

**TanStack Query** — all server state lives in Query. Each data domain has its own query key (`["workouts"]`, `["analytics", "kpis", period]`, etc.). The analytics page passes period/days as part of the query key so changing the time range automatically triggers a refetch without any manual effect wiring.

**Ruff** — the sole Python linter/formatter. Configured to be strict (E, W, F rules). All `.py` files must pass `ruff check .` before commit.

---

## Stack Summary
*Resumen del stack*

| Layer | Technology | Why |
|---|---|---|
| Backend framework | FastAPI 0.115 | Auto-docs, async, Pydantic integration |
| ORM | SQLAlchemy 2.x | Portable SQL, clean migrations path |
| DB (dev) | SQLite | Zero config local dev |
| DB (prod) | PostgreSQL on Render | Free tier, full SQL |
| Auth | Google OAuth 2.0 + JWT (HS256) | Single sign-on, no password management |
| Frontend framework | React 19 + Vite | SPA, fast HMR, no SSR needed |
| Language | TypeScript 5 | Full type safety across frontend |
| Styling | Tailwind CSS v4 | Utility-first, consistent design tokens |
| Charts | Recharts v3 | Composable, React-native, good defaults |
| Animations | Framer Motion | Layout animations, page transitions |
| Server state | TanStack Query | Caching, background refetch, loading states |
| Icons | Lucide React | Consistent icon set |
| Linting (Python) | Ruff | Fast, strict, replaces flake8 + isort |
| Formatting (TS) | Prettier | Zero-config consistent formatting |
| Deployment | Render Blueprint (`render.yaml`) | One-click multi-service deploy |

---

## Local Setup
*Puesta en marcha*

```bash
# Backend
cd backend && cp .env.example .env   # fill in credentials
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs

# Frontend (separate terminal)
cd frontend-react && cp .env.example .env
npm install && npm run dev
# → http://localhost:5173
```

Required env vars: `DATABASE_URL`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FRONTEND_URL`, `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.

Full variable reference: [`backend/.env.example`](backend/.env.example) · [`frontend-react/.env.example`](frontend-react/.env.example)

---

## Docs
*Documentación interna*

| File | Contents |
|---|---|
| [`docs/git-workflow.md`](docs/git-workflow.md) | Branch model, commit style, release flow with diagrams |
| [`docs/data-analysis-design-principles.md`](docs/data-analysis-design-principles.md) | 9 analytical chart patterns used in the analytics dashboard |
| [`CLAUDE.md`](CLAUDE.md) | Development guide for Claude Code (AI assistant config) |

---

## License

MIT
