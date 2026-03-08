import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT title, date FROM workouts WHERE user_email = 'ivansevillano2005.ordenador@gmail.com'")
rows = cursor.fetchall()
print(f"Workouts for ordenador: {len(rows)}")
for r in rows:
    print(r)
conn.close()
