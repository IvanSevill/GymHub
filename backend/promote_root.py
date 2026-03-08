import sqlite3
import os

db_path = r'c:\Users\ivans\Desktop\IngenieriaSoftware\Programas\GymHub\backend\gymhub_v2.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Correct Account should be root
    root_email = 'ivansevillano2005@gmail.com'
    normal_email = 'ivansevillano2005.ordenador@gmail.com'
    
    # 1. Clear previous root if needed (optional but good for consistency)
    cursor.execute("UPDATE users SET is_root = 0 WHERE email = ?;", (normal_email,))
    
    # 2. Promote correct root
    cursor.execute("UPDATE users SET is_root = 1 WHERE email = ?;", (root_email,))
    
    if cursor.rowcount > 0:
        print(f"Successfully set {root_email} as root in the database.")
    else:
        print(f"User {root_email} not found in database.")
        
    conn.commit()
    conn.close()
