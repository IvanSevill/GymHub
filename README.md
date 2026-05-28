<div align="center">

# GymHub

**Plataforma personal de fitness — tracking, análisis y planificación de entrenamientos**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-prod-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

</div>

---

## ¿Qué es GymHub?

GymHub es una aplicación web para atletas que quieren entender su progreso, no solo registrarlo. Conecta los datos de tus entrenamientos con tu actividad de Fitbit y tu Google Calendar para darte una visión analítica completa de tu rendimiento.

### Funcionalidades principales

| Módulo | Qué hace |
|---|---|
| **Entrenamientos** | Registra ejercicios, series, pesos y repeticiones. Historial completo. |
| **Análisis de rendimiento** | KPIs con comparación de períodos, tendencias de volumen, frecuencia semanal, progresión de cargas por ejercicio. |
| **Salud (Fitbit)** | Sincronización automática de actividad, sueño, frecuencia cardíaca y zonas activas. |
| **Calendario** | Integración bidireccional con Google Calendar. Visualiza y planifica entrenamientos. |
| **Récords** | Histórico de máximos por ejercicio y detección automática de PRs. |

---

## Stack tecnológico

```
┌─────────────────────────────────────────────────────┐
│  Frontend                                           │
│  React 19 · Vite · TypeScript · Tailwind CSS v4    │
│  Recharts · Framer Motion · TanStack Query          │
├─────────────────────────────────────────────────────┤
│  Backend                                            │
│  FastAPI · SQLAlchemy · Pydantic · Ruff             │
├─────────────────────────────────────────────────────┤
│  Base de datos                                      │
│  PostgreSQL (producción) · SQLite (local)           │
├─────────────────────────────────────────────────────┤
│  Auth & Integraciones                               │
│  Google OAuth 2.0 · JWT · Fitbit API · Calendar API │
├─────────────────────────────────────────────────────┤
│  Deploy                                             │
│  Render (backend + frontend + PostgreSQL)           │
└─────────────────────────────────────────────────────┘
```

---

## Puesta en marcha local

### Requisitos

- Python 3.11+
- Node 20+
- Credenciales de Google OAuth ([Google Cloud Console](https://console.cloud.google.com/))
- Credenciales de Fitbit ([Fitbit Developer](https://dev.fitbit.com/))

### 1. Backend

```bash
cd backend
cp .env.example .env        # rellena las variables (ver tabla abajo)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# API disponible en http://localhost:8000
# Docs interactivos en http://localhost:8000/docs
```

### 2. Frontend

```bash
cd frontend-react
cp .env.example .env        # rellena VITE_API_URL y VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
# App disponible en http://localhost:5173
```

---

## Variables de entorno

### Backend — `backend/.env`

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión SQLAlchemy. Por defecto: `sqlite:///./gymhub.db` |
| `SECRET_KEY` | Clave JWT. En producción usa un hex aleatorio de 32 bytes |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Client secret de Google OAuth |
| `FITBIT_CLIENT_ID` | App ID de Fitbit OAuth |
| `FITBIT_CLIENT_SECRET` | App secret de Fitbit OAuth |
| `FRONTEND_URL` | Origen del frontend para CORS (ej. `http://localhost:5173`) |
| `ROOT_EMAILS` | Emails de administrador separados por coma |

### Frontend — `frontend-react/.env`

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL base del backend (ej. `http://localhost:8000`) |
| `VITE_GOOGLE_CLIENT_ID` | Mismo Client ID de Google OAuth que el backend |

---

## Estructura del proyecto

```
GymHub/
├── backend/
│   ├── app/
│   │   ├── main.py              # Entrada FastAPI, CORS, routers
│   │   ├── models.py            # ORM: User, Workout, Exercise, ExerciseSet, FitbitData…
│   │   ├── schemas.py           # Schemas Pydantic
│   │   ├── auth.py              # JWT + Google OAuth
│   │   ├── database.py          # Engine SQLAlchemy
│   │   ├── fitbit_utils.py      # Sincronización Fitbit
│   │   ├── calendar_utils.py    # Integración Google Calendar
│   │   └── routers/
│   │       ├── workouts.py
│   │       ├── exercises.py
│   │       ├── analytics.py     # KPIs, volumen, frecuencia, progresión
│   │       ├── fitbit_sync.py
│   │       ├── fitbit_health.py
│   │       └── auth_routes.py
│   ├── requirements.txt
│   └── .env.example
│
├── frontend-react/
│   ├── src/
│   │   ├── pages/               # Analytics, Dashboard, Calendar, Workouts…
│   │   ├── components/
│   │   │   ├── analytics/       # KPICards, FrequencyAnalysisCard, VolumeTrendChart…
│   │   │   ├── calendar/        # CalendarGrid, RouteMap, modals…
│   │   │   ├── health/          # ActivityCharts, SleepCharts, HealthKpiCards
│   │   │   └── ui/              # PeriodSelector, Skeleton, ToastContainer
│   │   ├── services/            # Clientes Axios por dominio
│   │   └── context/             # AuthContext, ToastContext
│   └── .env.example
│
├── docs/                        # Guías y principios de diseño
│   ├── git-workflow.md
│   └── data-analysis-design-principles.md
│
├── render.yaml                  # Blueprint de deploy en Render
└── CLAUDE.md                    # Guía para Claude Code
```

---

## Deploy en Render

El repositorio incluye un `render.yaml` (Blueprint) listo para usar:

1. Sube el repo a GitHub.
2. En [Render](https://dashboard.render.com) → **New → Blueprint** → apunta al repo.
3. Render creará automáticamente:
   - `gymhub-backend` — servicio Python (FastAPI)
   - `gymhub-frontend` — sitio estático (React/Vite)
   - `gymhub-db` — base de datos PostgreSQL
4. Añade los secretos marcados como `sync: false` en el dashboard de Render:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `VITE_GOOGLE_CLIENT_ID`, `ROOT_EMAILS`

> **Google OAuth:** Añade la URL del backend a *Authorized redirect URIs* y la del frontend a *Authorized JavaScript origins* en Google Cloud Console.

---

## Desarrollo

### Calidad de código

```bash
# Tras cada edición de .py
cd backend && ruff check . && ruff check --fix .

# Tras cada edición de .ts/.tsx
cd frontend-react && npx prettier --write <archivo> && npx tsc --noEmit
```

### Flujo de trabajo con Git

```
main        ← producción (solo recibe releases desde develop)
  └── develop   ← integración (acumula features)
        └── feat/<nombre>   ← una rama por feature
```

Las features se trabajan en ramas `feat/`, se abren como PR a `develop` y se mergean con `--no-ff`. El detalle completo está en [`docs/git-workflow.md`](docs/git-workflow.md).

---

## Licencia

MIT
