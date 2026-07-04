import asyncio
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

import httpx
from google import genai
from google.genai import types as genai_types
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from mcp import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from pydantic import BaseModel

import backend_client
from auth import AuthUser, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
# Max model⇄tool round-trips before giving up. A complex question can chain
# many tool calls (one per metric), so this is intentionally generous: it must
# leave the model plenty of turns to gather data across many tools before
# writing its final answer. The no-tools fallback below still guarantees a
# reply if the cap is ever reached.
MAX_TOOL_ITERATIONS = 50
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
# Backend data access (sync httpx, called via asyncio.to_thread)
#
# The AI server never reads or writes the database directly: chat history,
# memory, usage and workout data all go through the backend REST API.
# ---------------------------------------------------------------------------

def _load_history(token: str) -> list[dict]:
    try:
        return backend_client.get("/assistant/history", token) or []
    except Exception as exc:
        logger.warning("Failed to load chat history: %s", exc)
        return []


def _save_msg(token: str, role: str, content: str) -> None:
    try:
        backend_client.post("/assistant/history", token, json={"role": role, "content": content})
    except Exception as exc:
        logger.warning("Failed to save chat message: %s", exc)


def _get_usage(token: str) -> dict | None:
    """Read the user's rate-limit usage from the backend.

    Returns None when the backend cannot be reached so callers that enforce the
    limit can fail closed (503) instead of silently letting the request through.
    """
    try:
        return backend_client.get("/assistant/usage", token) or {}
    except Exception as exc:
        logger.warning("Failed to read chat usage: %s", exc)
        return None


def _load_memories(token: str) -> list[dict]:
    try:
        return backend_client.get("/assistant/memory", token) or []
    except Exception as exc:
        logger.warning("Failed to load memories: %s", exc)
        return []


def _load_recent_workouts(token: str, days: int = 7, limit: int = 5) -> list[dict]:
    """Load recent workouts (via backend) for context inclusion in the system prompt."""
    cutoff = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)).isoformat()
    try:
        workouts = backend_client.get("/workouts", token, params={"start_date": cutoff}) or []
    except Exception as exc:
        logger.warning("Failed to load recent workouts: %s", exc)
        return []

    result = []
    for w in workouts[:limit]:
        exercises: dict = {}
        for s in w.get("exercise_sets", []):
            ex = s.get("exercise") or {}
            ex_name = ex.get("name", "Unknown")
            label = f"{s.get('value', '')} {s.get('measurement', '')}".strip()
            exercises.setdefault(ex_name, []).append(label)
        start = w.get("start_time", "")
        result.append({
            "date": start[:10] if start else "",
            "title": w.get("title", ""),
            "exercises": exercises,
        })
    return result


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

async def _generate(
    message: str, user: AuthUser, http_request: Request
) -> AsyncIterator[str]:
    try:
        history = await asyncio.to_thread(_load_history, user.token)
        memories = await asyncio.to_thread(_load_memories, user.token)
        recent_workouts = await asyncio.to_thread(_load_recent_workouts, user.token)
        await asyncio.to_thread(_save_msg, user.token, "user", message)

        mcp_env = {
            **dict(os.environ),
            "GYMHUB_USER_ID": user.id,
            "GYMHUB_TOKEN": user.token,
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
                for _ in range(MAX_TOOL_ITERATIONS):
                    # Stop cleanly if the client closed the SSE connection
                    # (chat panel closed, page reloaded or navigation). This
                    # avoids pushing further chunks to a dead connection, which
                    # uvicorn surfaces as a noisy ClientDisconnected error.
                    if await http_request.is_disconnected():
                        return
                    # Show activity immediately; text deltas clear it on the client.
                    yield 'data: {"type":"thinking"}\n\n'

                    text_buf = ""
                    fn_parts = []
                    stream = await client.aio.models.generate_content_stream(
                        model=MODEL,
                        contents=contents,
                        config=config,
                    )
                    async for chunk in stream:
                        if await http_request.is_disconnected():
                            return
                        if not chunk.candidates:
                            continue
                        for part in (chunk.candidates[0].content.parts or []):
                            if part.function_call and part.function_call.name:
                                fn_parts.append(part)
                            elif getattr(part, "text", ""):
                                text_buf += part.text
                                # Stream each token chunk to the client progressively.
                                yield f"data: {json.dumps({'type': 'text', 'text': part.text})}\n\n"

                    if fn_parts:
                        # Tool-call turn: record the model's request, run the tools,
                        # feed the results back and loop again.
                        contents.append(genai_types.Content(role="model", parts=fn_parts))
                        fn_responses = []
                        for part in fn_parts:
                            fn_name = part.function_call.name
                            fn_args = dict(part.function_call.args)
                            # Debug trace: which tool ran and with what arguments.
                            # The raw result can contain the user's health data, so
                            # it is logged only at DEBUG (set LOG_LEVEL=DEBUG to see
                            # the full payload); INFO keeps just the tool + args.
                            logger.info("🔧 tool call → %s args=%s", fn_name, fn_args)
                            tool_result = await session.call_tool(fn_name, fn_args)
                            result_text = tool_result.content[0].text if tool_result.content else "{}"
                            logger.debug("🔧 tool result ← %s: %s", fn_name, result_text)
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
                        # Answer turn: the text was already streamed above.
                        await asyncio.to_thread(_save_msg, user.token, "assistant", text_buf)
                        produced_text = True
                        break

                if not produced_text:
                    # The model used up every tool round without writing an answer.
                    # Force one final turn WITHOUT tools so it summarizes the data
                    # it already gathered instead of failing outright.
                    try:
                        final_config = genai_types.GenerateContentConfig(
                            system_instruction=_system_prompt(user.name, memories, recent_workouts),
                            temperature=0.7,
                            max_output_tokens=2048,
                        )
                        contents.append(genai_types.Content(
                            role="user",
                            parts=[genai_types.Part(text=(
                                "Responde ahora al usuario con la información que ya has "
                                "recopilado. No llames a más herramientas."
                            ))],
                        ))
                        final = await asyncio.to_thread(
                            client.models.generate_content,
                            model=MODEL,
                            contents=contents,
                            config=final_config,
                        )
                        text = (final.text or "").strip()
                    except Exception:
                        text = ""

                    if text:
                        await asyncio.to_thread(_save_msg, user.token, "assistant", text)
                        yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"
                    else:
                        yield f'data: {json.dumps({"type": "error", "message": "El asistente no pudo generar una respuesta. Inténtalo de nuevo."})}\n\n'

    except BaseException as exc:
        # Let cancellation/shutdown propagate (e.g. client disconnect) instead
        # of swallowing it and trying to emit on a dead connection.
        if isinstance(exc, (KeyboardInterrupt, SystemExit, asyncio.CancelledError)):
            raise
        logger.exception("Error in _generate for user %s", user.id)
        yield f"data: {json.dumps({'type': 'error', 'message': _unwrap_exc(exc)})}\n\n"

    yield 'data: {"type":"done"}\n\n'


# ---------------------------------------------------------------------------
# Endpoints — all persistence is delegated to the backend REST API
# ---------------------------------------------------------------------------

@router.get("/chat/memory")
async def get_memory_endpoint(user: AuthUser = Depends(get_current_user)):
    return await asyncio.to_thread(_load_memories, user.token)


@router.post("/chat/memory")
async def save_memory_endpoint(
    data: dict,
    user: AuthUser = Depends(get_current_user),
):
    try:
        return await asyncio.to_thread(
            backend_client.post, "/assistant/memory", user.token,
            {"key": data["key"], "value": data["value"]},
        )
    except KeyError:
        raise HTTPException(status_code=400, detail="key y value son obligatorios")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Error al guardar memoria")


@router.delete("/chat/memory/{memory_id}", status_code=204)
async def delete_memory_endpoint(
    memory_id: str,
    user: AuthUser = Depends(get_current_user),
):
    try:
        await asyncio.to_thread(backend_client.delete, f"/assistant/memory/{memory_id}", user.token)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Memory not found")
        raise HTTPException(status_code=exc.response.status_code, detail="Error al borrar memoria")


@router.get("/chat/usage")
async def chat_usage_endpoint(user: AuthUser = Depends(get_current_user)):
    usage = await asyncio.to_thread(_get_usage, user.token) or {}
    return {
        "used": usage.get("used", 0),
        "limit": usage.get("limit"),
        "reset_at": usage.get("reset_at"),
        "is_root": bool(usage.get("is_root")),
    }


@router.get("/chat/history")
async def chat_history_endpoint(user: AuthUser = Depends(get_current_user)):
    return await asyncio.to_thread(_load_history, user.token)


@router.delete("/chat/history")
async def clear_chat_history_endpoint(user: AuthUser = Depends(get_current_user)):
    try:
        await asyncio.to_thread(backend_client.delete, "/assistant/history", user.token)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Error al borrar historial")
    return {"cleared": True}


@router.post("/chat")
async def chat(
    request: ChatRequest,
    http_request: Request,
    user: AuthUser = Depends(get_current_user),
):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="message no puede estar vacío")

    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="AI assistant not configured — set GEMINI_API_KEY")

    usage = await asyncio.to_thread(_get_usage, user.token)
    if usage is None:
        # Fail closed: if we cannot verify the allowance, do not let the request
        # bypass the rate limit.
        raise HTTPException(
            status_code=503,
            detail="No se pudo verificar el límite de uso. Inténtalo de nuevo en unos segundos.",
        )
    limit = usage.get("limit")
    if not usage.get("is_root") and limit is not None and usage.get("used", 0) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Límite de {limit} consultas alcanzado. Vuelve a intentarlo más tarde.",
        )

    return StreamingResponse(
        _generate(request.message, user, http_request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
