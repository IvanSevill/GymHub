import sys
import os
import json
from datetime import datetime, timedelta

# Add the backend_v2 directory to the path so we can import the app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import UserTokens, Muscle
from app.routers.workouts import get_google_credentials
from app.calendar_utils import parse_calendar_description
from googleapiclient.discovery import build

def main():
    db = SessionLocal()
    
    # Get the first user that has connected Google Calendar
    user_tokens = db.query(UserTokens).filter(UserTokens.google_access_token.isnot(None)).first()
    if not user_tokens:
        print("❌ No user found with Google Calendar connected.")
        print("Please log into the web app and connect your Google Calendar in Settings first.")
        return

    # Fetch Google credentials
    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("❌ Could not get valid Google credentials. Try reconnecting in the web UI.")
        return

    service = build('calendar', 'v3', credentials=creds)
    calendar_id = user_tokens.selected_calendar_id or 'primary'
    
    # Fetch ALL events (using a very old timeMin like 5 years ago)
    time_min_dt = datetime.utcnow() - timedelta(days=365 * 5)
    time_min = time_min_dt.isoformat() + "Z"
    
    print(f"Fetching ALL calendar events from the last 5 years for calendar: {calendar_id}...")
    
    events = []
    page_token = None
    try:
        while True:
            events_result = service.events().list(
                calendarId=calendar_id, timeMin=time_min,
                singleEvents=True, orderBy='startTime',
                pageToken=page_token
            ).execute()
            events.extend(events_result.get('items', []))
            page_token = events_result.get('nextPageToken')
            if not page_token:
                break
    except Exception as e:
        print(f"Error fetching from Google Calendar API: {e}")
        return

    # Prepare muscle map for parser
    muscle_map = {m.name.lower(): m.id for m in db.query(Muscle).all()}
    
    feedback_file = "parser_feedback.json"
    feedbacks = []
    reviewed_event_ids = set()
    
    # Load existing feedback if the file already exists
    if os.path.exists(feedback_file):
        with open(feedback_file, 'r', encoding='utf-8') as f:
            try:
                feedbacks = json.load(f)
                for fb in feedbacks:
                    if "event_id" in fb:
                        reviewed_event_ids.add(fb["event_id"])
            except json.JSONDecodeError:
                pass

    # Filter events to only GymHub ones that haven't been reviewed yet
    pending_events = []
    for event in events:
        if event.get('id') in reviewed_event_ids:
            continue
            
        desc = event.get('description', '')
        summary = event.get('summary', 'Workout')
        
        is_gymhub_tagged = "[GymHub]" in desc or "[gymhub]" in desc.lower()
        has_workout_format = " - " in desc and any(m in desc.lower() for m in muscle_map.keys())
        is_leg_day = "pierna" in summary.lower()
        
        if is_gymhub_tagged or has_workout_format or is_leg_day:
            pending_events.append(event)

    total_pending = len(pending_events)

    print(f"\n✅ Found {total_pending} NEW GymHub events to review. (Skipping {len(reviewed_event_ids)} already reviewed)")
    if total_pending == 0:
        print("🎉 You have reviewed all events! Check your feedbacks or run standardization.")
        return

    print("\n" + "="*60)
    print("                 PARSER EVALUATION TOOL")
    print("="*60)
    print("Instructions:")
    print("1. Review the Raw Description vs Parsed Result.")
    print("2. If it's correct, just press [Enter] to go to the next one (it will be remembered!).")
    print("3. If it's wrong, type what the correct values should be.")
    print("4. Type 'q' to save and quit at any time.")
    print("="*60 + "\n")

    processed = 0

    for i, event in enumerate(pending_events, 1):
        desc = event.get('description', '')
        summary = event.get('summary', 'Workout')
        event_id = event.get('id')
        
        sync_result = parse_calendar_description(desc, muscle_map, title=summary)
        
        print(f"📅 EVENT [{i}/{total_pending}]: {summary}  [{event.get('start', {}).get('dateTime', event.get('start', {}).get('date'))}]")
        print("-" * 40)
        print("RAW DESCRIPTION:")
        print(desc if desc else "<Empty Description>")
        print("-" * 40)
        
        print("PARSED RESULT:")
        if sync_result['fitbit']:
            fb = sync_result['fitbit']
            print(f"  🏃 Fitbit: {fb.get('activity_name', 'Activity')} | {fb.get('calories', 0)} kcal | {int(fb.get('duration_ms', 0)/60000)} min")
        else:
            print("  🏃 Fitbit: No Data")
            
        print(f"  🏋️ Exercises ({len(sync_result['sets'])} sets total):")
        if not sync_result['sets']:
            print("      No exercises parsed.")
            
        # Group sets by exercise so we see "20-15kg" instead of multiple lines
        grouped_sets = {}
        for s in sync_result['sets']:
            key = (s['muscle_name'], s['exercise_name'])
            if key not in grouped_sets:
                grouped_sets[key] = {"completed": s['is_completed'], "measurements": {}}
            
            if s['is_completed']:
                grouped_sets[key]["completed"] = True
                
            meas = s['measurement']
            if meas not in grouped_sets[key]["measurements"]:
                grouped_sets[key]["measurements"][meas] = []
            grouped_sets[key]["measurements"][meas].append(s['value'])

        display_sets = []
        for (muscle, ex), data in grouped_sets.items():
            status = "✅" if data["completed"] else "  "
            meas_str = " ".join([f"{'-'.join(vals)}{m}" for m, vals in data["measurements"].items()])
            line = f"{status} {muscle.capitalize()} - {ex} : {meas_str}"
            display_sets.append(line)
            print(f"      {line}")
            
        print("-" * 40)
        
        comment = input("💬 Comment (Enter=OK, q=Quit): ").strip()
        
        if comment.lower() == 'q':
            print("\nStopping evaluation...")
            break
        
        feedbacks.append({
            "event_id": event_id,
            "event_summary": summary,
            "raw_description": desc,
            "parsed_exercises": display_sets, 
            "user_comment": comment if comment else "OK", # Empty means OK
            "timestamp": datetime.now().isoformat()
        })
        
        # Save progressively
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump(feedbacks, f, indent=2, ensure_ascii=False)
        
        if comment:
            print("✅ Comment saved!")
        else:
            print("⏩ Marked as OK.")
            
        print("\n" + "="*60 + "\n")
        processed += 1

    print(f"Done! You reviewed {processed} events this session.")
    if processed > 0:
        print(f"Saved your memory and comments to: backend_v2/{feedback_file}")

if __name__ == '__main__':
    main()
