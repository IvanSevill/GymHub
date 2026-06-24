# Environment Setup — GymHub

## `backend/.env`

Copy from `backend/.env.example`. Required variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | `sqlite:///./test.db` for dev, PostgreSQL URL for prod |
| `SECRET_KEY` | JWT signing key — no default fallback, app fails if missing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth + Calendar |
| `FITBIT_CLIENT_ID` / `FITBIT_CLIENT_SECRET` | Fitbit integration |
| `FRONTEND_URL` | CORS origin (default `http://localhost:5173`) |
| `ROOT_EMAILS` | Comma-separated admin emails |
| `YOUTUBE_API_KEY` | YouTube Data API v3 — exercise library videos |
| `PEXELS_API_KEY` | Pexels image search — exercise library images |

## `ai-server/.env`

Copy from `ai-server/.env copy`. Required variables:

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio API key — server returns 503 on `/chat` if missing |
| `GEMINI_MODEL` | Model ID (default: `gemini-2.0-flash`) |
| `SECRET_KEY` | Same JWT signing key as the backend — must match exactly |
| `BACKEND_URL` | **Required.** URL of the backend service — the ai-server reads/writes all data through it (chat history, memory, usage, profile, workouts) and no longer touches the database. Default `http://localhost:8000` for dev; in production must point to the deployed backend. |
| `FRONTEND_URL` | CORS allowed origin (default: `http://localhost:5173`) |
| `MCP_SERVER_PATH` | Absolute path to `gymhub-mcp/server.py` (auto-detected relative to ai-server in dev) |

`gymhub-mcp` receives its env vars injected by `ai-server` at subprocess spawn time and does not need its own `.env` file.

## `frontend-react/.env`

| Variable | Description |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for the frontend |

## Production (Render)

The same variables from `backend/.env` must be set in the Render service environment. The ones most commonly missing after a new deploy: `YOUTUBE_API_KEY` and `PEXELS_API_KEY` (exercise media will silently degrade without them — no error, just a placeholder message in the UI).
