# GymHub

Personal fitness platform for tracking workouts, planning routines, and visualizing analytics. Integrates with Google Calendar and Fitbit.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI · SQLAlchemy · PostgreSQL (SQLite for dev) |
| Frontend | React 19 · Vite · Tailwind CSS v4 · Recharts · Framer Motion |
| Auth | Google OAuth 2.0 · JWT |
| Integrations | Google Calendar API · Fitbit API |
| Deploy | Render (backend + frontend + PostgreSQL) |

---

## Local development

### Prerequisites

- Python 3.11+
- Node 20+

### Backend

```bash
cd backend
cp .env.example .env        # fill in your credentials
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend-react
cp .env.example .env        # set VITE_API_URL and VITE_GOOGLE_CLIENT_ID
npm install
npm run dev                  # http://localhost:5173
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLAlchemy connection string. Defaults to `sqlite:///./test.db` |
| `SECRET_KEY` | JWT signing key. Use a random 32-byte hex string in production |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `FITBIT_CLIENT_ID` | Fitbit OAuth app ID |
| `FITBIT_CLIENT_SECRET` | Fitbit OAuth app secret |
| `FRONTEND_URL` | Frontend origin added to CORS allowlist (e.g. `https://gymhub-frontend.onrender.com`) |
| `ROOT_EMAILS` | Comma-separated list of admin email addresses |

### Frontend (`frontend-react/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL (e.g. `https://gymhub-backend.onrender.com`) |
| `VITE_GOOGLE_CLIENT_ID` | Same Google OAuth client ID as the backend |

---

## Deploy to Render

The repo ships with a `render.yaml` Blueprint. To deploy:

1. Push this repo to GitHub.
2. In the [Render dashboard](https://dashboard.render.com), click **New → Blueprint** and point it at your repo.
3. Render will create:
   - `gymhub-backend` — Python web service (FastAPI)
   - `gymhub-frontend` — Static site (React/Vite)
   - `gymhub-db` — PostgreSQL database
4. After the first deploy, set the secrets marked `sync: false` in the Render dashboard:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`
   - `VITE_GOOGLE_CLIENT_ID`
   - `ROOT_EMAILS`
5. Update the URLs in `render.yaml` if you use custom domains.

> **Important — Google OAuth redirect URIs**: Add your Render backend URL (`https://gymhub-backend.onrender.com`) to the *Authorized redirect URIs* in the Google Cloud Console, and add your frontend URL to *Authorized JavaScript origins*.

---

## Project structure

```
.
├── backend/                FastAPI application
│   ├── app/
│   │   ├── main.py         App factory, CORS, router registration
│   │   ├── database.py     SQLAlchemy engine & session
│   │   ├── models.py       ORM models (User, Workout, Exercise, …)
│   │   ├── schemas.py      Pydantic request/response schemas
│   │   ├── auth.py         JWT + Google OAuth helpers
│   │   ├── calendar_utils.py  Google Calendar read/write
│   │   ├── fitbit_utils.py    Fitbit token refresh + activity fetch
│   │   └── routers/
│   │       ├── auth_routes.py
│   │       ├── workouts.py
│   │       ├── exercises.py
│   │       └── analytics.py
│   ├── requirements.txt
│   └── .env.example
├── frontend-react/         React + Vite SPA
│   ├── src/
│   │   ├── pages/          Dashboard, Calendar, Analytics, …
│   │   ├── components/     Layout, Sidebar
│   │   ├── services/       Axios API clients
│   │   └── context/        AuthContext
│   └── .env.example
└── render.yaml             Render Blueprint (IaC)
```

---

## Code quality

```bash
# Backend — run after every .py edit
cd backend && ruff check . && ruff check --fix .

# Frontend — run after every .ts/.tsx edit
cd frontend-react && npx prettier --write src/
```

---

## License

MIT
