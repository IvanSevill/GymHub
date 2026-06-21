"""GymHub MCP Server — exposes 26 tools (19 read + 7 write) over stdio."""

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
# Read tools (all via backend REST — no DB access)
# ---------------------------------------------------------------------------


@mcp.tool()
def get_workouts(days: int = 30, limit: int = 20) -> dict:
    """Lista los entrenamientos recientes del usuario con ejercicios, series y datos de Fitbit.

    Devuelve título, fecha, duración, ejercicios agrupados con sus series y métricas Fitbit
    (calorías, FC media, zonas AZM). Útil para responder preguntas sobre sesiones recientes.
    """
    return read_tools.get_workouts({"days": days, "limit": limit}, USER_ID, None)


@mcp.tool()
def get_exercise_prs(exercise_name: Optional[str] = None) -> dict:
    """Devuelve los récords personales (máximos históricos) del usuario por ejercicio.

    Si se especifica exercise_name se filtra por nombre (búsqueda parcial).
    Incluye músculo trabajado, valor máximo, unidad y fecha del récord.
    """
    return read_tools.get_exercise_prs({"exercise_name": exercise_name}, USER_ID, None)


@mcp.tool()
def get_analytics_summary(days: int = 30) -> dict:
    """Resumen de KPIs del periodo actual vs periodo anterior: entrenamientos, volumen, duración media y PRs.

    Permite detectar tendencias de mejora o bajada en el rendimiento.
    El campo 'previous' contiene los mismos KPIs del periodo equivalente anterior.
    """
    return read_tools.get_analytics_summary({"days": days}, USER_ID, None)


@mcp.tool()
def get_exercise_frequency(days: int = 90, muscle_name: Optional[str] = None) -> dict:
    """Ejercicios más realizados en el periodo, con número de sesiones distintas.

    Opcionalmente filtrado por grupo muscular (búsqueda parcial por nombre).
    Útil para identificar qué ejercicios se entrenan más o menos.
    """
    return read_tools.get_exercise_frequency(
        {"days": days, "muscle_name": muscle_name}, USER_ID, None
    )


@mcp.tool()
def get_exercise_history(exercise_name: str, days: int = 90) -> dict:
    """Serie temporal de todos los sets de un ejercicio concreto, agrupados por sesión.

    Devuelve cada sesión con su fecha y lista de sets (valor y unidad).
    Usa búsqueda parcial por nombre; devuelve error si no se encuentra el ejercicio.
    """
    return read_tools.get_exercise_history(
        {"exercise_name": exercise_name, "days": days}, USER_ID, None
    )


@mcp.tool()
def get_weight_progress(exercise_name: str, days: int = 60) -> dict:
    """Tendencia del peso máximo diario para un ejercicio específico.

    Devuelve una serie de puntos {date, max_value} ordenados cronológicamente.
    Útil para visualizar progresión de fuerza o detectar estancamientos.
    """
    return read_tools.get_weight_progress(
        {"exercise_name": exercise_name, "days": days}, USER_ID, None
    )


@mcp.tool()
def get_daily_health(days: int = 14) -> dict:
    """Datos diarios de actividad Fitbit: pasos, calorías, FC en reposo, pisos y minutos activos.

    Incluye promedios de pasos y calorías del periodo.
    Útil para responder preguntas sobre actividad general o comparar días.
    """
    return read_tools.get_daily_health({"days": days}, USER_ID, None)


@mcp.tool()
def get_sleep_logs(days: int = 14) -> dict:
    """Registros de sueño de Fitbit: duración, eficiencia y etapas (deep, REM, light, awake).

    Solo incluye el sueño principal de cada noche (is_main_sleep=True).
    Devuelve también promedios de duración y eficiencia del periodo.
    """
    return read_tools.get_sleep_logs({"days": days}, USER_ID, None)


@mcp.tool()
def get_muscle_balance(days: int = 90) -> dict:
    """Volumen de entrenamiento (kg) por grupo muscular y semana ISO.

    Permite detectar desequilibrios musculares (e.g. mucho pecho, poca espalda).
    Incluye totales acumulados por músculo en el periodo completo.
    """
    return read_tools.get_muscle_balance({"days": days}, USER_ID, None)


@mcp.tool()
def get_workout_count_in_period(start_date: str, end_date: str) -> dict:
    """Cuenta el número exacto de entrenamientos entre dos fechas (inclusivo).

    start_date / end_date: formato YYYY-MM-DD.
    Devuelve {count, start_date, end_date}.
    """
    return read_tools.get_workout_count_in_period(
        {"start_date": start_date, "end_date": end_date}, USER_ID, None
    )


@mcp.tool()
def get_workouts_in_period(start_date: str, end_date: str) -> list:
    """Devuelve los entrenamientos completos con ejercicios y series entre dos fechas.

    start_date / end_date: formato YYYY-MM-DD.
    Cada workout incluye id, título, fecha, duración en minutos y ejercicios agrupados con sus series.
    """
    return read_tools.get_workouts_in_period(
        {"start_date": start_date, "end_date": end_date}, USER_ID, None
    )


@mcp.tool()
def get_user_profile() -> dict:
    """Devuelve el perfil del usuario: nombre, altura y último registro de peso y % grasa.

    Útil para contextualizar recomendaciones de carga, IMC o progreso corporal.
    """
    return read_tools.get_user_profile({}, USER_ID, None)


@mcp.tool()
def get_weight_logs(days: int = 90) -> dict:
    """Historial de peso corporal y porcentaje de grasa del usuario.

    Devuelve una lista de entradas con fecha, peso (kg) y % grasa (si se registró),
    más los valores más recientes como campos de acceso rápido.
    """
    return read_tools.get_weight_logs({"days": days}, USER_ID, None)


# ---------------------------------------------------------------------------
# Write tools (sync — via backend_client)
# ---------------------------------------------------------------------------


@mcp.tool()
def create_workout(
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
    return write_tools.create_workout(
        {
            "title": title,
            "start_time": start_time,
            "end_time": end_time,
            "exercises": exercises or [],
        },
        TOKEN,
    )


@mcp.tool()
def add_set_to_workout(
    workout_id: str,
    exercise_name: str,
    value: str,
    measurement: str,
) -> dict:
    """Añade un set a un workout existente sin eliminar los sets actuales.

    Lee el workout del backend, añade el nuevo set al final y envía el PUT al backend.
    El backend re-sincroniza Calendar y Fitbit automáticamente.

    value: e.g. '80' o '80-70' (rango de peso)
    measurement: 'kg', 'rep', 's', 'min'
    """
    return write_tools.add_set_to_workout(
        {
            "workout_id": workout_id,
            "exercise_name": exercise_name,
            "value": value,
            "measurement": measurement,
        },
        TOKEN,
    )


@mcp.tool()
def sync_pending_cardio(days: int = 30) -> dict:
    """Sube al historial las actividades cardio de Fitbit que aún no tienen workout en GymHub.

    El backend detecta automáticamente cuáles actividades Fitbit no tienen workout asociado
    y las crea. Devuelve cuántas actividades fueron subidas.
    """
    return write_tools.sync_pending_cardio({"days": days}, TOKEN)


@mcp.tool()
def sync_fitbit_to_workout(workout_id: str) -> dict:
    """Asocia los datos de Fitbit (calorías, FC media, zonas AZM) a un workout específico.

    El backend busca la actividad Fitbit más cercana en tiempo y la vincula al workout.
    Devuelve calorías, FC media y duración tras la sincronización.
    """
    return write_tools.sync_fitbit_to_workout({"workout_id": workout_id}, TOKEN)


@mcp.tool()
def save_memory(key: str, value: str) -> dict:
    """Guarda un hecho importante sobre el usuario en memoria persistente.

    Úsalo cuando el usuario mencione objetivos, lesiones, preferencias o cualquier
    información relevante sobre sí mismo. Si ya existe una memoria con esa clave,
    se actualiza con el nuevo valor.

    key: etiqueta corta, e.g. 'objetivo', 'lesion_hombro', 'dias_entrenamiento'
    value: descripción, e.g. 'ganar masa muscular', 'lesión en hombro izquierdo'
    """
    return write_tools.save_memory({"key": key, "value": value}, TOKEN)


@mcp.tool()
def get_memories() -> dict:
    """Recupera todos los recuerdos guardados del usuario.

    Devuelve una lista de memorias con su clave, valor y fecha de creación.
    """
    return write_tools.get_memories({}, TOKEN)


@mcp.tool()
def log_weight(date: str, weight_kg: float, body_fat_pct: Optional[float] = None) -> dict:
    """Registra o actualiza el peso corporal y el % de grasa de una fecha concreta.

    Si ya existe un registro para esa fecha, lo sobreescribe (upsert).
    date: formato YYYY-MM-DD (e.g. '2025-06-06')
    weight_kg: peso en kilogramos
    body_fat_pct: porcentaje de grasa corporal (opcional, 1–70)
    """
    return write_tools.log_weight(
        {"date": date, "weight_kg": weight_kg, "body_fat_pct": body_fat_pct}, TOKEN
    )


@mcp.tool()
def delete_weight_log(date: str) -> dict:
    """Elimina el registro de peso de una fecha concreta (para corregir errores).

    date: formato YYYY-MM-DD
    """
    return write_tools.delete_weight_log({"date": date}, TOKEN)


# ---------------------------------------------------------------------------
# Advanced analysis tools (via REST data)
# ---------------------------------------------------------------------------


@mcp.tool()
def analyze_performance_correlation(metric1: str, metric2: str, days: int = 60) -> dict:
    """Correlación de Pearson entre dos métricas de salud/rendimiento.

    Métricas disponibles: sleep_duration, sleep_efficiency, resting_hr, steps,
    workout_volume, weight.
    Devuelve el coeficiente r, tamaño de muestra e interpretación en español.
    """
    return read_tools.analyze_performance_correlation(
        {"metric1": metric1, "metric2": metric2, "days": days}, USER_ID, None
    )


@mcp.tool()
def predict_performance_trend(exercise_name: str, days: int = 30) -> dict:
    """Predice la tendencia de rendimiento para un ejercicio mediante regresión lineal.

    Devuelve la pendiente semanal, el valor máximo actual, la proyección futura
    y la dirección de la tendencia (mejorando/estable/bajando).
    """
    return read_tools.predict_performance_trend(
        {"exercise_name": exercise_name, "days": days}, USER_ID, None
    )


@mcp.tool()
def suggest_recovery_protocol(reason: str = "") -> dict:
    """Evalúa señales de recuperación y sugiere un protocolo de recuperación.

    Analiza últimos 3 entrenamientos (volumen + duración), sueño (7 días) y
    frecuencia cardíaca en reposo para detectar fatiga acumulada.
    """
    return read_tools.suggest_recovery_protocol({"reason": reason}, USER_ID, None)


@mcp.tool()
def generate_workout_plan(
    duration_weeks: int,
    focus_muscle_groups: list,
    goal: str,
    intensity_level: str = "moderate",
) -> dict:
    """Genera un plan de entrenamiento personalizado basado en datos reales del usuario.

    Consulta ejercicios disponibles por grupo muscular, PRs del usuario y
    equilibrio muscular. Devuelve datos estructurados para que el LLM construya el plan.
    """
    return read_tools.generate_workout_plan(
        {
            "duration_weeks": duration_weeks,
            "focus_muscle_groups": focus_muscle_groups,
            "goal": goal,
            "intensity_level": intensity_level,
        },
        USER_ID,
        None,
    )


@mcp.tool()
def get_overtraining_risk_assessment(days: int = 14) -> dict:
    """Evalúa el riesgo de sobreentrenamiento del usuario.

    Analiza tendencias de volumen de entrenamiento, FC en reposo y eficiencia de sueño.
    Devuelve nivel de riesgo (bajo/moderado/alto), factores detectados y recomendaciones.
    """
    return read_tools.get_overtraining_risk_assessment(
        {"days": days}, USER_ID, None
    )


if __name__ == "__main__":
    mcp.run()
