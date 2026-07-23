"""Tests for fitbit_utils.py — pure functions and HTTP-dependent functions (mocked)."""
import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app import models
from app.fitbit_utils import (
    _fitbit_get,
    FitbitSyncFailure,
    extract_azm,
    get_fitbit_activities_range,
    get_fitbit_route,
    probe_has_gps,
    refresh_fitbit_token,
)


def _make_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session()


def _new_tokens(db, *, fitbit_access="tok-access", fitbit_refresh="tok-refresh"):
    user = models.User(id=str(uuid.uuid4()), email=f"fbu{uuid.uuid4().hex[:6]}@test.com", name="U")
    db.add(user)
    db.flush()
    tokens = models.UserTokens(
        user_id=user.id,
        fitbit_access_token=fitbit_access,
        fitbit_refresh_token=fitbit_refresh,
    )
    db.add(tokens)
    db.commit()
    return tokens


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


# ---------------------------------------------------------------------------
# refresh_fitbit_token
# ---------------------------------------------------------------------------


def test_refresh_fitbit_token_no_refresh_token():
    db = _make_db()
    tokens = _new_tokens(db, fitbit_refresh=None)
    tokens.fitbit_refresh_token = None
    db.commit()
    result = refresh_fitbit_token(db, tokens)
    assert result is None


def test_refresh_fitbit_token_success():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "access_token": "new-access",
        "refresh_token": "new-refresh",
    }

    with patch("app.fitbit_utils.requests.post", return_value=mock_resp):
        result = refresh_fitbit_token(db, tokens)

    assert result == "new-access"
    db.expire_all()
    assert tokens.fitbit_access_token == "new-access"


def test_refresh_fitbit_token_failure():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "invalid_grant"

    with patch("app.fitbit_utils.requests.post", return_value=mock_resp):
        result = refresh_fitbit_token(db, tokens)

    assert result is None


def test_refresh_fitbit_token_invalid_grant_clears_credentials():
    """A permanently rejected refresh token (400 invalid_grant) clears the
    stored credentials so the connection flips to 'disconnected'."""
    db = _make_db()
    tokens = _new_tokens(db)
    tokens.fitbit_id = "fb-user-123"
    db.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = '{"errors":[{"errorType":"invalid_grant"}],"success":false}'

    with patch("app.fitbit_utils.requests.post", return_value=mock_resp):
        result = refresh_fitbit_token(db, tokens)

    assert result is None
    db.expire_all()
    assert tokens.fitbit_id is None
    assert tokens.fitbit_access_token is None
    assert tokens.fitbit_refresh_token is None


def test_refresh_fitbit_token_transient_error_keeps_credentials():
    """A transient server error (5xx) must NOT drop the Fitbit connection."""
    db = _make_db()
    tokens = _new_tokens(db)
    tokens.fitbit_id = "fb-user-123"
    db.commit()

    mock_resp = MagicMock()
    mock_resp.status_code = 503
    mock_resp.text = "Service Unavailable"

    with patch("app.fitbit_utils.requests.post", return_value=mock_resp):
        result = refresh_fitbit_token(db, tokens)

    assert result is None
    db.expire_all()
    assert tokens.fitbit_id == "fb-user-123"
    assert tokens.fitbit_refresh_token == "tok-refresh"


def test_refresh_fitbit_token_reuses_concurrently_rotated_token():
    """If a concurrent request already rotated the (single-use) refresh token,
    this call must reuse the freshly-minted access token from the DB instead of
    re-spending the consumed refresh token and getting invalid_grant."""
    db = _make_db()
    tokens = _new_tokens(db)  # access "tok-access", refresh "tok-refresh"

    # Simulate the race winner: the DB row already holds a rotated token pair,
    # while our in-memory object still carries the old refresh token. Raw SQL so
    # the ORM instance keeps its stale in-memory value (as it would across
    # separate request sessions).
    db.execute(
        text(
            "UPDATE user_tokens SET fitbit_access_token='winner-access', "
            "fitbit_refresh_token='winner-refresh' WHERE id=:id"
        ),
        {"id": tokens.id},
    )
    assert tokens.fitbit_refresh_token == "tok-refresh"  # in-memory still stale

    with patch("app.fitbit_utils.requests.post") as mock_post:
        result = refresh_fitbit_token(db, tokens)

    assert result == "winner-access"
    mock_post.assert_not_called()  # no double-spend of the rotated refresh token
    assert tokens.fitbit_access_token == "winner-access"
    assert tokens.fitbit_refresh_token == "winner-refresh"


# ---------------------------------------------------------------------------
# _fitbit_get
# ---------------------------------------------------------------------------


def test_fitbit_get_no_access_token():
    db = _make_db()
    tokens = _new_tokens(db, fitbit_access=None)
    tokens.fitbit_access_token = None
    db.commit()
    result = _fitbit_get(db, tokens, "https://api.fitbit.com/test")
    assert result is None


def test_fitbit_get_success():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("app.fitbit_utils.requests.get", return_value=mock_resp):
        result = _fitbit_get(db, tokens, "https://api.fitbit.com/test")

    assert result is mock_resp


def test_fitbit_get_401_retries_with_refresh():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_401 = MagicMock()
    mock_401.status_code = 401
    mock_200 = MagicMock()
    mock_200.status_code = 200

    with (
        patch("app.fitbit_utils.requests.get", side_effect=[mock_401, mock_200]),
        patch("app.fitbit_utils.refresh_fitbit_token", return_value="new-token"),
    ):
        result = _fitbit_get(db, tokens, "https://api.fitbit.com/test")

    assert result is mock_200


def test_fitbit_get_401_refresh_fails_returns_none():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_401 = MagicMock()
    mock_401.status_code = 401

    with (
        patch("app.fitbit_utils.requests.get", return_value=mock_401),
        patch("app.fitbit_utils.refresh_fitbit_token", return_value=None),
    ):
        result = _fitbit_get(db, tokens, "https://api.fitbit.com/test")

    assert result is None


def test_fitbit_get_non_200_returns_none():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_resp = MagicMock()
    mock_resp.status_code = 500

    with patch("app.fitbit_utils.requests.get", return_value=mock_resp):
        result = _fitbit_get(db, tokens, "https://api.fitbit.com/test")

    assert result is None


@pytest.mark.parametrize(
    ("error", "code", "status"),
    [
        (requests.ConnectionError("token-secret"), "FITBIT_API_UNAVAILABLE", 503),
        (requests.Timeout("token-secret"), "FITBIT_API_TIMEOUT", 504),
    ],
)
def test_fitbit_get_strict_classifies_transport_errors(error, code, status):
    db = _make_db()
    tokens = _new_tokens(db)
    with (
        patch("app.fitbit_utils.requests.get", side_effect=error),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        _fitbit_get(db, tokens, "https://api.fitbit.com/test", strict=True)

    assert raised.value.code == code
    assert raised.value.status_code == status
    assert "token-secret" not in str(raised.value)


@pytest.mark.parametrize(
    ("provider_status", "code", "status"),
    [
        (429, "FITBIT_API_RATE_LIMITED", 503),
        (500, "FITBIT_API_UNAVAILABLE", 503),
        (403, "FITBIT_API_REJECTED", 502),
    ],
)
def test_fitbit_get_strict_classifies_provider_status(provider_status, code, status):
    db = _make_db()
    tokens = _new_tokens(db)
    response = MagicMock(status_code=provider_status, text="private provider body")
    with (
        patch("app.fitbit_utils.requests.get", return_value=response),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        _fitbit_get(db, tokens, "https://api.fitbit.com/test", strict=True)

    assert raised.value.code == code
    assert raised.value.status_code == status
    assert raised.value.provider_status == provider_status
    assert "private provider body" not in str(raised.value)


def test_fitbit_get_strict_second_401_requires_reauthorization():
    db = _make_db()
    tokens = _new_tokens(db)
    unauthorized = MagicMock(status_code=401)
    with (
        patch("app.fitbit_utils.requests.get", side_effect=[unauthorized, unauthorized]),
        patch("app.fitbit_utils.refresh_fitbit_token", return_value="rotated-token"),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        _fitbit_get(db, tokens, "https://api.fitbit.com/test", strict=True)

    assert raised.value.code == "FITBIT_REAUTH_REQUIRED"
    assert raised.value.status_code == 424


@pytest.mark.parametrize(
    ("error", "code", "status"),
    [
        (requests.ConnectionError("refresh-secret"), "FITBIT_AUTH_UNAVAILABLE", 503),
        (requests.Timeout("refresh-secret"), "FITBIT_AUTH_TIMEOUT", 504),
    ],
)
def test_refresh_fitbit_token_strict_classifies_transport_errors(error, code, status):
    db = _make_db()
    tokens = _new_tokens(db)
    with (
        patch("app.fitbit_utils.requests.post", side_effect=error),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        refresh_fitbit_token(db, tokens, strict=True)

    assert raised.value.code == code
    assert raised.value.status_code == status
    assert tokens.fitbit_refresh_token == "tok-refresh"
    assert "refresh-secret" not in str(raised.value)


def test_refresh_fitbit_token_strict_invalid_grant_is_safe(caplog):
    db = _make_db()
    tokens = _new_tokens(db)
    response = MagicMock(status_code=400, text='{"error":"invalid_grant","token":"raw"}')
    response.json.return_value = {"error": "invalid_grant", "token": "raw"}
    with (
        patch("app.fitbit_utils.requests.post", return_value=response),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        refresh_fitbit_token(db, tokens, strict=True)

    assert raised.value.code == "FITBIT_REAUTH_REQUIRED"
    assert raised.value.status_code == 424
    assert tokens.fitbit_refresh_token is None
    assert "raw" not in caplog.text


def test_refresh_fitbit_token_strict_rejects_malformed_success():
    db = _make_db()
    tokens = _new_tokens(db)
    response = MagicMock(status_code=200)
    response.json.return_value = {"access_token": "missing-rotated-refresh"}
    with (
        patch("app.fitbit_utils.requests.post", return_value=response),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        refresh_fitbit_token(db, tokens, strict=True)

    assert raised.value.code == "FITBIT_RESPONSE_INVALID"


# ---------------------------------------------------------------------------
# get_fitbit_activities_range
# ---------------------------------------------------------------------------


def test_get_fitbit_activities_range_no_token():
    db = _make_db()
    tokens = _new_tokens(db, fitbit_access=None)
    tokens.fitbit_access_token = None
    db.commit()
    result = get_fitbit_activities_range(db, tokens, days=7)
    assert result == []


def test_get_fitbit_activities_range_success():
    db = _make_db()
    tokens = _new_tokens(db)
    first_start = datetime.utcnow() - timedelta(days=1)
    second_start = datetime.utcnow() - timedelta(days=2)

    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [
            {"startTime": f"{first_start.isoformat()}Z", "activityName": "Run"},
            {"startTime": f"{second_start.isoformat()}Z", "activityName": "Weights"},
        ]
    }

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activities_range(db, tokens, days=30)

    assert len(result) == 2


def test_get_fitbit_activities_range_strict_rejects_invalid_payload():
    db = _make_db()
    tokens = _new_tokens(db)
    response = MagicMock()
    response.json.return_value = {"unexpected": []}
    with (
        patch("app.fitbit_utils._fitbit_get", return_value=response),
        pytest.raises(FitbitSyncFailure) as raised,
    ):
        get_fitbit_activities_range(db, tokens, strict=True)

    assert raised.value.code == "FITBIT_RESPONSE_INVALID"


def test_get_fitbit_activities_range_strict_counts_malformed_activity():
    db = _make_db()
    tokens = _new_tokens(db)
    response = MagicMock()
    response.json.return_value = {"activities": [{"startTime": "invalid"}]}
    failures = []
    with patch("app.fitbit_utils._fitbit_get", return_value=response):
        result = get_fitbit_activities_range(
            db, tokens, strict=True, processing_failures=failures
        )

    assert result == []
    assert failures == ["FITBIT_ACTIVITY_PROCESSING_FAILED"]


# ---------------------------------------------------------------------------
# get_fitbit_route
# ---------------------------------------------------------------------------


def test_get_fitbit_route_empty_log_id():
    db = _make_db()
    tokens = _new_tokens(db)
    assert get_fitbit_route(db, tokens, "") == []


def test_get_fitbit_route_no_response():
    db = _make_db()
    tokens = _new_tokens(db)

    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        result = get_fitbit_route(db, tokens, "12345")

    assert result == []


def test_get_fitbit_route_parses_trackpoints():
    db = _make_db()
    tokens = _new_tokens(db)

    tcx_xml = """<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity>
      <Lap>
        <Track>
          <Trackpoint>
            <Position>
              <LatitudeDegrees>40.4168</LatitudeDegrees>
              <LongitudeDegrees>-3.7038</LongitudeDegrees>
            </Position>
            <AltitudeMeters>650.0</AltitudeMeters>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>"""

    mock_resp = MagicMock()
    mock_resp.text = tcx_xml

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_route(db, tokens, "12345")

    assert len(result) == 1
    assert abs(result[0]["lat"] - 40.4168) < 0.001
    assert result[0]["ele"] == 650.0


def test_get_fitbit_route_invalid_xml():
    db = _make_db()
    tokens = _new_tokens(db)

    mock_resp = MagicMock()
    mock_resp.text = "not-valid-xml"

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_route(db, tokens, "12345")

    assert result == []


# ---------------------------------------------------------------------------
# probe_has_gps
# ---------------------------------------------------------------------------


def test_probe_has_gps_empty_log_id():
    db = _make_db()
    tokens = _new_tokens(db)
    assert probe_has_gps(db, tokens, "") is False


def test_probe_has_gps_no_response():
    db = _make_db()
    tokens = _new_tokens(db)

    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert probe_has_gps(db, tokens, "12345") is False


def test_probe_has_gps_with_position():
    db = _make_db()
    tokens = _new_tokens(db)

    tcx = """<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity><Lap><Track>
    <Trackpoint><Position>
      <LatitudeDegrees>40.4</LatitudeDegrees>
      <LongitudeDegrees>-3.7</LongitudeDegrees>
    </Position></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>"""
    mock_resp = MagicMock()
    mock_resp.text = tcx

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        assert probe_has_gps(db, tokens, "12345") is True


def test_probe_has_gps_no_position():
    db = _make_db()
    tokens = _new_tokens(db)

    tcx = """<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity><Lap><Track>
    <Trackpoint></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>"""
    mock_resp = MagicMock()
    mock_resp.text = tcx

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        assert probe_has_gps(db, tokens, "12345") is False


def test_probe_has_gps_invalid_xml():
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.text = "not-xml"

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        assert probe_has_gps(db, tokens, "12345") is False


# ---------------------------------------------------------------------------
# get_fitbit_route — branch coverage (no Position, invalid coords)
# ---------------------------------------------------------------------------


def test_get_fitbit_route_trackpoint_no_position():
    """Trackpoints without Position are skipped."""
    db = _make_db()
    tokens = _new_tokens(db)

    tcx = """<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities><Activity><Lap><Track>
    <Trackpoint><AltitudeMeters>100</AltitudeMeters></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>"""
    mock_resp = MagicMock()
    mock_resp.text = tcx

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_route(db, tokens, "12345")

    assert result == []


# ---------------------------------------------------------------------------
# get_sleep_list
# ---------------------------------------------------------------------------


def test_get_sleep_list_no_response():
    from app.fitbit_utils import get_sleep_list
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert get_sleep_list(db, tokens, "2026-06-15") == []


def test_get_sleep_list_success():
    from app.fitbit_utils import get_sleep_list
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"sleep": [{"logId": 1, "dateOfSleep": "2026-06-14"}]}
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_sleep_list(db, tokens, "2026-06-15")
    assert len(result) == 1
    assert result[0]["logId"] == 1


# ---------------------------------------------------------------------------
# get_activity_time_series
# ---------------------------------------------------------------------------


def test_get_activity_time_series_no_response():
    from app.fitbit_utils import get_activity_time_series
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert get_activity_time_series(db, tokens, "steps", "2026-06-01", "2026-06-10") == []


def test_get_activity_time_series_success():
    from app.fitbit_utils import get_activity_time_series
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities-steps": [{"dateTime": "2026-06-01", "value": "8000"}]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_activity_time_series(db, tokens, "steps", "2026-06-01", "2026-06-01")
    assert len(result) == 1
    assert result[0]["value"] == "8000"


# ---------------------------------------------------------------------------
# get_resting_hr_time_series
# ---------------------------------------------------------------------------


def test_get_resting_hr_no_response():
    from app.fitbit_utils import get_resting_hr_time_series
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert get_resting_hr_time_series(db, tokens, "2026-06-01", "2026-06-10") == {}


def test_get_resting_hr_success():
    from app.fitbit_utils import get_resting_hr_time_series
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities-heart": [
            {"dateTime": "2026-06-01", "value": {"restingHeartRate": 58}},
            {"dateTime": "2026-06-02", "value": {}},  # no restingHeartRate → skipped
        ]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_resting_hr_time_series(db, tokens, "2026-06-01", "2026-06-02")
    assert result == {"2026-06-01": 58}


# ---------------------------------------------------------------------------
# get_sleep_for_date
# ---------------------------------------------------------------------------


def test_get_sleep_for_date_no_response():
    from app.fitbit_utils import get_sleep_for_date
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert get_sleep_for_date(db, tokens, "2026-06-01") == []


def test_get_sleep_for_date_success():
    from app.fitbit_utils import get_sleep_for_date
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"sleep": [{"logId": 999}]}
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_sleep_for_date(db, tokens, "2026-06-01")
    assert result[0]["logId"] == 999


# ---------------------------------------------------------------------------
# get_daily_activity
# ---------------------------------------------------------------------------


def test_get_daily_activity_no_response():
    from app.fitbit_utils import get_daily_activity
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        assert get_daily_activity(db, tokens, "2026-06-01") is None


def test_get_daily_activity_success():
    from app.fitbit_utils import get_daily_activity
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"summary": {"steps": 10000, "calories": 2200}}
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_daily_activity(db, tokens, "2026-06-01")
    assert result["steps"] == 10000


# ---------------------------------------------------------------------------
# get_fitbit_activity — matching and non-matching windows
# ---------------------------------------------------------------------------


def test_get_fitbit_activity_no_response():
    from app.fitbit_utils import get_fitbit_activity
    db = _make_db()
    tokens = _new_tokens(db)
    with patch("app.fitbit_utils._fitbit_get", return_value=None):
        result = get_fitbit_activity(db, tokens, datetime(2026, 6, 1, 10, 0), datetime(2026, 6, 1, 11, 0))
    assert result is None


def test_get_fitbit_activity_matching():
    from app.fitbit_utils import get_fitbit_activity
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [
            {
                "startTime": "2026-06-01T10:05:00Z",
                "duration": 3600000,
                "activityName": "Weights",
                "calories": 350,
            }
        ]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activity(db, tokens, datetime(2026, 6, 1, 10, 0), datetime(2026, 6, 1, 11, 0))
    assert result is not None
    assert result["activityName"] == "Weights"


def test_get_fitbit_activity_requires_weights_for_weights_workout():
    from app.fitbit_utils import get_fitbit_activity

    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [
            {
                "startTime": "2026-06-01T10:30:00Z",
                "duration": 1800000,
                "activityName": "Walk",
            },
            {
                "startTime": "2026-06-01T10:05:00Z",
                "duration": 3600000,
                "activityName": "Weights",
            },
        ]
    }

    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activity(
            db,
            tokens,
            datetime(2026, 6, 1, 10, 0),
            datetime(2026, 6, 1, 11, 0),
            required_activity_name="weights",
        )

    assert result is not None
    assert result["activityName"] == "Weights"


def test_get_fitbit_activity_no_match():
    from app.fitbit_utils import get_fitbit_activity
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [
            {"startTime": "2026-06-01T20:00:00Z", "duration": 1800000, "activityName": "Walk"}
        ]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activity(db, tokens, datetime(2026, 6, 1, 10, 0), datetime(2026, 6, 1, 11, 0))
    assert result is None


def test_get_fitbit_activity_invalid_start_time():
    from app.fitbit_utils import get_fitbit_activity
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [{"startTime": "invalid", "duration": 0, "activityName": "Run"}]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activity(db, tokens, datetime(2026, 6, 1, 10, 0), datetime(2026, 6, 1, 11, 0))
    assert result is None


# ---------------------------------------------------------------------------
# get_fitbit_activities_range — cutoff and exception branches
# ---------------------------------------------------------------------------


def test_get_fitbit_activities_range_cutoff():
    """Activity before the cutoff date breaks the loop."""
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [
            {"startTime": "2020-01-01T10:00:00Z", "activityName": "Run"},
        ]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activities_range(db, tokens, days=7)
    assert result == []  # activity is way before the 7-day window


def test_get_fitbit_activities_range_invalid_time():
    """Activities with invalid startTime are skipped via except."""
    db = _make_db()
    tokens = _new_tokens(db)
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "activities": [{"startTime": "bad-date", "activityName": "Run"}]
    }
    with patch("app.fitbit_utils._fitbit_get", return_value=mock_resp):
        result = get_fitbit_activities_range(db, tokens, days=30)
    assert result == []


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
