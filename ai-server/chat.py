import asyncio
import json
import os
from datetime import date, datetime
from typing import AsyncIterator

import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import AuthUser, get_current_user
from tool_runner import execute_tool

router = APIRouter()

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
MAX_MESSAGES = 20
MAX_DAILY_QUERIES = 5

# In-memory daily usage counter: {(user_id, "YYYY-MM-DD"): count}
_daily_usage: dict[tuple[str, str], int] = {}

GEMINI_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "get_workouts",
                "description": "Lista los entrenamientos recientes del usuario con ejercicios, series y datos de Fitbit.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 30)"},
                        "limit": {"type": "integer", "description": "Máximo de workouts (default: 20)"},
                    },
                },
            },
            {
                "name": "get_exercise_prs",
                "description": "Récords personales (máximos históricos) por ejercicio. Filtra por nombre si se indica.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exercise_name": {"type": "string", "description": "Nombre parcial del ejercicio (opcional)"},
                    },
                },
            },
            {
                "name": "get_analytics_summary",
                "description": "KPIs del periodo: entrenamientos, volumen kg, duración media y PRs. Incluye periodo anterior para comparar.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días del periodo actual (default: 30)"},
                    },
                },
            },
            {
                "name": "get_exercise_frequency",
                "description": "Ejercicios más realizados en un periodo, con número de sesiones por ejercicio.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 90)"},
                        "muscle_name": {"type": "string", "description": "Filtrar por grupo muscular (opcional)"},
                    },
                },
            },
            {
                "name": "get_exercise_history",
                "description": "Serie temporal de todos los sets de un ejercicio concreto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exercise_name": {"type": "string", "description": "Nombre del ejercicio"},
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 90)"},
                    },
                    "required": ["exercise_name"],
                },
            },
            {
                "name": "get_weight_progress",
                "description": "Tendencia del peso máximo diario para un ejercicio. Útil para ver progresión.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exercise_name": {"type": "string", "description": "Nombre del ejercicio"},
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 60)"},
                    },
                    "required": ["exercise_name"],
                },
            },
            {
                "name": "get_daily_health",
                "description": "Datos diarios de actividad Fitbit: pasos, calorías, minutos activos, FC en reposo.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 14)"},
                    },
                },
            },
            {
                "name": "get_sleep_logs",
                "description": "Registros de sueño Fitbit: duración total, eficiencia y fases (deep, REM, light).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 14)"},
                    },
                },
            },
            {
                "name": "get_muscle_balance",
                "description": "Volumen de entrenamiento (kg) por grupo muscular por semana. Detecta desequilibrios musculares.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 90)"},
                    },
                },
            },
            {
                "name": "create_workout",
                "description": "Crea un nuevo workout en GymHub con ejercicios y series. Sincroniza con Google Calendar automáticamente.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Nombre del workout"},
                        "start_time": {"type": "string", "description": "Inicio en ISO 8601 (ej: 2025-03-15T18:30:00)"},
                        "end_time": {"type": "string", "description": "Fin en ISO 8601"},
                        "exercises": {
                            "type": "array",
                            "description": "Ejercicios con sus series",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "exercise_name": {"type": "string"},
                                    "sets": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "value": {"type": "string"},
                                                "measurement": {"type": "string"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    "required": ["title", "start_time", "end_time"],
                },
            },
            {
                "name": "add_set_to_workout",
                "description": "Añade un set a un workout existente sin modificar los demás sets.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "workout_id": {"type": "string"},
                        "exercise_name": {"type": "string"},
                        "value": {"type": "string", "description": "Valor (ej: '80' o '80-70')"},
                        "measurement": {"type": "string", "description": "Unidad: kg, rep, s, min"},
                    },
                    "required": ["workout_id", "exercise_name", "value", "measurement"],
                },
            },
            {
                "name": "sync_pending_cardio",
                "description": "Sube al historial las actividades cardio de Fitbit que aún no tienen workout en GymHub.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "description": "Días hacia atrás (default: 30)"},
                    },
                },
            },
            {
                "name": "sync_fitbit_to_workout",
                "description": "Asocia datos de Fitbit (calorías, FC, zonas AZM) a un workout específico.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "workout_id": {"type": "string"},
                    },
                    "required": ["workout_id"],
                },
            },
        ]
    }
]


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _system_prompt(name: str) -> str:
    today = datetime.utcnow().strftime("%A, %d de %B de %Y")
    return (
        f"Eres GymHub AI, el asistente personal de fitness de {name}. Hoy es {today}.\n\n"
        "Tienes acceso a su historial de entrenamientos, récords, sueño y salud. "
        "Usa las funciones disponibles para dar respuestas basadas en datos reales.\n\n"
        "Reglas:\n"
        "- Responde en el idioma del usuario (español por defecto).\n"
        "- Cita fechas y periodos concretos al dar datos.\n"
        "- Sé conciso y directo.\n"
        "- Si el usuario pide crear o modificar datos, confirma antes si hay ambigüedad.\n"
        "- Si no hay datos disponibles, dilo claramente."
    )


def _check_rate_limit(user_id: str, is_root: bool) -> bool:
    if is_root:
        return True
    key = (user_id, str(date.today()))
    return _daily_usage.get(key, 0) < MAX_DAILY_QUERIES


def _record_usage(user_id: str, is_root: bool) -> None:
    if is_root:
        return
    key = (user_id, str(date.today()))
    _daily_usage[key] = _daily_usage.get(key, 0) + 1


def _remaining_queries(user_id: str, is_root: bool) -> int:
    if is_root:
        return 999
    key = (user_id, str(date.today()))
    return max(0, MAX_DAILY_QUERIES - _daily_usage.get(key, 0))


def _build_contents(messages: list[ChatMessage]) -> list[dict]:
    msgs = messages[-MAX_MESSAGES:] if len(messages) > MAX_MESSAGES else messages
    contents = []
    for m in msgs:
        role = "user" if m.role == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m.content}]})
    return contents


async def _generate(messages: list[ChatMessage], user: AuthUser) -> AsyncIterator[str]:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=_system_prompt(user.name),
        tools=GEMINI_TOOLS,
        generation_config=genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=2048,
        ),
    )

    contents = _build_contents(messages[:-1])  # history without last message
    last_msg = messages[-1].content

    # Add final user message
    contents.append({"role": "user", "parts": [{"text": last_msg}]})

    try:
        max_iterations = 6  # safety cap on tool-use loops

        for _ in range(max_iterations):
            response = await asyncio.to_thread(model.generate_content, contents)

            if not response.candidates:
                yield f'data: {json.dumps({"type": "error", "message": "Sin respuesta del modelo."})}\n\n'
                break

            candidate_content = response.candidates[0].content
            contents.append(candidate_content)

            fn_parts = [
                p for p in candidate_content.parts
                if hasattr(p, "function_call") and p.function_call and p.function_call.name
            ]

            if fn_parts:
                yield 'data: {"type":"thinking"}\n\n'

                fn_responses = []
                for part in fn_parts:
                    fn_name = part.function_call.name
                    fn_args = dict(part.function_call.args)
                    result = await execute_tool(fn_name, fn_args, user.id, user.token)
                    fn_responses.append(
                        genai.protos.Part(
                            function_response=genai.protos.FunctionResponse(
                                name=fn_name,
                                response={"result": json.dumps(result, default=str)},
                            )
                        )
                    )

                contents.append({"role": "user", "parts": fn_responses})

            else:
                # Final text response — stream word by word for smooth UX
                text = getattr(response, "text", "") or ""
                words = text.split(" ")
                for i, word in enumerate(words):
                    chunk = word + (" " if i < len(words) - 1 else "")
                    yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
                    await asyncio.sleep(0.012)
                break

    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    yield 'data: {"type":"done"}\n\n'


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: AuthUser = Depends(get_current_user),
):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="AI assistant not configured — set GEMINI_API_KEY")

    if not _check_rate_limit(user.id, user.is_root):
        raise HTTPException(
            status_code=429,
            detail=f"Límite diario de {MAX_DAILY_QUERIES} consultas alcanzado. Vuelve mañana.",
        )

    _record_usage(user.id, user.is_root)

    return StreamingResponse(
        _generate(request.messages, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Remaining-Queries": str(_remaining_queries(user.id, user.is_root)),
        },
    )
