import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
import pandas as pd

def show_tables():
    conn = sqlite3.connect('gymhub.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print("--- Database Structure ---")
    for table in tables:
        table_name = table[0]
        if table_name == 'sqlite_sequence': continue
        print(f"\nTable: {table_name}")
        df = pd.read_sql_query(f"PRAGMA table_info({table_name})", conn)
        print(df[['name', 'type', 'notnull', 'pk']])
    
    conn.close()

if __name__ == "__main__":
    show_tables()
