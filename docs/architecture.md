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
- **`components/exercises/`** — FilterButton, RequestExerciseCTA (request-an-exercise/muscle entry point at the bottom of the Ejercicios page), ExerciseRequestModals (shared request modals, also imported by Settings' ExerciseRequestSection).
- **`components/settings/`** — ExerciseManager, ExerciseLibrary, DataResetPanel, AdminPanel, ExerciseRequestSection.
- **`components/ui/`** — ToastContainer, Skeleton, PeriodSelector, ErrorState (shared error view with a retry CTA, used across Analytics, Salud and Calendar).

Key libraries: TanStack Query (server state), Recharts v3 (charts), Framer Motion (animations), Tailwind CSS v4, Lucide React (icons).

---

## AI Server (`ai-server/`)

Standalone FastAPI service on port 8001. **Never touches the database directly** — chat history, memory, rate-limit usage, the user profile and workout data are all read and written through the backend REST API (`/assistant/*`, `/auth/me`, `/workouts`), authenticated with the end user's JWT. It validates the same JWT tokens as the backend (shared `SECRET_KEY`).

- **`main.py`** — Bootstrap: loads `.env`, configures CORS for the frontend origin, exposes `/health`. No database engine or table creation.
- **`backend_client.py`** — Thin `httpx` wrapper (`get`/`post`/`delete`) that calls the backend with a per-request user token. Follows only same-origin GET redirects so the token is never forwarded off-host.
- **`auth.py`** — Decodes the JWT locally (fast reject), then resolves the user via the backend `GET /auth/me`. Returns an `AuthUser` dataclass with `id`, `name`, `token`, `is_root`. No DB lookup.
- **`chat.py`** — Endpoints (all persistence delegated to the backend):
  - `POST /chat` — checks the rate limit via `GET /assistant/usage`, then returns a `text/event-stream` SSE response. SSE event types: `thinking`, `text`, `error`, `done`.
  - `GET`/`DELETE /chat/history` — proxy to `/assistant/history`.
  - `GET`/`POST /chat/memory`, `DELETE /chat/memory/{id}` — proxy to `/assistant/memory`.
  - `GET /chat/usage` — proxies `/assistant/usage` (`{used, limit, reset_at, is_root}`).

  The streaming generator spawns a MCP subprocess per request via `stdio_client`, converts MCP tool schemas to Gemini `FunctionDeclaration` objects, and runs a tool-call loop (max 50 iterations; a complex question can chain many tool calls, one per metric). If the cap is ever reached, a no-tools fallback turn guarantees a final answer. The **system prompt** enforces a strict fitness-coach personality: direct, data-driven, demanding but fair; off-topic questions get an in-character refusal.

Chat persistence lives in the backend: see `backend/app/routers/assistant.py` (history, memory, and the `chat_usage`-based rate limit: 5 messages / 2 hours) backed by the `ChatMessage`, `ChatMemory` and `ChatUsage` models.

---

## MCP Server (`gymhub-mcp/`)

Model Context Protocol server launched as a subprocess by `ai-server` (one instance per chat request, stdio transport). Receives `GYMHUB_USER_ID`, `GYMHUB_TOKEN`, `BACKEND_URL`, and `AI_SERVER_URL` via environment variables injected at spawn time. Like the AI server, it reaches all data through the backend REST API.

- **`server.py`** — FastMCP entry point, registers **27 tools** (20 read + 7 write).
- **`read_tools.py`** — the read tools; all fetch the user's data through the backend REST API via `backend_client` (no direct DB access).
- **`write_tools.py`** — the write tools (create/update workouts, sync Fitbit cardio, log weight, save/recall memory); all call the backend REST API via `backend_client`.

| Tool | Type | Description |
|---|---|---|
| `get_workouts` | read | Recent workouts with sets and Fitbit data |
| `get_exercise_prs` | read | All-time personal records per exercise |
| `get_analytics_summary` | read | KPI comparison: current vs previous period |
| `get_exercise_frequency` | read | Most-trained exercises by session count |
| `get_exercise_history` | read | Time-series of sets for one exercise |
| `get_weight_progress` | read | Daily max weight trend for one exercise |
| `get_daily_health` | read | Fitbit daily activity (steps, calories, AZM) |
| `get_pending_cardio` | read | Fitbit cardio activities not yet imported as workouts (preview) |
| `get_sleep_logs` | read | Fitbit sleep records with stage breakdown |
| `get_muscle_balance` | read | Weekly training volume per muscle group |
| `get_workout_count_in_period` | read | Count workouts between two dates |
| `get_workouts_in_period` | read | Detail workouts between two dates |
| `get_user_profile` | read | Name, height, latest weight |
| `get_weight_logs` | read | Weight and body fat history |
| `get_goal_progress` | read | Active goals with current vs target value |
| `analyze_performance_correlation` | read | Pearson r between two health/performance metrics |
| `predict_performance_trend` | read | OLS linear trend for exercise performance |
| `suggest_recovery_protocol` | read | Recovery signals from workouts, sleep, HR |
| `generate_workout_plan` | read | Data bundle for LLM to build a custom plan |
| `get_overtraining_risk_assessment` | read | Risk level from volume, HR, sleep, mood trends |
| `create_workout` | write | Create workout with exercises and sets |
| `add_set_to_workout` | write | Append a set to an existing workout |
| `sync_pending_cardio` | write | Upload Fitbit cardio without a GymHub workout |
| `sync_fitbit_to_workout` | write | Associate Fitbit data with a specific workout |
| `save_memory` | write | Save a memory fact about the user |
| `get_memories` | write | Retrieve all stored memories |
| `log_weight` | write | Log/update body weight for a date |
| `delete_weight_log` | write | Delete a weight log entry |
| `set_goal` | write | Create/update a fitness goal (upsert by type) |
| `log_nutrition` | write | Log a meal with foods and macros |
| `log_mood_and_energy` | write | Log daily mood and energy (upsert by date) |
