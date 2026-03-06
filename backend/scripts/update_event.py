import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sys
import json
from sqlalchemy.orm import Session
from models import SessionLocal, User
from google_calendar import GoogleCalendarService

def update_event_by_id(event_id, new_title, new_description):
    db = SessionLocal()
    user = db.query(User).filter(User.email.ilike("%ivan%")).first()
    if not user:
        user = db.query(User).first()
        
    cal_service = GoogleCalendarService(user, db)
    calendar_id = user.selected_calendar_id or 'primary'

    try:
        updated = cal_service.update_event(
            event_id=event_id,
            title=new_title,
            description=new_description,
            calendar_id=calendar_id
        )
        print(f"Evento {event_id} actualizado con éxito!")
        return True
    except Exception as e:
        print(f"Error actualizando evento: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Uso: python update_event.py <event_id> <new_title> <new_description_file_path>")
        sys.exit(1)
        
    event_id = sys.argv[1]
    new_title = sys.argv[2]
    desc_file = sys.argv[3]
    
    with open(desc_file, 'r', encoding='utf-8') as f:
        new_desc = f.read()
        
    update_event_by_id(event_id, new_title, new_desc)
