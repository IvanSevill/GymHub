import os
from sqlalchemy import create_engine
from app.models import Base
from app.core.database import engine, db_url

def reboot_db():
    print(f"Connecting to database at: {db_url}")
    
    # Confirm with user (since it's a script they will run, maybe just a print is enough, 
    # but I'll add a small safety check if run interactively, though here I'll just make it do its job)
    
    try:
        # Drop all tables
        print("Dropping all tables...")
        Base.metadata.drop_all(bind=engine)
        
        # Recreate all tables
        print("Recreating all tables...")
        Base.metadata.create_all(bind=engine)
        
        print("Database rebooted successfully! All data has been cleared.")
    except Exception as e:
        print(f"An error occurred while rebooting the database: {e}")

if __name__ == "__main__":
    confirm = input("Are you sure you want to delete ALL data from the database? (y/n): ")
    if confirm.lower() == 'y':
        reboot_db()
    else:
        print("Reboot cancelled.")
