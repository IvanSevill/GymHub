import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

from google import genai
from google.genai import types as genai_types
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from pydantic import BaseModel

from auth import AuthUser, get_current_user
from chat_history import (
    RATE_LIMIT_COUNT,
    RATE_LIMIT_HOURS,
    count_recent_user_messages,
    delete_history,
    get_history,
    get_window_info,
    save_message,
)
from database import SessionLocal
import memory as memory_module
from sqlalchemy import desc
import models as db_models

logger = logging.getLogger(__name__)
router = APIRouter()

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
MCP_SERVER_PATH = Path(
    os.getenv("MCP_SERVER_PATH", str(Path(__file__).parent.parent / "gymhub-mcp" / "server.py"))
).resolve()

_gemini_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY", ""))
    return _gemini_client


# ---------------------------------------------------------------------------
# Exception unwrapper
# ---------------------------------------------------------------------------

def _unwrap_exc(exc: BaseException) -> str:
    """Recursively unwrap ExceptionGroup/BaseExceptionGroup to get the root message."""
    while hasattr(exc, "exceptions") and exc.exceptions:
        exc = exc.exceptions[0]
    return str(exc)


# ---------------------------------------------------------------------------
# MCP → Gemini tool conversion
# ---------------------------------------------------------------------------

_JSON_TYPE_MAP = {
    "string": "STRING", "integer": "INTEGER", "number": "NUMBER",
    "boolean": "BOOLEAN", "array": "ARRAY", "object": "OBJECT",
}


def _json_schema_to_genai(schema: dict) -> genai_types.Schema:
    t = _JSON_TYPE_MAP.get(schema.get("type", "string"), "STRING")
    kwargs: dict = {"type": t}
    if "description" in schema:
        kwargs["description"] = schema["description"]
    if t == "OBJECT" and "properties" in schema:
        kwargs["properties"] = {k: _json_schema_to_genai(v) for k, v in schema["properties"].items()}
        if "required" in schema:
            kwargs["required"] = schema["required"]
    if t == "ARRAY" and "items" in schema:
        kwargs["items"] = _json_schema_to_genai(schema["items"])
    return genai_types.Schema(**kwargs)


def _mcp_to_genai_tools(mcp_tools: list) -> list[genai_types.Tool]:
    declarations = []
    for t in mcp_tools:
        schema = t.inputSchema or {}
        declarations.append(genai_types.FunctionDeclaration(
            name=t.name,
            description=t.description or t.name,
            parameters=_json_schema_to_genai(schema) if schema.get("properties") else None,
        ))
    return [genai_types.Tool(function_declarations=declarations)] if declarations else []


# ---------------------------------------------------------------------------
# DB helpers (sync, called via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _load_history(user_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        return get_history(user_id, db)
    finally:
        db.close()


def _save_msg(user_id: str, role: str, content: str) -> None:
    db = SessionLocal()
    try:
        save_message(user_id, role, content, db)
    finally:
        db.close()


def _count_recent(user_id: str) -> int:
    db = SessionLocal()
    try:
        return count_recent_user_messages(user_id, db)
    finally:
        db.close()


def _get_window_info(user_id: str) -> tuple[int, datetime | None]:
    db = SessionLocal()
    try:
        return get_window_info(user_id, db)
    finally:
        db.close()


def _clear_history(user_id: str) -> None:
    db = SessionLocal()
    try:
        delete_history(user_id, db)
    finally:
        db.close()


def _load_recent_workouts(user_id: str, days: int = 7, limit: int = 5) -> list[dict]:
    """Load recent workouts for context inclusion in system prompt."""
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        workouts = (
            db.query(db_models.Workout)
            .filter(
                db_models.Workout.user_id == user_id,
                db_models.Workout.start_time >= cutoff,
            )
            .order_by(desc(db_models.Workout.start_time))
            .limit(limit)
            .all()
        )

        result = []
        for w in workouts:
            exercises: dict = {}
            for s in w.exercise_sets:
                ex_name = s.exercise.name if s.exercise else "Unknown"
                label = f"{s.value} {s.measurement}".strip()
                exercises.setdefault(ex_name, []).append(label)

            result.append({
                "date": w.start_time.strftime("%Y-%m-%d"),
                "title": w.title,
                "exercises": exercises,
            })
        return result
    finally:
        db.close()


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

def _system_prompt(name: str, memories: list[dict] | None = None, recent_workouts: list[dict] | None = None) -> str:
    today = datetime.now(timezone.utc).strftime("%A, %d de %B de %Y")
    memory_text = ""
    if memories:
        lines = "\n".join(f"- {m['key']}: {m['value']}" for m in memories)
        memory_text = f"\n\nInformación recordada sobre {name}:\n{lines}"

    workouts_text = ""
    if recent_workouts:
        workout_lines = []
        for w in recent_workouts:
            ex_str = ", ".join(f"{name} ({', '.join(sets)})" for name, sets in w['exercises'].items())
            workout_lines.append(f"- {w['date']}: {w['title']} ({ex_str})")
        if workout_lines:
            workouts_text = "\n\nÚltimos entrenamientos (últimos 7 días):\n" + "\n".join(workout_lines)

    return (
        f"Eres GymChat, el asistente personal de fitness de {name}. Hoy es {today}.\n\n"
        "Eres un coach de fitness exigente pero justo — usas datos para motivar y corregir. "
        "Hablas de forma directa y sin rodeos. Tus respuestas son cortas y concretas, "
        "más largas solo cuando los datos lo justifican. "
        "Nunca eres condescendiente ni moralista.\n\n"
        "Tienes acceso al historial de entrenamientos, récords, sueño y salud "
        "del usuario. "
        "Usa las funciones disponibles para dar respuestas basadas en datos reales.\n\n"
        "Reglas:\n"
        "- Responde en el idioma del usuario (español por defecto).\n"
        "- Cita fechas y periodos concretos al dar datos.\n"
        "- Sé conciso y directo.\n"
        "- Si el usuario pide crear o modificar datos, confirma antes si hay ambigüedad.\n"
        "- Si no hay datos disponibles, dilo claramente.\n"
        "- Cuando el usuario mencione algo relevante sobre sí mismo (lesiones, objetivos, "
        "preferencias, limitaciones), guárdalo con save_memory usando una clave corta y descriptiva.\n"
        "- Cuando recomiendes ejercicios, usa get_exercise_frequency para verificar qué ejercicios "
        "existen en la base de datos. Solo recomienda ejercicios que estén disponibles.\n"
        "- Si te preguntan sobre algo que no esté relacionado con fitness, salud, entrenamientos "
        "o los datos de GymHub, responde en el idioma del usuario: "
        "'Eso queda fuera de mi área. Soy tu coach de fitness — pregúntame sobre tus entrenos, "
        "objetivos, progreso o salud.'"
        + workouts_text
        + memory_text
    )


# ---------------------------------------------------------------------------
# Chat schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Streaming generator
# ---------------------------------------------------------------------------

def _load_memories(user_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        return memory_module.get_memories(user_id, db)
    finally:
        db.close()


async def _generate(message: str, user: AuthUser) -> AsyncIterator[str]:
    try:
        history = await asyncio.to_thread(_load_history, user.id)
        memories = await asyncio.to_thread(_load_memories, user.id)
        recent_workouts = await asyncio.to_thread(_load_recent_workouts, user.id)
        await asyncio.to_thread(_save_msg, user.id, "user", message)

        mcp_env = {
            **dict(os.environ),
            "GYMHUB_USER_ID": user.id,
            "GYMHUB_TOKEN": user.token,
            "DATABASE_URL": os.getenv("DATABASE_URL", ""),
            "BACKEND_URL": os.getenv("BACKEND_URL", "http://localhost:8000"),
            "AI_SERVER_URL": os.getenv("AI_SERVER_URL", f"http://localhost:{os.getenv('PORT', '8001')}"),
        }

        client = _get_client()

        async with stdio_client(StdioServerParameters(
            command=sys.executable,
            args=[str(MCP_SERVER_PATH)],
            env=mcp_env,
        )) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()

                tools_result = await session.list_tools()
                gemini_tools = _mcp_to_genai_tools(tools_result.tools)

                config = genai_types.GenerateContentConfig(
                    system_instruction=_system_prompt(user.name, memories, recent_workouts),
                    tools=gemini_tools,
                    temperature=0.7,
                    max_output_tokens=2048,
                )

                contents: list[genai_types.Content] = [
                    genai_types.Content(
                        role="user" if h["role"] == "user" else "model",
                        parts=[genai_types.Part(text=h["content"])],
                    )
                    for h in history
                ]
                contents.append(genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=message)],
                ))

                produced_text = False
                for _ in range(6):
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=MODEL,
                        contents=contents,
                        config=config,
                    )

                    if not response.candidates:
                        yield f'data: {json.dumps({"type": "error", "message": "Sin respuesta del modelo."})}\n\n'
                        break

                    candidate = response.candidates[0].content
                    contents.append(candidate)

                    fn_parts = [
                        p for p in (candidate.parts or [])
                        if p.function_call and p.function_call.name
                    ]

                    if fn_parts:
                        yield 'data: {"type":"thinking"}\n\n'
                        fn_responses = []
                        for part in fn_parts:
                            fn_name = part.function_call.name
                            fn_args = dict(part.function_call.args)
                            tool_result = await session.call_tool(fn_name, fn_args)
                            result_text = tool_result.content[0].text if tool_result.content else "{}"
                            fn_responses.append(
                                genai_types.Part(
                                    function_response=genai_types.FunctionResponse(
                                        name=fn_name,
                                        response={"result": result_text},
                                    )
                                )
                            )
                        contents.append(genai_types.Content(role="user", parts=fn_responses))

                    else:
                        text = response.text or ""
                        await asyncio.to_thread(_save_msg, user.id, "assistant", text)
                        yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
                        produced_text = True
                        break

                if not produced_text:
                    yield f'data: {json.dumps({"type": "error", "message": "El asistente no pudo generar una respuesta. Inténtalo de nuevo."})}\n\n'

    except BaseException as exc:
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        logger.exception("Error in _generate for user %s", user.id)
        yield f"data: {json.dumps({'type': 'error', 'message': _unwrap_exc(exc)})}\n\n"

    yield 'data: {"type":"done"}\n\n'


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/chat/memory")
async def get_memory_endpoint(user: AuthUser = Depends(get_current_user)):
    db = SessionLocal()
    try:
        return memory_module.get_memories(user.id, db)
    finally:
        db.close()


@router.post("/chat/memory")
async def save_memory_endpoint(
    data: dict,
    user: AuthUser = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        return memory_module.save_memory(user.id, data["key"], data["value"], db)
    finally:
        db.close()


@router.delete("/chat/memory/{memory_id}", status_code=204)
async def delete_memory_endpoint(
    memory_id: str,
    user: AuthUser = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        ok = memory_module.delete_memory(user.id, memory_id, db)
        if not ok:
            raise HTTPException(status_code=404, detail="Memory not found")
    finally:
        db.close()


@router.get("/chat/usage")
async def chat_usage_endpoint(user: AuthUser = Depends(get_current_user)):
    if user.is_root:
        return {
            "used": 0,
            "limit": None,
            "reset_at": None,
            "is_root": True,
        }

    used, window_start = await asyncio.to_thread(_get_window_info, user.id)
    reset_at: str | None = None
    if window_start is not None:
        reset_dt = window_start + timedelta(hours=RATE_LIMIT_HOURS)
        reset_at = reset_dt.isoformat() + "Z"
    return {
        "used": used,
        "limit": RATE_LIMIT_COUNT,
        "reset_at": reset_at,
        "is_root": False,
    }


@router.get("/chat/history")
async def chat_history_endpoint(user: AuthUser = Depends(get_current_user)):
    return await asyncio.to_thread(_load_history, user.id)


@router.delete("/chat/history")
async def clear_chat_history_endpoint(user: AuthUser = Depends(get_current_user)):
    await asyncio.to_thread(_clear_history, user.id)
    return {"cleared": True}


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: AuthUser = Depends(get_current_user),
):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message no puede estar vacío")

    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="AI assistant not configured — set GEMINI_API_KEY")

    if not user.is_root:
        recent = await asyncio.to_thread(_count_recent, user.id)
        if recent >= RATE_LIMIT_COUNT:
            raise HTTPException(
                status_code=429,
                detail=f"Límite de {RATE_LIMIT_COUNT} consultas cada {RATE_LIMIT_HOURS} horas alcanzado.",
            )

    return StreamingResponse(
        _generate(request.message, user),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
