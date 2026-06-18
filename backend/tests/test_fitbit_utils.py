"""Tests for pure utility functions in fitbit_utils.py — no HTTP calls needed."""

from app.fitbit_utils import extract_azm


def test_extract_azm_v11_format():
    activity = {
        "activeZoneMinutes": {
            "minutesInHeartRateZones": [
                {"type": "FAT_BURN", "minutes": 10},
                {"type": "CARDIO", "minutes": 25},
                {"type": "PEAK", "minutes": 5},
            ]
        }
    }
    result = extract_azm(activity)
    assert result["fatBurnMinutes"] == 10
    assert result["cardioMinutes"] == 25
    assert result["peakMinutes"] == 5


def test_extract_azm_legacy_format():
    activity = {
        "activeZoneMinutes": {
            "fatBurnMinutes": 8,
            "cardioMinutes": 20,
            "peakMinutes": 3,
        }
    }
    result = extract_azm(activity)
    assert result["fatBurnMinutes"] == 8
    assert result["cardioMinutes"] == 20
    assert result["peakMinutes"] == 3


def test_extract_azm_flat_format():
    activity = {
        "fatBurnMinutes": 6,
        "cardioMinutes": 15,
        "peakMinutes": 2,
    }
    result = extract_azm(activity)
    assert result["fatBurnMinutes"] == 6
    assert result["cardioMinutes"] == 15
    assert result["peakMinutes"] == 2


def test_extract_azm_empty():
    result = extract_azm({})
    assert result == {"fatBurnMinutes": 0, "cardioMinutes": 0, "peakMinutes": 0}


def test_extract_azm_partial_zones():
    activity = {
        "activeZoneMinutes": {
            "minutesInHeartRateZones": [
                {"type": "CARDIO", "minutes": 30},
            ]
        }
    }
    result = extract_azm(activity)
    assert result["cardioMinutes"] == 30
    assert result["fatBurnMinutes"] == 0
    assert result["peakMinutes"] == 0
