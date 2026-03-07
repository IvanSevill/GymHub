import sqlite3

conn = sqlite3.connect("gymhub_v2.db")

new_cols = [
    "ALTER TABLE fitbit_data ADD COLUMN fitbit_log_id TEXT",
    "ALTER TABLE fitbit_data ADD COLUMN distance_km REAL",
    "ALTER TABLE fitbit_data ADD COLUMN elevation_gain_m REAL",
    "ALTER TABLE fitbit_data ADD COLUMN activity_name TEXT",
    "ALTER TABLE fitbit_data ADD COLUMN azm_fat_burn INTEGER",
    "ALTER TABLE fitbit_data ADD COLUMN azm_cardio INTEGER",
    "ALTER TABLE fitbit_data ADD COLUMN azm_peak INTEGER",
]

for sql in new_cols:
    col = sql.split("ADD COLUMN ")[1].split()[0]
    try:
        conn.execute(sql)
        print(f"OK: {col}")
    except Exception as e:
        print(f"SKIP (ya existe) {col}: {e}")

conn.commit()
cols = [r[1] for r in conn.execute("PRAGMA table_info(fitbit_data)")]
print(f"\nColumnas finales: {cols}")
conn.close()
