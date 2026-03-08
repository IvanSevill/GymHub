import requests
import json

base_url = "http://localhost:8000/api/v1"
email = "ivansevillano2005@gmail.com"

response = requests.get(f"{base_url}/workouts?user_email={email}")
if response.status_code == 200:
    workouts = response.json()
    print(f"Status: 200, Count: {len(workouts)}")
    if len(workouts) > 0:
        print("First workout sample:")
        print(json.dumps(workouts[0], indent=2))
        
        # Check March workouts specifically
        march_workouts = [w for w in workouts if w['date'].startswith('2026-03')]
        print(f"March 2026 workouts in API response: {len(march_workouts)}")
        for mw in march_workouts:
            print(f"- {mw['title']} on {mw['date']}")
else:
    print(f"Error: {response.status_code}, {response.text}")
