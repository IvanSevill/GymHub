import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT title, date FROM workouts WHERE user_email = 'ivansevillano2005@gmail.com' AND date LIKE '2026-03%'")
rows = cursor.fetchall()
print(f"Workouts in March 2026: {len(rows)}")
for r in rows:
    print(r)
conn.close()
