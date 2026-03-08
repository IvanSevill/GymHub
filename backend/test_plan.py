import requests
import json

base_url = "http://localhost:8000/api/v1"
email = "ivansevillano2005@gmail.com"

payload = {
    "user_email": email,
    "title": "Pecho",
    "muscles": ["Pecho"],
    "date": "2026-03-20",
    "start_hour": 10,
    "start_minute": 0,
    "end_hour": 11,
    "end_minute": 30
}

response = requests.post(f"{base_url}/calendar/create-template", json=payload)
print(f"Status: {response.status_code}")
print(response.text)
