import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sys
import datetime
import re
from sqlalchemy.orm import Session
from models import SessionLocal, User
from google_calendar import GoogleCalendarService

def fix_events():
    db = SessionLocal()
    user = db.query(User).filter(User.email.ilike("%ivan%")).first()
    if not user:
        user = db.query(User).first()
        
    if not user:
        print("Error: No se encontró ningún usuario.")
        sys.exit(1)
        
    cal_service = GoogleCalendarService(user, db)
    calendar_id = user.selected_calendar_id or 'primary'
    
    print("Obteniendo eventos de Google Calendar...")
    time_max = datetime.datetime(2026, 1, 1).isoformat() + 'Z'
    time_min = datetime.datetime(2020, 1, 1).isoformat() + 'Z'
    
    try:
        events_result = cal_service.service.events().list(
            calendarId=calendar_id,
            timeMin=time_min,
            timeMax=time_max,
            singleEvents=True,
            orderBy='startTime',
            maxResults=2500
        ).execute()
        
        items = events_result.get('items', [])
        print(f"¡Cargados {len(items)} eventos!")
        
        events_updated_count = 0
        
        for item in items:
            desc = item.get('description', '')
            if not desc:
                continue
                
            lines = desc.split('\n')
            new_lines = []
            changed = False
            
            for line in lines:
                line_str = line.strip()
                if not line_str.startswith("✅"):
                    new_lines.append(line_str)
                    continue
                    
                match = re.search(r'✅\s*(.*?)\s*-\s*(.*?)([\d\(].*)?$', line_str)
                if match:
                    muscle = match.group(1).strip()
                    exercise = match.group(2).strip()
                    weight = match.group(3).strip() if match.group(3) else ""
                    
                    new_muscle = muscle
                    new_exercise = exercise
                    
                    # Fix jalones mal categorizados
                    ex_lower = exercise.lower()
                    if 'jalon' in ex_lower or 'jalón' in ex_lower:
                        new_muscle = 'Espalda'
                        if ex_lower.startswith('espalda '):
                            new_exercise = exercise[8:].strip()
                            
                    # Fix "Press" como músculo
                    if muscle.lower() == 'press':
                        new_muscle = 'Pecho'
                        
                    if new_muscle != muscle or new_exercise != exercise:
                        spacer = " " if weight else ""
                        new_line = f"✅{new_muscle} - {new_exercise}{spacer}{weight}".strip()
                        new_lines.append(new_line)
                        changed = True
                    else:
                        new_lines.append(line_str)
                else:
                    new_lines.append(line_str)
                    
            if changed:
                new_desc = '\n'.join(new_lines)
                try:
                    cal_service.update_event(
                        event_id=item['id'],
                        title=item.get('summary', ''),
                        description=new_desc,
                        calendar_id=calendar_id
                    )
                    events_updated_count += 1
                    print(f"Corregido evento {item.get('start', {}).get('date', item.get('start', {}).get('dateTime'))}")
                except Exception as e:
                    print(f"❌ Error al actualizar {item.get('start', {}).get('date', '')}: {e}")
                    
        print(f"✅ ¡Completado! Se modificaron {events_updated_count} eventos.")
        
    except Exception as e:
        print(f"Error al cargar eventos: {e}")

if __name__ == "__main__":
    fix_events()
