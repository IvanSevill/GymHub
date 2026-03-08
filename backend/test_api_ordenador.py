import requests
import json

base_url = "http://localhost:8000/api/v1"
email = "ivansevillano2005.ordenador@gmail.com"

response = requests.get(f"{base_url}/workouts?user_email={email}")
if response.status_code == 200:
    workouts = response.json()
    print(f"Status: 200, Count: {len(workouts)}")
    for mw in workouts:
        print(f"- {mw['title']} on {mw['date']} ({mw['source']})")
else:
    print(f"Error: {response.status_code}, {response.text}")
