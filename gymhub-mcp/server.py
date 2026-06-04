"""GymHub MCP Server — exposes 13 tools (9 read + 4 write) over stdio."""

import os
from typing import Optional

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

import read_tools
import write_tools

load_dotenv()

USER_ID: str = os.environ.get("GYMHUB_USER_ID", "")
TOKEN: str = os.environ.get("GYMHUB_TOKEN", "")

mcp = FastMCP("gymhub-mcp")


# ---------------------------------------------------------------------------
# Read tools (synchronous — DB access)
# ---------------------------------------------------------------------------


@mcp.tool()
def get_workouts(days: int = 30, limit: int = 20) -> dict:
    """Lista los entrenamientos recientes del usuario con ejercicios, series y datos de Fitbit.

    Devuelve título, fecha, duración, ejercicios agrupados con sus series y métricas Fitbit
    (calorías, FC media, zonas AZM). Útil para responder preguntas sobre sesiones recientes.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_workouts({"days": days, "limit": limit}, USER_ID, db)
    finally:
        db.close()


@mcp.tool()
def get_exercise_prs(exercise_name: Optional[str] = None) -> dict:
    """Devuelve los récords personales (máximos históricos) del usuario por ejercicio.

    Si se especifica exercise_name se filtra por nombre (búsqueda parcial).
    Incluye músculo trabajado, valor máximo, unidad y fecha del récord.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_exercise_prs({"exercise_name": exercise_name}, USER_ID, db)
    finally:
        db.close()


@mcp.tool()
def get_analytics_summary(days: int = 30) -> dict:
    """Resumen de KPIs del periodo actual vs periodo anterior: entrenamientos, volumen, duración media y PRs.

    Permite detectar tendencias de mejora o bajada en el rendimiento.
    El campo 'previous' contiene los mismos KPIs del periodo equivalente anterior.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_analytics_summary({"days": days}, USER_ID, db)
    finally:
        db.close()


@mcp.tool()
def get_exercise_frequency(days: int = 90, muscle_name: Optional[str] = None) -> dict:
    """Ejercicios más realizados en el periodo, con número de sesiones distintas.

    Opcionalmente filtrado por grupo muscular (búsqueda parcial por nombre).
    Útil para identificar qué ejercicios se entrenan más o menos.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_exercise_frequency(
            {"days": days, "muscle_name": muscle_name}, USER_ID, db
        )
    finally:
        db.close()


@mcp.tool()
def get_exercise_history(exercise_name: str, days: int = 90) -> dict:
    """Serie temporal de todos los sets de un ejercicio concreto, agrupados por sesión.

    Devuelve cada sesión con su fecha y lista de sets (valor y unidad).
    Usa búsqueda parcial por nombre; devuelve error si no se encuentra el ejercicio.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_exercise_history(
            {"exercise_name": exercise_name, "days": days}, USER_ID, db
        )
    finally:
        db.close()


@mcp.tool()
def get_weight_progress(exercise_name: str, days: int = 60) -> dict:
    """Tendencia del peso máximo diario para un ejercicio específico.

    Devuelve una serie de puntos {date, max_value} ordenados cronológicamente.
    Útil para visualizar progresión de fuerza o detectar estancamientos.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_weight_progress(
            {"exercise_name": exercise_name, "days": days}, USER_ID, db
        )
    finally:
        db.close()


@mcp.tool()
def get_daily_health(days: int = 14) -> dict:
    """Datos diarios de actividad Fitbit: pasos, calorías, FC en reposo, pisos y minutos activos.

    Incluye promedios de pasos y calorías del periodo.
    Útil para responder preguntas sobre actividad general o comparar días.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_daily_health({"days": days}, USER_ID, db)
    finally:
        db.close()


@mcp.tool()
def get_sleep_logs(days: int = 14) -> dict:
    """Registros de sueño de Fitbit: duración, eficiencia y etapas (deep, REM, light, awake).

    Solo incluye el sueño principal de cada noche (is_main_sleep=True).
    Devuelve también promedios de duración y eficiencia del periodo.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_sleep_logs({"days": days}, USER_ID, db)
    finally:
        db.close()


@mcp.tool()
def get_muscle_balance(days: int = 90) -> dict:
    """Volumen de entrenamiento (kg) por grupo muscular y semana ISO.

    Permite detectar desequilibrios musculares (e.g. mucho pecho, poca espalda).
    Incluye totales acumulados por músculo en el periodo completo.
    """
    from database import SessionLocal

    db = SessionLocal()
    try:
        return read_tools.get_muscle_balance({"days": days}, USER_ID, db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Write tools (async — HTTP calls to backend)
# ---------------------------------------------------------------------------


@mcp.tool()
async def create_workout(
    title: str,
    start_time: str,
    end_time: str,
    exercises: Optional[list] = None,
) -> dict:
    """Crea un nuevo workout en GymHub con ejercicios y series.

    Los nombres de ejercicio se resuelven automáticamente por búsqueda parcial en la DB.
    El workout se sincroniza con Google Calendar automáticamente tras la creación.

    exercises: lista de objetos con {exercise_name, sets: [{value, measurement}]}
    start_time / end_time: formato ISO 8601, e.g. '2025-03-15T18:30:00'
    """
    return await write_tools.create_workout(
        {
            "title": title,
            "start_time": start_time,
            "end_time": end_time,
            "exercises": exercises or [],
        },
        TOKEN,
    )


@mcp.tool()
async def add_set_to_workout(
    workout_id: str,
    exercise_name: str,
    value: str,
    measurement: str,
) -> dict:
    """Añade un set a un workout existente sin eliminar los sets actuales.

    Lee el workout de la DB, añade el nuevo set al final y envía el PUT al backend.
    El backend re-sincroniza Calendar y Fitbit automáticamente.

    value: e.g. '80' o '80-70' (rango de peso)
    measurement: 'kg', 'rep', 's', 'min'
    """
    return await write_tools.add_set_to_workout(
        {
            "workout_id": workout_id,
            "exercise_name": exercise_name,
            "value": value,
            "measurement": measurement,
        },
        TOKEN,
    )


@mcp.tool()
async def sync_pending_cardio(days: int = 30) -> dict:
    """Sube al historial las actividades cardio de Fitbit que aún no tienen workout en GymHub.

    El backend detecta automáticamente cuáles actividades Fitbit no tienen workout asociado
    y las crea. Devuelve cuántas actividades fueron subidas.
    """
    return await write_tools.sync_pending_cardio({"days": days}, TOKEN)


@mcp.tool()
async def sync_fitbit_to_workout(workout_id: str) -> dict:
    """Asocia los datos de Fitbit (calorías, FC media, zonas AZM) a un workout específico.

    El backend busca la actividad Fitbit más cercana en tiempo y la vincula al workout.
    Devuelve calorías, FC media y duración tras la sincronización.
    """
    return await write_tools.sync_fitbit_to_workout({"workout_id": workout_id}, TOKEN)


if __name__ == "__main__":
    mcp.run()
