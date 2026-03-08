import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT user_email, COUNT(*) FROM workouts GROUP BY user_email")
rows = cursor.fetchall()
print("Workouts in DB grouped by email:")
for r in rows:
    print(r)
    
cursor.execute("SELECT email FROM users")
u_rows = cursor.fetchall()
print("\nUsers in DB:")
for r in u_rows:
    print(r)
conn.close()
