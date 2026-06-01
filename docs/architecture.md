# Architecture — GymHub

## Repository Structure

```
backend/            FastAPI backend (Python)
frontend-react/     React/Vite frontend (TypeScript)
docs/               Design docs, workflow guides, principles, new-implementations
```

---

## Backend (`backend/app/`)

- **`main.py`** — FastAPI app, CORS middleware, global exception handler, router registration, startup column migrations.
- **`database.py`** — SQLAlchemy engine (SQLite dev / PostgreSQL prod), `get_db` session dependency.
- **`models.py`** — ORM models: `User`, `UserTokens` (Google + Fitbit tokens), `Workout`, `Muscle`, `Exercise` (includes `video_url_1`, `video_url_2`, `image_url`), `ExerciseSet`, `FitbitData`, `SleepLog`, `DailyHealth`, `ExerciseRequest`. All PKs are UUID strings.
- **`schemas.py`** — Pydantic request/response schemas.
- **`auth.py`** — JWT creation/verification, `get_current_user` / `get_root_user` FastAPI dependencies, Google OAuth flow.
- **`calendar_utils.py`** — Parse and generate Google Calendar event descriptions for workouts.
- **`fitbit_utils.py`** — Fitbit OAuth token refresh and activity data fetching.
- **`services/google_calendar.py`** — Google Calendar API client: create, update, and delete events.
- **`routers/`**:
  - `auth_routes.py` — Google OAuth login, Fitbit OAuth connect/callback, register
  - `workouts.py` — workout CRUD, Google Calendar sync, Fitbit import
  - `exercises.py` — exercise/muscle CRUD, media fetch (YouTube + Pexels), cache
  - `exercise_requests.py` — non-root users request new exercises; root approves/rejects
  - `analytics.py` — aggregated stats: KPIs, frequency, volume, PRs, Fitbit summary
  - `fitbit_sync.py` — manual and scheduled Fitbit activity sync
  - `fitbit_health.py` — Fitbit health data: daily activity, sleep logs

---

## Frontend (`frontend-react/src/`)

- **`App.tsx`** — React Router setup with `ProtectedRoute` (redirects to `/login` if unauthenticated; redirects to `CalendarSetup` if no calendar connected). `CALENDAR_CACHE_KEY` constant exported here.
- **`context/AuthContext.tsx`** — Auth state: JWT in `localStorage`, `useAuth()` hook.
- **`context/ToastContext.tsx`** — Global toast notifications, `useToast()` hook.
- **`context/ExerciseModalContext.tsx`** — Global exercise detail modal with in-memory cache, 4 states (loading/success/empty/error), `useExerciseModal()` hook.
- **`services/`** — Axios-based API clients: `api.ts` (base client + 401 interceptor), `auth.ts`, `workout.ts`, `exercise.ts`, `analytics.ts`.

### Pages (all protected unless noted)

| Route | Page | Purpose |
|---|---|---|
| `/` | `Analytics.tsx` | Dashboard with KPI cards, charts, Fitbit section |
| `/workouts` | `Workouts.tsx` | Workout history with muscle/Fitbit filters and pagination |
| `/calendar` | `Calendar.tsx` | Monthly calendar synced with Google Calendar |
| `/ejercicios` | `Exercises.tsx` | Exercise library with muscle filter pills and media cards |
| `/salud` | `FitbitHealth.tsx` | Fitbit health data: activity, sleep, heart rate charts |
| `/settings` | `Settings.tsx` | Account, integrations, exercise management, admin panel |
| `/login` | `Login.tsx` | Google OAuth sign-in *(public)* |
| `/privacy` | `PrivacyPolicy.tsx` | Privacy policy *(public)* |
| `/terms` | `TermsOfService.tsx` | Terms of service *(public)* |

### Key Components

- **`Layout.tsx`** — Wraps all authenticated pages; sidebar + main content area.
- **`Sidebar.tsx`** — Navigation links, user avatar, logout.
- **`BackendWakeup.tsx`** — Pings backend on load to wake up Render free-tier instance.
- **`OnboardingTutorial.tsx`** — First-run guided tour.
- **`ExerciseModal.tsx`** — Overlay with exercise media (Pexels image + 2 YouTube iframes); triggered via `ExerciseModalContext`.
- **`components/analytics/`** — KPICards, WeightProgressCard, FrequencyAnalysisCard, WorkoutFrequencyChart, VolumeTrendChart, DurationHistogram, MuscleBalanceChart, FitbitSection.
- **`components/calendar/`** — CalendarGrid, CalendarHeader, DayDetailModal, CreateEventModal, CardioUploadModal, WorkoutBodies, WorkoutIndicator, RouteMap.
- **`components/health/`** — HealthKpiCards, ActivityCharts, SleepCharts, StepsChart, CaloriesHeartRateChart, ActivityTable, SleepTable, and sub-components.
- **`components/workouts/`** — WorkoutCard (header + body + icon), FitbitMetricsCompact, FitbitMetricsGrid, FitbitZonesBar.
- **`components/settings/`** — ExerciseManager, ExerciseLibrary, DataResetPanel, AdminPanel, ExerciseRequestSection.
- **`components/ui/`** — ToastContainer, Skeleton, PeriodSelector.

Key libraries: TanStack Query (server state), Recharts v3 (charts), Framer Motion (animations), Tailwind CSS v4, Lucide React (icons).
