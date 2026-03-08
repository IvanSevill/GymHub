import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Eliminar duplicados de FitbitData basados en fitbit_log_id
    # Nos quedamos con el ID más bajo para cada log_id
    cursor.execute("""
        DELETE FROM fitbit_data 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM fitbit_data 
            GROUP BY fitbit_log_id
        ) AND fitbit_log_id IS NOT NULL;
    """)
    print(f"Borradas {cursor.rowcount} filas duplicadas de fitbit_data.")

    # 2. Identificar y borrar Workouts que son duplicados de otros 
    # (mismo usuario, misma fecha/hora de inicio aproximada, mismo título)
    cursor.execute("""
        DELETE FROM workouts 
        WHERE id NOT IN (
            SELECT MIN(id) 
            FROM workouts 
            GROUP BY user_email, date, title
        );
    """)
    print(f"Borrados {cursor.rowcount} entrenamientos duplicados.")
    
    conn.commit()
    conn.close()
