import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
import json
import time

BASE_URL = "http://localhost:8000"
USER_EMAIL = "test@gymhub.com"

def test_backend():
    print(f"--- Testing GymHub Backend at {BASE_URL} ---")
    
    # 1. Health check
    try:
        resp = requests.get(f"{BASE_URL}/health")
        print(f"Health Check: {resp.status_code} - {resp.json()}")
    except Exception as e:
        print(f"Error connecting to backend: {e}")
        return

    # 2. Register user
    resp = requests.post(f"{BASE_URL}/users/register?email={USER_EMAIL}")
    print(f"Register User: {resp.status_code}")
    user_data = resp.json()
    print(f"Registered User: {user_data['email']}")

    # 3. Create workout
    workout_data = {
        "user_email": USER_EMAIL,
        "title": "Pecho y Triceps",
        "description": "✅ Press de banca (80kg) 12 reps\n✅ Press inclinado (60-70kg) 10 reps\n✅ Extensiones de triceps (30kg) (pr 35kg) 12 reps"
    }
    resp = requests.post(f"{BASE_URL}/workouts", json=workout_data)
    print(f"Create Workout: {resp.status_code}")
    if resp.status_code == 200:
        workout = resp.json()
        print(f"Created Workout: {workout['title']} with {len(workout['exercise_sets'])} sets.")
        for set_data in workout['exercise_sets']:
            print(f"  - {set_data['exercise_name']}: {set_data['weight_kg']}kg x {set_data.get('reps')} (PR: {set_data['is_pr']})")
    else:
        print(f"Error creating workout: {resp.text}")

    # 4. List workouts
    resp = requests.get(f"{BASE_URL}/workouts?user_email={USER_EMAIL}")
    print(f"List Workouts: {resp.status_code}")
    workouts = resp.json()
    print(f"Found {len(workouts)} workouts for {USER_EMAIL}")

    # 5. Manual sync (Mocked)
    resp = requests.post(f"{BASE_URL}/sync/manual?user_email={USER_EMAIL}")
    print(f"Manual Sync: {resp.status_code} - {resp.json()}")

if __name__ == "__main__":
    test_backend()
