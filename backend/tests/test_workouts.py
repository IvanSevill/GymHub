from unittest.mock import patch

import pytest

from app import models
from app.routers.workouts import _expand_set_values


# ---------------------------------------------------------------------------
# Unit tests: _expand_set_values (one weight per ExerciseSet row)
# ---------------------------------------------------------------------------


def test_expand_single_value():
    assert _expand_set_values("12") == ["12"]


def test_expand_dash_range():
    # "12-15" becomes two separate weights / rows
    assert _expand_set_values("12-15") == ["12", "15"]


def test_expand_slash_range():
    assert _expand_set_values("45/40") == ["45", "40"]


def test_expand_decimal_comma_single():
    # A single decimal value with comma is not a range and stays intact
    assert _expand_set_values("42,5") == ["42,5"]


def test_expand_non_numeric():
    assert _expand_set_values("bodyweight") == ["bodyweight"]


def test_expand_empty():
    assert _expand_set_values("") == [""]


@pytest.mark.anyio
async def test_list_workouts_empty(client, auth_headers):
    resp = await client.get("/workouts", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_list_workouts_requires_auth(client):
    resp = await client.get("/workouts")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_create_workout(client, auth_headers, sample_exercise):
    resp = await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Pecho",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:30:00",
            "exercise_sets": [
                {
                    "exercise_id": sample_exercise.id,
                    "value": "50",
                    "measurement": "kg",
                    "is_completed": True,
                }
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Pecho"
    assert len(data["exercise_sets"]) == 1
    assert data["exercise_sets"][0]["value"] == "50"
    assert data["exercise_sets"][0]["is_completed"] is True
    assert "id" in data


@pytest.mark.anyio
async def test_create_workout_no_auth(client, sample_exercise):
    resp = await client.post(
        "/workouts",
        json={
            "title": "Pecho",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_list_workouts_returns_created(client, auth_headers, sample_exercise):
    await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Espalda",
            "start_time": "2026-05-10T09:00:00",
            "end_time": "2026-05-10T10:00:00",
            "exercise_sets": [],
        },
    )
    resp = await client.get("/workouts", headers=auth_headers)
    assert resp.status_code == 200
    titles = [w["title"] for w in resp.json()]
    assert "Espalda" in titles


@pytest.mark.anyio
async def test_list_workouts_date_filter(client, auth_headers):
    await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Enero",
            "start_time": "2026-01-15T10:00:00",
            "end_time": "2026-01-15T11:00:00",
            "exercise_sets": [],
        },
    )
    await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Marzo",
            "start_time": "2026-03-15T10:00:00",
            "end_time": "2026-03-15T11:00:00",
            "exercise_sets": [],
        },
    )

    resp = await client.get(
        "/workouts",
        headers=auth_headers,
        params={"start_date": "2026-01-01T00:00:00", "end_date": "2026-02-01T00:00:00"},
    )
    assert resp.status_code == 200
    titles = [w["title"] for w in resp.json()]
    assert "Enero" in titles
    assert "Marzo" not in titles


@pytest.mark.anyio
async def test_update_workout(client, auth_headers, sample_exercise):
    create_resp = await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Original",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    workout_id = create_resp.json()["id"]

    resp = await client.put(
        f"/workouts/{workout_id}",
        headers=auth_headers,
        json={
            "title": "Actualizado",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T12:00:00",
            "exercise_sets": [
                {
                    "exercise_id": sample_exercise.id,
                    "value": "60",
                    "measurement": "kg",
                    "is_completed": True,
                }
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Actualizado"
    assert len(data["exercise_sets"]) == 1
    assert data["exercise_sets"][0]["value"] == "60"


@pytest.mark.anyio
async def test_update_workout_not_found(client, auth_headers):
    resp = await client.put(
        "/workouts/nonexistent-id",
        headers=auth_headers,
        json={
            "title": "X",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_workout_wrong_user(client, auth_headers):
    create_resp = await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Usuario 1",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    workout_id = create_resp.json()["id"]

    await client.post(
        "/auth/register",
        json={"email": "user2@test.com", "name": "User 2", "password": "password123"},
    )
    login_resp = await client.post(
        "/auth/login",
        json={"email": "user2@test.com", "password": "password123"},
    )
    headers2 = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    resp = await client.put(
        f"/workouts/{workout_id}",
        headers=headers2,
        json={
            "title": "Intento",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_delete_workout(client, auth_headers):
    create_resp = await client.post(
        "/workouts",
        headers=auth_headers,
        json={
            "title": "Para Borrar",
            "start_time": "2026-05-01T10:00:00",
            "end_time": "2026-05-01T11:00:00",
            "exercise_sets": [],
        },
    )
    workout_id = create_resp.json()["id"]

    del_resp = await client.delete(f"/workouts/{workout_id}", headers=auth_headers)
    assert del_resp.status_code == 200

    list_resp = await client.get("/workouts", headers=auth_headers)
    ids = [w["id"] for w in list_resp.json()]
    assert workout_id not in ids


@pytest.mark.anyio
async def test_delete_workout_not_found(client, auth_headers):
    resp = await client.delete("/workouts/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_set_calendar(client, auth_headers):
    resp = await client.post(
        "/workouts/set-calendar",
        headers=auth_headers,
        params={"calendar_id": "test-cal-id-123"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["selected_calendar_id"] == "test-cal-id-123"


# ---------------------------------------------------------------------------
# Routes that require Google tokens — verify 401/400 without them
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_calendar_no_tokens(client, auth_headers):
    resp = await client.post(
        "/workouts/create-calendar",
        headers=auth_headers,
        params={"name": "Mi Calendario"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_list_calendars_no_tokens(client, auth_headers):
    resp = await client.get("/workouts/calendars", headers=auth_headers)
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_reformat_last_no_tokens(client, auth_headers):
    resp = await client.post("/workouts/reformat-last/5", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_reformat_all_no_tokens(client, root_headers):
    resp = await client.post("/workouts/reformat-all", headers=root_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_sync_all_no_tokens(client, auth_headers):
    resp = await client.get("/workouts/sync-all", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_test_parse_no_tokens(client, auth_headers):
    resp = await client.get("/workouts/test-parse", headers=auth_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_sync_cardio_to_calendar_no_tokens(client, auth_headers):
    resp = await client.post(
        "/workouts/sync-cardio-to-calendar",
        headers=auth_headers,
        json={"workout_ids": []},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_cardio_pending_empty(client, auth_headers):
    resp = await client.get("/workouts/cardio-pending", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Create workout with calendar sync (mocked)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_workout_triggers_calendar_sync(client, auth_headers, db, sample_exercise):
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    tokens = models.UserTokens(
        user_id=user.id,
        selected_calendar_id="cal-123",
        google_access_token="fake-token",
    )
    db.add(tokens)
    db.commit()

    with patch(
        "app.routers.workouts.update_google_calendar_event", return_value="fake-event-id"
    ) as mock_sync:
        resp = await client.post(
            "/workouts",
            headers=auth_headers,
            json={
                "title": "Con Calendario",
                "start_time": "2026-05-15T10:00:00",
                "end_time": "2026-05-15T11:00:00",
                "exercise_sets": [
                    {
                        "exercise_id": sample_exercise.id,
                        "value": "70",
                        "measurement": "kg",
                        "is_completed": True,
                    }
                ],
            },
        )
    assert resp.status_code == 200
    mock_sync.assert_called_once()


# ---------------------------------------------------------------------------
# GET workouts with muscle filter
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_list_workouts_multiple(client, auth_headers):
    for i in range(3):
        await client.post(
            "/workouts",
            headers=auth_headers,
            json={
                "title": f"Sesión {i}",
                "start_time": f"2026-05-{10 + i:02d}T10:00:00",
                "end_time": f"2026-05-{10 + i:02d}T11:00:00",
                "exercise_sets": [],
            },
        )
    resp = await client.get("/workouts", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 3
