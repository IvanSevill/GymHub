# Feature: AI Chatbot con MCP Server

**Tipo:** Feature  
**Prioridad:** Media  
**Estado:** Especificación completa — pendiente de implementación  
**Versión objetivo:** 1.1.1

---

## Concepto

Un asistente de IA que permite al usuario preguntar en lenguaje natural sobre sus datos de entrenamiento y salud, y también ejecutar acciones como crear workouts o sincronizar cardios de Fitbit. La IA accede a los datos a través de un **MCP Server** (Model Context Protocol) que expone 13 herramientas.

**Ejemplos de uso:**

```
Usuario: "¿Cuándo fue mi mejor marca en press banca?"
IA: [llama a get_exercise_prs("press banca")]
    → "Tu récord en press banca fue de 100kg el 15 de marzo de 2025."

Usuario: "¿He entrenado más o menos que el mes pasado?"
IA: [llama a get_analytics_summary(days=60)]
    → "Este mes has hecho 14 entrenamientos vs 11 el mes pasado. ↑27%"

Usuario: "Sube los cardios pendientes de Fitbit"
IA: [llama a sync_pending_cardio()]
    → "He subido 3 actividades de Fitbit: 2 runs y 1 ciclismo."

Usuario: "¿Tengo algún desequilibrio muscular?"
IA: [llama a get_muscle_balance(days=90)]
    → "En los últimos 3 meses has entrenado mucho pecho (38%) pero poco espalda (12%)."
```

---

## Arquitectura General

```
frontend-react (port 5173)
    ↓  POST /chat  (SSE streaming)
ai-server/ (port 8001)
    ↓  Anthropic SDK + MCPServerStdio (subprocess por request)
gymhub-mcp/ (subprocess stdio)
    ↓  Lecturas → DB directamente (SQLAlchemy)
    ↓  Escrituras → HTTP al backend (port 8000)
backend/ (port 8000, SIN CAMBIOS)
GymHub Database (SQLite dev / PostgreSQL prod)
```

**Principios clave:**
- `backend/` no se toca — cero cambios al servidor principal
- El MCP server es un proceso separado, no un módulo del backend
- Las escrituras van siempre por la API del backend para respetar toda la lógica de negocio (Calendar sync, validaciones, etc.)
- Las lecturas van directo a la DB para evitar latencia extra
- El JWT del usuario fluye: frontend → ai-server → MCP subprocess (env var) → llamadas al backend

---

## Directorio 1: `gymhub-mcp/`

MCP server standalone usando la librería oficial [`mcp`](https://pypi.org/project/mcp/) de Anthropic.

### Estructura de archivos

```
gymhub-mcp/
├── server.py          # Punto de entrada MCP: define tools + dispatcher
├── database.py        # SQLAlchemy engine + get_db (sólo lectura)
├── models.py          # Modelos ORM (copia de backend, sin escrituras)
├── read_tools.py      # 9 funciones de consulta DB
├── write_tools.py     # 4 funciones de acción (httpx → backend API)
├── requirements.txt
└── .env               # DATABASE_URL (misma DB que el backend)
```

### `requirements.txt`

```
mcp>=1.0.0
SQLAlchemy==2.0.28
psycopg2-binary==2.9.9
httpx>=0.27.0
python-dotenv==1.0.1
ruff==0.3.4
```

### Variables de entorno (recibidas por subprocess, no de .env)

| Variable | Descripción |
|----------|-------------|
| `GYMHUB_USER_ID` | ID del usuario autenticado (pasado por ai-server) |
| `GYMHUB_TOKEN` | JWT Bearer token (pasado por ai-server, para llamadas al backend) |
| `DATABASE_URL` | Cadena de conexión a la DB |

### `database.py`

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

Base = declarative_base()

def get_engine():
    url = os.environ["DATABASE_URL"]
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)

engine = get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### `models.py`

Copia exacta de `backend/app/models.py` de estos modelos (sin relaciones que no se usan):
- `User` — id, name, email
- `Workout` — id, user_id, title, start_time, end_time
- `ExerciseSet` — id, workout_id, exercise_id, value, measurement, is_completed
- `Exercise` — id, name, muscle_id
- `Muscle` — id, name
- `FitbitData` — id, workout_id, calories, heart_rate_avg, duration_ms, distance_km, elevation_gain_m, activity_name, azm_fat_burn, azm_cardio, azm_peak, has_gps
- `DailyHealth` — id, user_id, date, steps, floors, resting_heart_rate, calories_out, minutes_sedentary, minutes_lightly_active, minutes_fairly_active, minutes_very_active, distance_km
- `SleepLog` — id, user_id, date, start_time, end_time, duration_ms, efficiency, minutes_asleep, minutes_awake, minutes_to_fall_asleep, time_in_bed, minutes_deep, minutes_light, minutes_rem, minutes_wake, is_main_sleep

---

## Herramientas MCP — Inventario Completo

### Herramientas de Lectura (9) — consultan la DB directamente

---

#### `get_workouts`

**Descripción:** Lista los entrenamientos recientes del usuario con todos sus ejercicios, series y datos de Fitbit.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 30, "description": "Días hacia atrás" },
  "limit": { "type": "integer", "default": 20, "description": "Máximo de workouts" }
}
```

**Output:**
```json
{
  "workouts": [
    {
      "id": "uuid",
      "title": "Pecho y Tríceps",
      "date": "2025-03-15 18:30",
      "duration_min": 65,
      "exercises": {
        "Press Banca": ["100kg", "90kg", "80kg"],
        "Fondos": ["15 rep", "12 rep"]
      },
      "fitbit": {
        "calories": 420,
        "heart_rate_avg": 148,
        "azm_cardio": 22,
        "azm_peak": 8
      }
    }
  ],
  "total": 14
}
```

**Lógica:** JOIN Workout → ExerciseSet → Exercise + LEFT JOIN FitbitData. Filtrar por user_id + start_time >= cutoff. Ordenar por start_time DESC. Calcular duración desde FitbitData.duration_ms o (end_time - start_time).

---

#### `get_exercise_prs`

**Descripción:** Récords personales (máximos históricos) por ejercicio.

**Input schema:**
```json
{
  "exercise_name": { "type": "string", "description": "Filtro parcial por nombre (opcional)" }
}
```

**Output:**
```json
{
  "prs": [
    {
      "exercise": "Press Banca",
      "muscle": "pecho",
      "value": 100.0,
      "measurement": "kg",
      "date": "2025-03-15"
    }
  ]
}
```

**Lógica:** Reutilizar `_parse_exercise_value` de `backend/app/routers/analytics.py`. JOIN ExerciseSet → Exercise → Muscle → Workout. Filtrar user_id. Si `exercise_name`, añadir `ilike(f"%{exercise_name}%")`. Para cada ejercicio, quedarse con el máximo histórico.

---

#### `get_analytics_summary`

**Descripción:** Resumen de KPIs del periodo actual vs periodo anterior para tendencias.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 30, "description": "Días del periodo actual" }
}
```

**Output:**
```json
{
  "current": {
    "workout_count": 14,
    "total_volume_kg": 18540.5,
    "avg_duration_min": 62.3,
    "pr_count": 3
  },
  "previous": {
    "workout_count": 11,
    "total_volume_kg": 15200.0,
    "avg_duration_min": 58.0,
    "pr_count": 1
  },
  "period_days": 30
}
```

**Lógica:** Reutilizar exactamente `_compute_workout_count`, `_compute_volume`, `_compute_avg_duration`, `_compute_prs` de `backend/app/routers/analytics.py`.

---

#### `get_exercise_frequency`

**Descripción:** Ejercicios más realizados en un periodo, opcionalmente filtrados por grupo muscular.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 90 },
  "muscle_name": { "type": "string", "description": "Nombre del músculo para filtrar (opcional)" }
}
```

**Output:**
```json
{
  "exercises": [
    { "exercise": "Press Banca", "muscle": "pecho", "sessions": 18 },
    { "exercise": "Dominadas", "muscle": "espalda", "sessions": 15 }
  ]
}
```

**Lógica:** Reutilizar el patrón de `get_exercise_frequency` de `backend/app/routers/analytics.py`. COUNT de apariciones en sesiones (no sets).

---

#### `get_exercise_history`

**Descripción:** Serie temporal de todos los sets de un ejercicio específico.

**Input schema:**
```json
{
  "exercise_name": { "type": "string", "description": "Nombre del ejercicio (búsqueda parcial)" },
  "days": { "type": "integer", "default": 90 }
}
```

**Output:**
```json
{
  "exercise": "Press Banca",
  "history": [
    {
      "date": "2025-03-15",
      "sets": [
        { "value": "100", "measurement": "kg" },
        { "value": "90", "measurement": "kg" }
      ]
    }
  ]
}
```

**Lógica:** Reutilizar el patrón de `get_exercise_history` de `backend/app/routers/analytics.py`. Lookup de ejercicio por `ilike`. Agrupar sets por fecha de workout.

---

#### `get_weight_progress`

**Descripción:** Tendencia del peso máximo diario para un ejercicio concreto.

**Input schema:**
```json
{
  "exercise_name": { "type": "string", "description": "Nombre del ejercicio" },
  "days": { "type": "integer", "default": 60 }
}
```

**Output:**
```json
{
  "exercise": "Press Banca",
  "unit": "kg",
  "data": [
    { "date": "2025-01-10", "max_value": 85.0 },
    { "date": "2025-01-17", "max_value": 87.5 },
    { "date": "2025-03-15", "max_value": 100.0 }
  ]
}
```

**Lógica:** Reutilizar exactamente el patrón de `get_weight_progress` de `backend/app/routers/analytics.py`. Lookup de ejercicio por `ilike`.

---

#### `get_daily_health`

**Descripción:** Datos diarios de actividad Fitbit (pasos, calorías, minutos activos, etc.).

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 14 }
}
```

**Output:**
```json
{
  "data": [
    {
      "date": "2025-03-15",
      "steps": 8432,
      "floors": 12,
      "resting_heart_rate": 56,
      "calories_out": 2340,
      "distance_km": 6.2,
      "minutes_sedentary": 480,
      "minutes_lightly_active": 180,
      "minutes_fairly_active": 35,
      "minutes_very_active": 42
    }
  ],
  "avg_steps": 7890,
  "avg_calories": 2280
}
```

**Lógica:** Query `DailyHealth` filtrado por user_id + date >= cutoff. Calcular promedios.

---

#### `get_sleep_logs`

**Descripción:** Registros de sueño de Fitbit: duración, eficiencia y etapas.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 14 }
}
```

**Output:**
```json
{
  "logs": [
    {
      "date": "2025-03-15",
      "duration_h": 7.5,
      "efficiency": 91,
      "minutes_deep": 92,
      "minutes_rem": 108,
      "minutes_light": 175,
      "minutes_awake": 22
    }
  ],
  "avg_duration_h": 7.2,
  "avg_efficiency": 88
}
```

**Lógica:** Query `SleepLog` filtrado por user_id + is_main_sleep=True + date >= cutoff. Convertir duration_ms a horas.

---

#### `get_muscle_balance`

**Descripción:** Volumen de entrenamiento por grupo muscular por semana ISO.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 90 }
}
```

**Output:**
```json
{
  "balance": [
    { "week": "2025-W10", "muscle": "pecho",   "volume_kg": 1840.0 },
    { "week": "2025-W10", "muscle": "espalda",  "volume_kg": 620.0 }
  ],
  "totals_by_muscle": {
    "pecho":   8420.0,
    "espalda": 3100.0
  }
}
```

**Lógica:** Reutilizar el patrón de `get_muscle_balance` de `backend/app/routers/analytics.py`.

---

### Herramientas de Escritura (4) — llaman al backend vía httpx

> **Nota de autenticación:** Todas las write tools usan `os.environ["GYMHUB_TOKEN"]` como Bearer token en la cabecera `Authorization`.

---

#### `create_workout`

**Descripción:** Crea un nuevo workout con ejercicios y series. La IA primero consulta los ejercicios disponibles en la DB para resolver nombres a IDs.

**Input schema:**
```json
{
  "title": { "type": "string", "description": "Nombre del workout" },
  "start_time": { "type": "string", "description": "ISO 8601, e.g. '2025-03-15T18:30:00'" },
  "end_time": { "type": "string", "description": "ISO 8601" },
  "exercises": {
    "type": "array",
    "items": {
      "exercise_name": "string",
      "sets": [{ "value": "string", "measurement": "string" }]
    }
  }
}
```

**Lógica:**
1. Para cada `exercise_name` en el input, buscar en la DB local el `exercise_id` por `ilike`
2. Construir el body de `POST /workouts` con los exercise_sets resueltos
3. Llamar `POST {BACKEND_URL}/workouts` con Bearer token
4. Devolver confirmación con el workout creado

**Output:**
```json
{ "success": true, "workout_id": "uuid", "title": "Pecho y Tríceps", "sets_created": 6 }
```

---

#### `add_set_to_workout`

**Descripción:** Añade un set a un workout ya existente sin perder los sets actuales.

**Input schema:**
```json
{
  "workout_id": { "type": "string", "description": "ID del workout" },
  "exercise_name": { "type": "string", "description": "Nombre del ejercicio (búsqueda parcial)" },
  "value": { "type": "string", "description": "Valor del set, e.g. '80' o '80-70'" },
  "measurement": { "type": "string", "description": "'kg', 'rep', 's', 'min'" }
}
```

**Lógica:**
1. Leer el workout actual de la DB (todos sus exercise_sets con exercise_id)
2. Resolver `exercise_name` a `exercise_id` por `ilike`
3. Construir lista: todos los sets existentes + el nuevo set
4. Llamar `PUT {BACKEND_URL}/workouts/{workout_id}` con Bearer token
5. El backend hace auto-sync a Calendar y Fitbit automáticamente

**Output:**
```json
{ "success": true, "exercise": "Press Banca", "set_added": "80kg", "total_sets": 7 }
```

---

#### `sync_pending_cardio`

**Descripción:** Sube las actividades cardio de Fitbit que aún no tienen workout en GymHub.

**Input schema:**
```json
{
  "days": { "type": "integer", "default": 30, "description": "Días hacia atrás a sincronizar" }
}
```

**Lógica:**
1. Llamar `POST {BACKEND_URL}/workouts/sync-fitbit-create-missing?days={days}` con Bearer token
2. El backend detecta actividades Fitbit sin workout correspondiente y las crea

**Output:**
```json
{ "success": true, "created": 3, "message": "3 actividades cardio subidas desde Fitbit." }
```

---

#### `sync_fitbit_to_workout`

**Descripción:** Asocia los datos de Fitbit (calorías, HR, zonas) a un workout específico.

**Input schema:**
```json
{
  "workout_id": { "type": "string", "description": "ID del workout a sincronizar" }
}
```

**Lógica:**
1. Llamar `POST {BACKEND_URL}/workouts/{workout_id}/sync-fitbit` con Bearer token
2. El backend busca la actividad Fitbit correspondiente por tiempo y la asocia

**Output:**
```json
{
  "success": true,
  "calories": 420,
  "heart_rate_avg": 148,
  "duration_min": 65
}
```

---

### `server.py` — Implementación completa

```python
import asyncio
import json
import os
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from sqlalchemy.orm import Session

import read_tools
import write_tools
from database import SessionLocal

load_dotenv()

app = Server("gymhub-mcp")
USER_ID = os.environ.get("GYMHUB_USER_ID", "")
TOKEN   = os.environ.get("GYMHUB_TOKEN", "")

ALL_TOOLS = [
    Tool(
        name="get_workouts",
        description="Lista los entrenamientos recientes del usuario con ejercicios, sets y datos Fitbit.",
        inputSchema={
            "type": "object",
            "properties": {
                "days":  {"type": "integer", "default": 30},
                "limit": {"type": "integer", "default": 20},
            },
        },
    ),
    Tool(
        name="get_exercise_prs",
        description="Récords personales (máximos históricos) por ejercicio. Filtra por nombre si se indica.",
        inputSchema={
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string"},
            },
        },
    ),
    Tool(
        name="get_analytics_summary",
        description="KPIs: nº entrenamientos, volumen total, duración media y PRs. Incluye periodo anterior para comparar tendencia.",
        inputSchema={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "default": 30},
            },
        },
    ),
    Tool(
        name="get_exercise_frequency",
        description="Ejercicios más realizados en un periodo. Opcional: filtrar por grupo muscular.",
        inputSchema={
            "type": "object",
            "properties": {
                "days":        {"type": "integer", "default": 90},
                "muscle_name": {"type": "string"},
            },
        },
    ),
    Tool(
        name="get_exercise_history",
        description="Serie temporal de todos los sets de un ejercicio concreto.",
        inputSchema={
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string"},
                "days":          {"type": "integer", "default": 90},
            },
            "required": ["exercise_name"],
        },
    ),
    Tool(
        name="get_weight_progress",
        description="Tendencia del peso máximo diario para un ejercicio. Útil para ver progresión.",
        inputSchema={
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string"},
                "days":          {"type": "integer", "default": 60},
            },
            "required": ["exercise_name"],
        },
    ),
    Tool(
        name="get_daily_health",
        description="Datos diarios de actividad Fitbit: pasos, calorías, minutos activos, FC en reposo, distancia.",
        inputSchema={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "default": 14},
            },
        },
    ),
    Tool(
        name="get_sleep_logs",
        description="Registros de sueño Fitbit: duración, eficiencia y etapas (deep, REM, light).",
        inputSchema={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "default": 14},
            },
        },
    ),
    Tool(
        name="get_muscle_balance",
        description="Volumen (kg) por grupo muscular por semana. Permite detectar desequilibrios.",
        inputSchema={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "default": 90},
            },
        },
    ),
    Tool(
        name="create_workout",
        description="Crea un nuevo workout con ejercicios y series en GymHub. Sincroniza automáticamente con Google Calendar.",
        inputSchema={
            "type": "object",
            "properties": {
                "title":      {"type": "string"},
                "start_time": {"type": "string", "description": "ISO 8601"},
                "end_time":   {"type": "string", "description": "ISO 8601"},
                "exercises": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "exercise_name": {"type": "string"},
                            "sets": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "value":       {"type": "string"},
                                        "measurement": {"type": "string"},
                                    },
                                    "required": ["value", "measurement"],
                                },
                            },
                        },
                        "required": ["exercise_name", "sets"],
                    },
                },
            },
            "required": ["title", "start_time", "end_time"],
        },
    ),
    Tool(
        name="add_set_to_workout",
        description="Añade un set a un workout existente sin modificar los demás.",
        inputSchema={
            "type": "object",
            "properties": {
                "workout_id":    {"type": "string"},
                "exercise_name": {"type": "string"},
                "value":         {"type": "string", "description": "e.g. '80' o '80-70'"},
                "measurement":   {"type": "string", "description": "'kg', 'rep', 's', 'min'"},
            },
            "required": ["workout_id", "exercise_name", "value", "measurement"],
        },
    ),
    Tool(
        name="sync_pending_cardio",
        description="Sube al historial las actividades cardio de Fitbit que aún no tienen workout en GymHub.",
        inputSchema={
            "type": "object",
            "properties": {
                "days": {"type": "integer", "default": 30},
            },
        },
    ),
    Tool(
        name="sync_fitbit_to_workout",
        description="Asocia los datos de Fitbit (calorías, FC, zonas AZM) a un workout específico por su ID.",
        inputSchema={
            "type": "object",
            "properties": {
                "workout_id": {"type": "string"},
            },
            "required": ["workout_id"],
        },
    ),
]

READ_DISPATCH = {
    "get_workouts":           read_tools.get_workouts,
    "get_exercise_prs":       read_tools.get_exercise_prs,
    "get_analytics_summary":  read_tools.get_analytics_summary,
    "get_exercise_frequency": read_tools.get_exercise_frequency,
    "get_exercise_history":   read_tools.get_exercise_history,
    "get_weight_progress":    read_tools.get_weight_progress,
    "get_daily_health":       read_tools.get_daily_health,
    "get_sleep_logs":         read_tools.get_sleep_logs,
    "get_muscle_balance":     read_tools.get_muscle_balance,
}

WRITE_DISPATCH = {
    "create_workout":         write_tools.create_workout,
    "add_set_to_workout":     write_tools.add_set_to_workout,
    "sync_pending_cardio":    write_tools.sync_pending_cardio,
    "sync_fitbit_to_workout": write_tools.sync_fitbit_to_workout,
}


@app.list_tools()
async def list_tools() -> list[Tool]:
    return ALL_TOOLS


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    db = SessionLocal()
    try:
        if name in READ_DISPATCH:
            result = READ_DISPATCH[name](arguments, USER_ID, db)
        elif name in WRITE_DISPATCH:
            result = await WRITE_DISPATCH[name](arguments, TOKEN)
        else:
            result = {"error": f"Unknown tool: {name}"}
    finally:
        db.close()
    return [TextContent(type="text", text=json.dumps(result, default=str))]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="gymhub-mcp",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=None,
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())
```

---

## Directorio 2: `ai-server/`

FastAPI mínimo que valida el JWT y orquesta el loop con Anthropic + MCP.

### Estructura de archivos

```
ai-server/
├── main.py            # FastAPI app + CORS
├── auth.py            # Decodificación JWT (mismo SECRET_KEY que backend)
├── chat.py            # POST /chat + generador SSE
├── requirements.txt
└── .env               # ANTHROPIC_API_KEY, DATABASE_URL (sólo para obtener user.name), SECRET_KEY, BACKEND_URL
```

### `requirements.txt`

```
fastapi==0.110.0
uvicorn==0.28.0
anthropic>=0.57.0
python-jose[cryptography]==3.3.0
python-dotenv==1.0.1
SQLAlchemy==2.0.28
psycopg2-binary==2.9.9
ruff==0.3.4
```

### Variables de entorno (`ai-server/.env`)

| Variable | Descripción |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic |
| `DATABASE_URL` | Misma DB que el backend (para resolver el nombre del usuario) |
| `SECRET_KEY` | Mismo secret JWT que el backend |
| `BACKEND_URL` | URL del backend principal, e.g. `http://localhost:8000` |
| `MCP_SERVER_PATH` | Ruta absoluta a `gymhub-mcp/server.py` |

### `auth.py`

```python
import os
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

class AuthUser:
    def __init__(self, user_id: str, name: str, token: str):
        self.id    = user_id
        self.name  = name
        self.token = token

async def get_current_user(token: str = Depends(oauth2_scheme)) -> AuthUser:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    # Resolver nombre desde la DB del backend
    from database import SessionLocal
    from models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return AuthUser(user_id=user.id, name=user.name or email, token=token)
    finally:
        db.close()
```

### `chat.py`

```python
import json
import os
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from anthropic import Anthropic
from anthropic.types.beta.mcp import MCPServerStdio
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import AuthUser, get_current_user

router = APIRouter()

MCP_SERVER_PATH = Path(os.getenv("MCP_SERVER_PATH", "../gymhub-mcp/server.py")).resolve()
MODEL = "claude-sonnet-4-6"
MAX_MESSAGES = 20
MAX_TOKENS = 4096


class ChatMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _build_system_prompt(user_name: str) -> list[dict]:
    today = datetime.utcnow().strftime("%A, %B %d, %Y")
    text = f"""Eres GymHub AI, el asistente personal de fitness de {user_name}. Hoy es {today}.

Tienes acceso completo al historial de entrenamientos, récords personales, datos de sueño y salud diaria de {user_name}. Usa las herramientas disponibles para obtener datos reales antes de responder.

Reglas:
- Responde siempre en el idioma en que el usuario escriba.
- Sé conciso y basa tus respuestas en datos reales.
- Cuando cites datos, incluye la fecha o el periodo.
- Si el usuario pide crear o modificar datos, confirma antes de ejecutar si la acción es destructiva.
- Si no tienes datos suficientes, dilo claramente."""
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def _trim_messages(messages: list[ChatMessage]) -> list[dict]:
    trimmed = messages[-MAX_MESSAGES:] if len(messages) > MAX_MESSAGES else messages
    return [{"role": m.role, "content": m.content} for m in trimmed]


async def _generate(
    messages: list[ChatMessage],
    user: AuthUser,
) -> AsyncIterator[str]:
    client = Anthropic()
    system = _build_system_prompt(user.name)
    api_messages = _trim_messages(messages)

    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            messages=api_messages,
            betas=["mcp-client-2025-04-04"],
            mcp_servers=[
                MCPServerStdio(
                    command="python",
                    args=[str(MCP_SERVER_PATH)],
                    env={
                        **dict(os.environ),
                        "GYMHUB_USER_ID": user.id,
                        "GYMHUB_TOKEN":   user.token,
                        "DATABASE_URL":   os.getenv("DATABASE_URL", ""),
                        "BACKEND_URL":    os.getenv("BACKEND_URL", "http://localhost:8000"),
                    },
                )
            ],
        ) as stream:
            for event in stream:
                event_type = getattr(event, "type", None)

                if event_type == "content_block_start":
                    block = getattr(event, "content_block", None)
                    if block and getattr(block, "type", None) == "tool_use":
                        yield f'data: {json.dumps({"type": "thinking"})}\n\n'

                elif event_type == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    if delta and getattr(delta, "type", None) == "text_delta":
                        yield f'data: {json.dumps({"type": "text", "text": delta.text})}\n\n'

    except Exception as exc:
        yield f'data: {json.dumps({"type": "error", "message": str(exc)})}\n\n'

    yield 'data: {"type": "done"}\n\n'


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: AuthUser = Depends(get_current_user),
):
    if not os.getenv("ANTHROPIC_API_KEY"):
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="AI assistant not configured")

    return StreamingResponse(
        _generate(request.messages, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

### `main.py`

```python
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from chat import router as chat_router

app = FastAPI(title="GymHub AI Server")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = list({"http://localhost:5173", "http://127.0.0.1:5173", FRONTEND_URL})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "gymhub-ai"}
```

---

## Frontend

### Nuevo: `frontend-react/src/services/chat.ts`

```typescript
const AI_URL = import.meta.env.VITE_AI_URL || "http://localhost:8001";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ChatEventType = "text" | "thinking" | "done" | "error";

export interface ChatEvent {
  type: ChatEventType;
  text?: string;
  message?: string;
}

export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<ChatEvent> {
  const token = localStorage.getItem("token");

  const response = await fetch(`${AI_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    yield { type: "error", message: `HTTP ${response.status}` };
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event: ChatEvent = JSON.parse(line.slice(6));
        yield event;
        if (event.type === "done" || event.type === "error") return;
      } catch {
        // ignore malformed lines
      }
    }
  }
}
```

### Nuevo: `frontend-react/src/components/chat/ChatPanel.tsx`

Panel deslizante desde la derecha (escritorio) o desde abajo (móvil).

**Props:** `open: boolean`, `onClose: () => void`

**Estado interno:**
```typescript
const [messages, setMessages]         = useState<ChatMessage[]>([]);
const [input, setInput]               = useState("");
const [streaming, setStreaming]       = useState(false);
const [thinking, setThinking]         = useState(false);
const [currentResponse, setCurrentResponse] = useState("");
```

**Flujo de envío:**
1. Append mensaje de usuario a `messages`
2. Limpiar `input`, activar `streaming`, `currentResponse = ""`
3. Llamar `streamChat([...messages, userMessage])`
4. Por cada evento:
   - `thinking` → activar `thinking = true`
   - `text` → `setCurrentResponse(prev => prev + event.text!)`, `thinking = false`
   - `done` → append `{role: "assistant", content: currentResponse}` a `messages`, desactivar `streaming`
   - `error` → mostrar error, desactivar `streaming`
5. Auto-scroll al bottom tras cada update

**Prompts de ejemplo en empty state:**
- "¿Cuántos entrenamientos hice este mes?"
- "¿Cuál es mi récord en press banca?"
- "Sube los cardios pendientes de Fitbit"
- "¿Tengo algún desequilibrio muscular?"

**Estilos:**
- Overlay: `fixed inset-0 z-50 flex` (desktop: `justify-end`, mobile: `items-end`)
- Panel: `glass-card w-full max-w-md h-[85vh] md:h-screen flex flex-col`
- Burbujas usuario: `bg-primary/20 ml-auto rounded-2xl rounded-tr-sm`
- Burbujas IA: `bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm`
- Cursor streaming: carácter `▋` animado con opacity pulse
- Thinking dots: 3 divs con `animate-bounce` staggered

### Modificación: `frontend-react/src/components/Layout.tsx`

```tsx
// Añadir al inicio de Layout:
const [chatOpen, setChatOpen] = useState(false);

// Añadir antes de </div> final (después de <OnboardingTutorial />):
<button
  onClick={() => setChatOpen(true)}
  className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-primary rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform md:bottom-8 md:right-8"
  aria-label="Abrir asistente IA"
>
  <MessageCircle size={20} />
</button>
<ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
```

Imports adicionales: `MessageCircle` de `lucide-react`, `ChatPanel` de `./chat/ChatPanel`.

---

## Variables de Entorno

### Backend `backend/.env` — sin cambios

### `ai-server/.env` (nuevo)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key de Anthropic (requerida) | `sk-ant-api03-...` |
| `DATABASE_URL` | Misma DB que el backend | `sqlite:///./gymhub.db` |
| `SECRET_KEY` | Mismo JWT secret que el backend | `supersecretkey` |
| `BACKEND_URL` | URL del backend | `http://localhost:8000` |
| `MCP_SERVER_PATH` | Ruta al script MCP (opcional, auto-detectado) | `../gymhub-mcp/server.py` |
| `FRONTEND_URL` | Para CORS en producción | `https://gymhub.app` |

### `gymhub-mcp/.env` (nuevo)

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Misma DB que el backend |

> `GYMHUB_USER_ID`, `GYMHUB_TOKEN`, `BACKEND_URL` los inyecta `ai-server` en tiempo de ejecución como env vars del subprocess — no van en `.env`.

### Frontend `frontend-react/.env`

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_AI_URL` | URL del ai-server | `http://localhost:8001` |

---

## Resumen de Archivos

| Acción | Ruta |
|--------|------|
| Crear (directorio nuevo) | `gymhub-mcp/server.py` |
| Crear | `gymhub-mcp/database.py` |
| Crear | `gymhub-mcp/models.py` |
| Crear | `gymhub-mcp/read_tools.py` |
| Crear | `gymhub-mcp/write_tools.py` |
| Crear | `gymhub-mcp/requirements.txt` |
| Crear (directorio nuevo) | `ai-server/main.py` |
| Crear | `ai-server/auth.py` |
| Crear | `ai-server/chat.py` |
| Crear | `ai-server/requirements.txt` |
| Modificar | `docs/environment.md` |
| Crear | `frontend-react/src/services/chat.ts` |
| Crear | `frontend-react/src/components/chat/ChatPanel.tsx` |
| Modificar | `frontend-react/src/components/Layout.tsx` |

**`backend/` sin ningún cambio.**

---

## Cómo levantar en desarrollo

```powershell
# Terminal 1 — Backend (sin cambios)
cd backend
uvicorn app.main:app --reload

# Terminal 2 — AI Server
cd ai-server
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Terminal 3 — Frontend
cd frontend-react
npm run dev
```

> El MCP server (`gymhub-mcp/`) no se levanta manualmente — lo spawnea `ai-server` automáticamente como subprocess cada vez que hay un request al `/chat`.

---

## Verificación

1. Configurar `ai-server/.env` con `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SECRET_KEY`, `BACKEND_URL`
2. Configurar `frontend-react/.env` con `VITE_AI_URL=http://localhost:8001`
3. Levantar backend + ai-server + frontend
4. **Test lectura:** "¿Cuántos entrenamientos hice este mes?" → debe llamar `get_analytics_summary` y responder con datos reales
5. **Test PR:** "¿Cuál es mi récord en press banca?" → debe llamar `get_exercise_prs` y citar la fecha
6. **Test sueño:** "¿Cómo dormí esta semana?" → debe llamar `get_sleep_logs`
7. **Test balance:** "¿Qué músculos tengo descuidados?" → debe llamar `get_muscle_balance`
8. **Test escritura:** "Sube los cardios pendientes de Fitbit" → debe llamar `sync_pending_cardio` y confirmar cuántos se subieron
9. `cd ai-server && ruff check .` → sin errores
10. `cd gymhub-mcp && ruff check .` → sin errores
11. `cd frontend-react && npx tsc --noEmit` → sin errores
