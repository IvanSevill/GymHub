import sys
import os

# Mock the structures we've seen
activity_with_nested_azm = {
    "activeZoneMinutes": {
        "fatBurnMinutes": 10,
        "cardioMinutes": 20,
        "peakMinutes": 5
    }
}

activity_with_flat_azm = {
    "fatBurnMinutes": 15,
    "cardioMinutes": 25,
    "peakMinutes": 10
}

# Add a case with both (should prefer nested if it exists and has keys)
activity_with_both = {
    "activeZoneMinutes": {
        "fatBurnMinutes": 2,
        "cardioMinutes": 3,
        "peakMinutes": 4
    },
    "fatBurnMinutes": 100,
    "cardioMinutes": 200,
    "peakMinutes": 300
}

def extract_azm(activity_data: dict) -> dict:
    """
    Extracts Active Zone Minutes from Fitbit activity data.
    Handles both flat and nested structures.
    """
    azm = activity_data.get("activeZoneMinutes", {})
    
    # If it's a list or doesn't have the expected keys, try flat structure
    if not isinstance(azm, dict) or not any(k in azm for k in ["fatBurnMinutes", "cardioMinutes", "peakMinutes"]):
        return {
            "fatBurnMinutes": activity_data.get("fatBurnMinutes", 0),
            "cardioMinutes": activity_data.get("cardioMinutes", 0),
            "peakMinutes": activity_data.get("peakMinutes", 0)
        }
    
    return azm

# Test Nested
res1 = extract_azm(activity_with_nested_azm)
print(f"Nested Test: {res1}")
assert res1["fatBurnMinutes"] == 10

# Test Flat
res2 = extract_azm(activity_with_flat_azm)
print(f"Flat Test: {res2}")
assert res2["fatBurnMinutes"] == 15

# Test Both
res3 = extract_azm(activity_with_both)
print(f"Both Test: {res3}")
assert res3["fatBurnMinutes"] == 2

print("All tests passed!")
