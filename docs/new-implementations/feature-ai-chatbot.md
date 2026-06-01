# Feature: MCP Server + Chatbot IA de GymHub

**Tipo:** Feature  
**Prioridad:** Baja (alta complejidad)  
**Estado:** Pendiente — implementar cuando el resto del backlog esté limpio

## Concepto

Un MCP (Model Context Protocol) server propio de GymHub que expone los datos del usuario como herramientas para un modelo de IA (Claude). El usuario puede chatear con la IA desde la app y preguntar cosas sobre sus entrenamientos.

## Arquitectura

```
Frontend (ChatPanel.tsx)
    ↕ WebSocket o SSE
Backend (POST /chat)
    ↕ Claude API (claude-sonnet-4-x con tool use)
    ↕ GymHub MCP Tools
Backend data (workouts, analytics, PRs, Fitbit)
```

## MCP Tools a exponer

```python
# Herramientas que el modelo puede invocar
get_recent_workouts(days: int = 30) → List[Workout]
get_exercise_prs(exercise_name: str = None) → List[MaxLift]
get_analytics_summary(days: int = 30) → AnalyticsSummary
get_fitbit_data(days: int = 7) → List[FitbitData]
get_exercise_history(exercise_id: str, days: int = 90) → List[ExerciseSet]
```

## Frontend

- **FAB** (Floating Action Button) en `Layout.tsx` — icono de chat
- **ChatPanel.tsx** — drawer lateral o modal de chat estilo WhatsApp/Claude
- Streaming de respuesta (SSE o WebSocket para ver la respuesta en tiempo real)
- Historial de conversación en memoria de sesión (no persistente)

## Backend

- Nuevo router `backend/app/routers/chat.py`
- Endpoint `POST /chat` con streaming
- Usa `anthropic` SDK con `tool_use` y las tools del MCP

## Ejemplo de uso

```
Usuario: "¿Cuándo fue mi mejor marca en press banca?"
IA: [llama a get_exercise_prs("press banca")]
    → "Tu récord en press banca fue de 100kg el 15 de marzo de 2025."

Usuario: "¿He entrenado más o menos que el mes pasado?"
IA: [llama a get_analytics_summary(days=60)]
    → "Este mes has hecho 14 entrenamientos vs 11 el mes pasado. ↑27%"
```

## Dependencias

- `anthropic` SDK en requirements.txt
- `ANTHROPIC_API_KEY` en `.env`
- Diseño del sistema de prompt con contexto del usuario

## Notas de implementación

- Usar `claude-sonnet-4-6` como modelo (buen balance coste/capacidad para tool use)
- Implementar prompt caching para el system prompt con el contexto del usuario
- Límite de tokens de contexto de conversación para evitar costes excesivos
- El servidor MCP puede ser interno (en el mismo proceso FastAPI) o un proceso separado
