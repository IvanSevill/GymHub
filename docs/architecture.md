# Architecture — GymHub

## Repository Structure

```
backend/            FastAPI backend (Python)
ai-server/          Standalone FastAPI AI service (Gemini + MCP, port 8001)
gymhub-mcp/         MCP server — 13 GymHub tools exposed to the AI
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

---

## AI Server (`ai-server/`)

Standalone FastAPI service on port 8001. Uses the same PostgreSQL/SQLite database as the backend (read-only for most operations) and validates the same JWT tokens.

- **`main.py`** — Bootstrap: loads `.env`, creates `chat_messages` table on startup, configures CORS for the frontend origin, exposes `/health`.
- **`auth.py`** — Decodes JWT tokens issued by `backend/app/auth.py` (same `SECRET_KEY`). Returns an `AuthUser` dataclass with `id`, `name`, `token`, `is_root`.
- **`chat.py`** — Four endpoints:
  - `POST /chat` — validates rate limit, then returns a `text/event-stream` SSE response. SSE event types: `thinking`, `text`, `error`, `done`.
  - `GET /chat/history` — last 10 messages for the current user.
  - `DELETE /chat/history` — clears all messages for the current user.
  - `GET /chat/usage` — returns `{used, limit, reset_hours, is_root}` for rate-limit display.
  
  The streaming generator spawns a MCP subprocess per request via `stdio_client`, converts MCP tool schemas to Gemini `FunctionDeclaration` objects, and runs a tool-call loop (max 6 iterations).
- **`chat_history.py`** — DB persistence: `save_message`, `get_history` (last 10 messages, oldest first), `count_recent_user_messages` (rate-limit window: 5 messages / 2 hours), `delete_history`.
- **`models.py`** — Read-only mirror of the main backend's ORM models (Workout, Exercise, etc.) plus the `ChatMessage` table owned by this service.

---

## MCP Server (`gymhub-mcp/`)

Model Context Protocol server launched as a subprocess by `ai-server` (one instance per chat request, stdio transport). Receives `GYMHUB_USER_ID`, `GYMHUB_TOKEN`, `DATABASE_URL`, and `BACKEND_URL` via environment variables injected at spawn time.

- **`server.py`** — FastMCP entry point, registers all 13 tools.
- **`read_tools.py`** — 9 read tools that query the DB directly via SQLAlchemy (no HTTP round-trip).
- **`write_tools.py`** — 4 write tools that call the backend REST API via `httpx` using the user's Bearer token.

| Tool | Type | Description |
|---|---|---|
| `get_workouts` | read | Recent workouts with sets and Fitbit data |
| `get_exercise_prs` | read | All-time personal records per exercise |
| `get_analytics_summary` | read | KPI comparison: current vs previous period |
| `get_exercise_frequency` | read | Most-trained exercises by session count |
| `get_exercise_history` | read | Time-series of sets for one exercise |
| `get_weight_progress` | read | Daily max weight trend for one exercise |
| `get_daily_health` | read | Fitbit daily activity (steps, calories, AZM) |
| `get_sleep_logs` | read | Fitbit sleep records with stage breakdown |
| `get_muscle_balance` | read | Weekly training volume per muscle group |
| `create_workout` | write | Create workout with exercises and sets |
| `add_set_to_workout` | write | Append a set to an existing workout |
| `sync_pending_cardio` | write | Upload Fitbit cardio without a GymHub workout |
| `sync_fitbit_to_workout` | write | Associate Fitbit data with a specific workout |
