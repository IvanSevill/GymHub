import sqlite3

for db_file in ["gymhub.db", "gymhub_v2.db"]:
    conn = sqlite3.connect(db_file)
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print(f"{db_file} -> {tables}")
    if "fitbit_data" in tables:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(fitbit_data)")]
        print(f"  fitbit_data cols: {cols}")
    conn.close()
