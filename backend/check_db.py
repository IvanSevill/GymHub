import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT title, date FROM workouts WHERE user_email = 'ivansevillano2005@gmail.com' ORDER BY date DESC LIMIT 10")
    rows = cursor.fetchall()
    print("Recent workouts for ivansevillano2005@gmail.com:")
    for row in rows:
        print(row)
    conn.close()
