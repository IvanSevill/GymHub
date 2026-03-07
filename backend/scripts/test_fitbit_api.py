import sys
import os
import datetime
import json

# Fix Windows UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Add parent dir to path so we can import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import SessionLocal, User
from services.fitbit_client import FitbitService

def main():
    print("=== Prueba de conexion con Fitbit API ===\n")

    db = SessionLocal()
    user = db.query(User).first()

    if not user:
        print("ERROR: No hay usuarios en la base de datos.")
        return

    print(f"Usuario: {user.email}")
    print(f"fitbit_id: {user.fitbit_id}")
    print(f"access_token: {'[OK]' if user.fitbit_access_token else '[MISSING]'}")
    print(f"refresh_token: {'[OK]' if user.fitbit_refresh_token else '[MISSING]'}\n")

    if not user.fitbit_access_token:
        print("El usuario no tiene token de Fitbit. Vincula desde la web primero.")
        return

    token = user.fitbit_access_token

    # ---- 1. PERFIL DEL USUARIO ----
    print(">>> GET /1/user/-/profile.json")
    try:
        profile = FitbitService.fetch_profile(token)
        print(json.dumps(profile, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error: {e}")

    print("\n" + "="*60 + "\n")

    # ---- 2. ACTIVIDADES RECIENTES (ultimos 30 dias) ----
    after_date = (datetime.datetime.now() - datetime.timedelta(days=30)).strftime("%Y-%m-%d")
    print(f">>> GET /1/user/-/activities/list.json (desde {after_date})")
    try:
        activities = FitbitService.fetch_recent_activities(token, after_date)
        print(f"Total actividades encontradas: {len(activities)}")
        if activities:
            print("\nPrimera actividad (JSON completo):")
            print(json.dumps(activities[0], indent=2, ensure_ascii=False))
            if len(activities) > 1:
                print(f"\n... y {len(activities)-1} mas\n")
    except Exception as e:
        print(f"Error: {e}")

    print("\n" + "="*60 + "\n")

    # ---- 3. RESUMEN DEL DIA DE HOY ----
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    print(f">>> GET /1/user/-/activities/date/{today}.json (resumen hoy)")
    try:
        summary = FitbitService.fetch_daily_summary(token, today)
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Error: {e}")

    db.close()

if __name__ == "__main__":
    main()
