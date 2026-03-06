import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from sqlalchemy.orm import Session
from models import SessionLocal, User
from dotenv import load_dotenv
import os

def update_user_tokens():
    load_dotenv()
    db = SessionLocal()
    
    # Get the test user
    user = db.query(User).filter(User.email == "test@gymhub.app").first()
    if not user:
        print("Test user not found in DB.")
        return

    # Read the token.json
    if not os.path.exists("token.json"):
        print("token.json not found! You must run test_google_calendar.py first.")
        return
        
    with open("token.json", "r") as f:
        token_data = json.load(f)
        
    user.google_access_token = token_data.get("token")
    user.google_refresh_token = token_data.get("refresh_token")
    # Also set the selected calendar ID from the env
    user.selected_calendar_id = os.getenv("SELECTED_CALENDAR_ID")
    
    db.commit()
    print(f"✅ Tokens guardados en el usuario {user.email}")
    print(f"✅ Calendario seleccionado: {user.selected_calendar_id}")
    db.close()

if __name__ == "__main__":
    update_user_tokens()
