import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import os
import json
import datetime
from sqlalchemy.orm import Session
from models import SessionLocal, User
from google_calendar import GoogleCalendarService

def fetch_and_save():
    db = SessionLocal()
    user = db.query(User).filter(User.email.ilike("%ivan%")).first()
    if not user:
        user = db.query(User).first()
    if not user:
        print("Error: No se encontró ningún usuario.")
        return

    cal_service = GoogleCalendarService(user, db)
    calendar_id = user.selected_calendar_id or 'primary'

    time_max = datetime.datetime(2026, 1, 1).isoformat() + 'Z'
    time_min = datetime.datetime(2020, 1, 1).isoformat() + 'Z' 

    print(f"Obteniendo eventos de {user.email} (Calendario: {calendar_id}) anteriores a 2026...")
    
    events_result = cal_service.service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        singleEvents=True,
        orderBy='startTime',
        maxResults=2500
    ).execute()

    items = events_result.get('items', [])
    
    # Vamos a ordenarlos del más reciente (fines de 2025) hacia atrás,
    # ya que suele ser más fácil empezar por los más recientes.
    items = sorted(items, key=lambda x: x.get('start', {}).get('dateTime', x.get('start', {}).get('date')), reverse=True)

    events = []
    for item in items:
        # Solo eventos que parezcan entrenamientos. Por cómo los tienes en la app, 
        # podríamos filtrar si no tienen nada de descripción, pero guardaremos 
        # todos los que tengan pinta de entreno (o todos por si acaso)
        title = item.get('summary', '')
        desc = item.get('description', '')
        
        # Guardaremos todos pero tal vez puedes saltar los que no sean del gym.
        events.append({
            'id': item.get('id'),
            'date': item.get('start', {}).get('dateTime', item.get('start', {}).get('date')),
            'title': title,
            'description': desc
        })

    with open('old_events.json', 'w', encoding='utf-8') as f:
        json.dump(events, f, ensure_ascii=False, indent=2)

    print(f"Guardados {len(events)} eventos históricos en old_events.json")

if __name__ == '__main__':
    fetch_and_save()
