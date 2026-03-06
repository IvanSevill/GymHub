import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

"""
Migration: adds muscle_groups to workouts and muscle_group to exercise_sets.
Safe to run multiple times (ignores "duplicate column" errors).
Also backfills muscle_groups on existing workouts from their titles.
"""
import sqlite3
import re
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "gymhub_v2.db")
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(os.path.dirname(__file__), "gymhub.db")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

def add_column(table, col, coltype="TEXT"):
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}")
        print(f"  ✅ Added column {table}.{col}")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e):
            print(f"  ⏭️  {table}.{col} already exists, skipping.")
        else:
            raise

print("🔧 Running migrations...")
add_column("workouts", "muscle_groups", "TEXT")
add_column("exercise_sets", "muscle_group", "TEXT")
conn.commit()

# Backfill muscle_groups from existing workout titles
def parse_muscle_groups(title):
    parts = re.split(r'[/\-,+]|\by\b', title or '', flags=re.IGNORECASE)
    cleaned = [p.strip() for p in parts if p.strip()]
    return ','.join(cleaned)

cur.execute("SELECT id, title FROM workouts WHERE muscle_groups IS NULL OR muscle_groups = ''")
rows = cur.fetchall()
print(f"\n🔄 Backfilling muscle_groups for {len(rows)} workouts...")
for row_id, title in rows:
    mg = parse_muscle_groups(title)
    cur.execute("UPDATE workouts SET muscle_groups = ? WHERE id = ?", (mg, row_id))
    print(f"  '{title}' → '{mg}'")

conn.commit()
conn.close()
print("\n✅ Migration complete!")
