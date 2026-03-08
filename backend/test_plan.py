import requests
import json

URL = "http://localhost:8000/api/v1/calendar/create-template"
PAYLOAD = {
    "user_email": "ivansevillano2005@gmail.com",
    "title": "Test Plan",
    "muscles": ["Pecho"],
    "date": "2026-03-08",
    "start_hour": 10,
    "start_minute": 00,
    "end_hour": 11,
    "end_minute": 00
}

try:
    response = requests.post(URL, json=PAYLOAD)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
