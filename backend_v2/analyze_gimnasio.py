"""
Non-interactive script: fetches all events from the 'Gimnasio' Google Calendar,
runs the current parser on each one, and prints a structured analysis.
"""
import sys
import os
import json
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from app.database import SessionLocal
from app.models import UserTokens, Muscle
from app.routers.workouts import get_google_credentials
from app.calendar_utils import parse_calendar_description
from googleapiclient.discovery import build


def main():
    db = SessionLocal()

    user_tokens = db.query(UserTokens).filter(UserTokens.google_access_token.isnot(None)).first()
    if not user_tokens:
        print("No user with Google Calendar connected.")
        return

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("Could not get valid Google credentials.")
        return

    service = build('calendar', 'v3', credentials=creds)

    # Find the "Gimnasio" calendar
    calendars_result = service.calendarList().list().execute()
    gimnasio_id = None
    print("Available calendars:")
    for cal in calendars_result.get('items', []):
        print(f"  - {cal['summary']} ({cal['id']})")
        if cal['summary'].lower() == 'gimnasio':
            gimnasio_id = cal['id']

    if not gimnasio_id:
        print("\n'Gimnasio' calendar not found. Trying primary...")
        gimnasio_id = 'primary'
    else:
        print(f"\nUsing calendar: Gimnasio ({gimnasio_id})")

    # Fetch all events from the last 5 years
    time_min = (datetime.utcnow() - timedelta(days=365 * 5)).isoformat() + "Z"
    print(f"\nFetching events since {time_min[:10]}...")

    events = []
    page_token = None
    while True:
        result = service.events().list(
            calendarId=gimnasio_id,
            timeMin=time_min,
            singleEvents=True,
            orderBy='startTime',
            pageToken=page_token,
            maxResults=2500
        ).execute()
        events.extend(result.get('items', []))
        page_token = result.get('nextPageToken')
        if not page_token:
            break

    print(f"Total events fetched: {len(events)}\n")

    muscle_map = {m.name.lower(): m.id for m in db.query(Muscle).all()}
    print(f"Muscles in DB: {sorted(muscle_map.keys())}\n")

    # Analyse every event
    results = []
    for event in events:
        desc = event.get('description', '') or ''
        summary = event.get('summary', '')
        date = event.get('start', {}).get('dateTime', event.get('start', {}).get('date', ''))[:10]

        parsed = parse_calendar_description(desc, muscle_map, title=summary)

        # Determine event type
        is_fitbit_auto = "Actividad sincronizada automáticamente desde Fitbit" in desc
        is_gymhub = "[GymHub]" in desc
        has_workout_fmt = " - " in desc and any(m in desc.lower() for m in muscle_map)
        is_leg_day = "pierna" in summary.lower()

        results.append({
            "date": date,
            "summary": summary,
            "is_fitbit_auto": is_fitbit_auto,
            "is_gymhub": is_gymhub,
            "has_workout_fmt": has_workout_fmt,
            "is_leg_day": is_leg_day,
            "desc_len": len(desc),
            "n_sets": len(parsed['sets']),
            "has_fitbit": parsed['fitbit'] is not None,
            "sets": parsed['sets'],
            "raw_description": desc,
        })

    # ── Summary stats ──────────────────────────────────────────────
    print("=" * 70)
    print("SUMMARY STATS")
    print("=" * 70)
    total = len(results)
    fitbit_auto = sum(1 for r in results if r['is_fitbit_auto'])
    gymhub = sum(1 for r in results if r['is_gymhub'])
    empty_desc = sum(1 for r in results if r['desc_len'] == 0)
    zero_sets = sum(1 for r in results if r['n_sets'] == 0 and not r['is_fitbit_auto'])
    print(f"  Total events          : {total}")
    print(f"  [GymHub] tagged       : {gymhub}")
    print(f"  Fitbit auto-sync      : {fitbit_auto}")
    print(f"  Empty description     : {empty_desc}")
    print(f"  Non-Fitbit / 0 sets   : {zero_sets}")

    # ── Potential filter issues ──────────────────────────────────────
    print("\n" + "=" * 70)
    print("POTENTIAL FILTER ISSUES")
    print("=" * 70)

    # 1. Fitbit-only events that generated exercise sets
    print("\n[1] Fitbit-auto events that produced exercise sets (should be 0):")
    for r in results:
        if r['is_fitbit_auto'] and r['n_sets'] > 0:
            print(f"  {r['date']} | {r['summary']} | {r['n_sets']} sets")
            for s in r['sets']:
                print(f"      {s['muscle_name']} - {s['exercise_name']} : {s['value']}{s['measurement']}")

    # 2. Events with empty description that would still be picked up by filter
    print("\n[2] Events with no description caught by current filter:")
    for r in results:
        if r['desc_len'] == 0 and (r['is_leg_day'] or r['has_workout_fmt']):
            print(f"  {r['date']} | {r['summary']}")

    # 3. Non-Fitbit events that produced 0 sets (wasted processing)
    print("\n[3] Non-Fitbit events that produced 0 sets:")
    for r in results:
        if not r['is_fitbit_auto'] and r['n_sets'] == 0 and r['desc_len'] > 0:
            print(f"  {r['date']} | {r['summary']}")
            print(f"    desc: {r['raw_description'][:120].replace(chr(10), ' | ')}")

    # 4. Lines without a valid muscle prefix being parsed (lines with unknown muscles)
    print("\n[4] Sets with muscle names NOT in DB (unrecognised muscle tokens):")
    seen = set()
    for r in results:
        for s in r['sets']:
            m = s['muscle_name'].lower()
            if m not in muscle_map and m != 'pierna' and m not in seen:
                seen.add(m)
                print(f"  muscle='{m}'  exercise='{s['exercise_name']}'  (from: {r['summary']} {r['date']})")

    # 5. Sets where value looks malformed (x4, text, etc.)
    print("\n[5] Sets with potentially malformed values (non-numeric / set-count prefix):")
    import re
    bad_val_pattern = re.compile(r'x\d+|^\D')
    for r in results:
        for s in r['sets']:
            combined = f"{s['value']}{s['measurement']}"
            if bad_val_pattern.search(s['value']) or (not s['value'].replace('.', '').replace(',', '').replace("'", '').replace('-', '').isdigit() and s['value'] not in ['0']):
                print(f"  {r['date']} | {r['summary']} | {s['muscle_name']} - {s['exercise_name']} : {combined}")

    # 6. Lines with '~' that are silently skipped
    print("\n[6] Events containing '~' (currently skipped silently):")
    for r in results:
        if '~' in r['raw_description']:
            tilde_lines = [l for l in r['raw_description'].split('\n') if '~' in l]
            print(f"  {r['date']} | {r['summary']}")
            for l in tilde_lines:
                print(f"    '{l.strip()}'")

    # 7. Duplicate exercise sets (same muscle+exercise appears more than once as completed)
    print("\n[7] Events where the same exercise appears as both completed and not:")
    for r in results:
        completed = set()
        not_completed = set()
        for s in r['sets']:
            key = (s['muscle_name'], s['exercise_name'])
            if s['is_completed']:
                completed.add(key)
            else:
                not_completed.add(key)
        overlap = completed & not_completed
        if overlap:
            print(f"  {r['date']} | {r['summary']}")
            for key in overlap:
                print(f"    {key[0]} - {key[1]}")

    # 8. Full dump for manual inspection
    print("\n" + "=" * 70)
    print("FULL PARSED OUTPUT PER EVENT")
    print("=" * 70)
    for r in results:
        tag = "[FITBIT]" if r['is_fitbit_auto'] else ("[GymHub]" if r['is_gymhub'] else "[raw]")
        print(f"\n{r['date']} | {tag} {r['summary']} | {r['n_sets']} sets | fitbit={'yes' if r['has_fitbit'] else 'no'}")
        if r['n_sets'] == 0:
            print("  (no sets parsed)")
        for s in r['sets']:
            status = "✅" if s['is_completed'] else "  "
            print(f"  {status} {s['muscle_name']} - {s['exercise_name']} : {s['value']}{s['measurement']}")

    db.close()


if __name__ == '__main__':
    main()
