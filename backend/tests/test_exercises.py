import pytest
from datetime import datetime
from unittest.mock import AsyncMock, patch

from app import models


# ---------------------------------------------------------------------------
# Muscles
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_muscles_initializes_defaults(client):
    resp = await client.get("/muscles")
    assert resp.status_code == 200
    names = [m["name"] for m in resp.json()]
    for expected in ["pecho", "hombro", "triceps", "biceps", "espalda", "abdomen"]:
        assert expected in names
    assert len(names) >= 10


@pytest.mark.anyio
async def test_create_muscle_root(client, root_headers):
    resp = await client.post("/muscles", headers=root_headers, json={"name": "core"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "core"
    assert "id" in data


@pytest.mark.anyio
async def test_create_muscle_duplicate(client, root_headers):
    await client.post("/muscles", headers=root_headers, json={"name": "core"})
    resp = await client.post("/muscles", headers=root_headers, json={"name": "core"})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_create_muscle_non_root(client, auth_headers):
    resp = await client.post("/muscles", headers=auth_headers, json={"name": "core"})
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_update_muscle_root(client, root_headers, db, sample_muscle):
    resp = await client.put(
        f"/muscles/{sample_muscle.id}",
        headers=root_headers,
        json={"name": "pecho_actualizado"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "pecho_actualizado"


@pytest.mark.anyio
async def test_update_muscle_not_found(client, root_headers):
    resp = await client.put(
        "/muscles/nonexistent-id",
        headers=root_headers,
        json={"name": "nuevo"},
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_muscle_non_root(client, auth_headers, sample_muscle):
    resp = await client.put(
        f"/muscles/{sample_muscle.id}",
        headers=auth_headers,
        json={"name": "pecho2"},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_delete_muscle(client, root_headers, db, sample_muscle):
    resp = await client.delete(f"/muscles/{sample_muscle.id}", headers=root_headers)
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(models.Muscle).filter(models.Muscle.id == sample_muscle.id).first() is None


@pytest.mark.anyio
async def test_delete_muscle_not_found(client, root_headers):
    resp = await client.delete("/muscles/nonexistent-id", headers=root_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_exercises_requires_auth(client):
    resp = await client.get("/exercises")
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_get_exercises(client, auth_headers, sample_exercise):
    resp = await client.get("/exercises", headers=auth_headers)
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()]
    assert "press banca" in names


@pytest.mark.anyio
async def test_get_exercises_filter_by_muscle(client, auth_headers, db, sample_exercise):
    other_muscle = models.Muscle(name="espalda")
    db.add(other_muscle)
    db.flush()
    other_ex = models.Exercise(name="remo", muscle_id=other_muscle.id)
    db.add(other_ex)
    db.commit()

    resp = await client.get(
        "/exercises",
        headers=auth_headers,
        params={"muscle_id": sample_exercise.muscle_id},
    )
    assert resp.status_code == 200
    names = [e["name"] for e in resp.json()]
    assert "press banca" in names
    assert "remo" not in names


@pytest.mark.anyio
async def test_create_exercise_root(client, root_headers, sample_muscle):
    resp = await client.post(
        "/exercises",
        headers=root_headers,
        json={"name": "press inclinado", "muscle_id": sample_muscle.id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "press inclinado"
    assert data["muscle"]["id"] == sample_muscle.id


@pytest.mark.anyio
async def test_create_exercise_invalid_muscle(client, root_headers):
    resp = await client.post(
        "/exercises",
        headers=root_headers,
        json={"name": "press inclinado", "muscle_id": "nonexistent-muscle"},
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_create_exercise_duplicate(client, root_headers, sample_muscle):
    await client.post(
        "/exercises",
        headers=root_headers,
        json={"name": "aperturas", "muscle_id": sample_muscle.id},
    )
    resp = await client.post(
        "/exercises",
        headers=root_headers,
        json={"name": "aperturas", "muscle_id": sample_muscle.id},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_create_exercise_non_root(client, auth_headers, sample_muscle):
    resp = await client.post(
        "/exercises",
        headers=auth_headers,
        json={"name": "press inclinado", "muscle_id": sample_muscle.id},
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_update_exercise(client, root_headers, sample_exercise):
    resp = await client.put(
        f"/exercises/{sample_exercise.id}",
        headers=root_headers,
        json={"name": "Press de Banca", "muscle_id": sample_exercise.muscle_id},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Press de Banca"


@pytest.mark.anyio
async def test_delete_exercise(client, root_headers, db, sample_exercise):
    resp = await client.delete(f"/exercises/{sample_exercise.id}", headers=root_headers)
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(models.Exercise).filter(models.Exercise.id == sample_exercise.id).first() is None


@pytest.mark.anyio
async def test_get_unique_exercises(client, auth_headers, sample_exercise):
    resp = await client.get("/exercises/unique", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    item = next(e for e in data if e["name"] == "press banca")
    assert "usage_count" in item
    assert item["usage_count"] == 0


@pytest.mark.anyio
async def test_cleanup_unused_exercises(client, auth_headers, db, sample_muscle):
    used_ex = models.Exercise(name="dominadas", muscle_id=sample_muscle.id)
    unused_ex = models.Exercise(name="curl concentrado", muscle_id=sample_muscle.id)
    db.add_all([used_ex, unused_ex])
    db.flush()

    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    workout = models.Workout(
        user_id=user.id,
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
        title="Test",
    )
    db.add(workout)
    db.flush()
    db.add(
        models.ExerciseSet(
            workout_id=workout.id,
            exercise_id=used_ex.id,
            value="10",
            measurement="rep",
            is_completed=True,
        )
    )
    db.commit()

    resp = await client.post("/exercises/cleanup-unused", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 1

    db.expire_all()
    remaining = db.query(models.Exercise).all()
    assert len(remaining) == 1
    assert remaining[0].name == "dominadas"


@pytest.mark.anyio
async def test_standardize_exercises(client, auth_headers, db, sample_muscle):
    ex1 = models.Exercise(name="press banca plano", muscle_id=sample_muscle.id)
    ex2 = models.Exercise(name="banca plano", muscle_id=sample_muscle.id)
    db.add_all([ex1, ex2])
    db.commit()
    db.refresh(ex1)
    db.refresh(ex2)

    resp = await client.post(
        "/exercises/standardize",
        headers=auth_headers,
        json={
            "standard_name": "Press de Banca",
            "exercise_ids_to_merge": [ex1.id, ex2.id],
            "muscle_id": sample_muscle.id,
        },
    )
    assert resp.status_code == 200
    assert "Press de Banca" in resp.json()["message"]

    db.expire_all()
    remaining = db.query(models.Exercise).all()
    names = [e.name for e in remaining]
    assert "Press de Banca" in names
    assert "press banca plano" not in names
    assert "banca plano" not in names


@pytest.mark.anyio
async def test_standardize_missing_fields(client, auth_headers):
    resp = await client.post(
        "/exercises/standardize",
        headers=auth_headers,
        json={"standard_name": "Press de Banca"},
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Muscle validation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_muscle_empty_name(client, root_headers):
    resp = await client.post("/muscles", headers=root_headers, json={"name": "   "})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_update_muscle_empty_name(client, root_headers, sample_muscle):
    resp = await client.put(
        f"/muscles/{sample_muscle.id}",
        headers=root_headers,
        json={"name": "   "},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_update_muscle_duplicate_name(client, root_headers, db, sample_muscle):
    other = models.Muscle(name="espalda_dup")
    db.add(other)
    db.commit()
    db.refresh(other)

    resp = await client.put(
        f"/muscles/{other.id}",
        headers=root_headers,
        json={"name": sample_muscle.name},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_migrate_abdomen_on_get_muscles(client, db):
    old_muscle = models.Muscle(name="abdominales")
    db.add(old_muscle)
    db.commit()

    resp = await client.get("/muscles")
    assert resp.status_code == 200
    names = [m["name"] for m in resp.json()]
    assert "abdominales" not in names
    assert "abdomen" in names


# ---------------------------------------------------------------------------
# Exercise validation
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_exercise_not_found(client, root_headers, sample_muscle):
    resp = await client.put(
        "/exercises/nonexistent-id",
        headers=root_headers,
        json={"name": "nuevo", "muscle_id": sample_muscle.id},
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_exercise_empty_name(client, root_headers, sample_exercise):
    resp = await client.put(
        f"/exercises/{sample_exercise.id}",
        headers=root_headers,
        json={"name": "   ", "muscle_id": sample_exercise.muscle_id},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_update_exercise_invalid_muscle(client, root_headers, sample_exercise):
    resp = await client.put(
        f"/exercises/{sample_exercise.id}",
        headers=root_headers,
        json={"name": "nuevo nombre", "muscle_id": "nonexistent-muscle-id"},
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_delete_exercise_not_found(client, root_headers):
    resp = await client.delete("/exercises/nonexistent-id", headers=root_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Reset endpoints
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reset_exercises_and_force_resync(client, auth_headers, db, sample_exercise):
    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    workout = models.Workout(
        user_id=user.id,
        title="Para reset",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
    )
    db.add(workout)
    db.flush()
    db.add(
        models.ExerciseSet(
            workout_id=workout.id,
            exercise_id=sample_exercise.id,
            value="50",
            measurement="kg",
            is_completed=True,
        )
    )
    db.commit()

    resp = await client.post("/exercises/reset-and-resync", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "deleted_sets" in data


@pytest.mark.anyio
async def test_reset_all_data_root(client, root_headers, db, sample_exercise):
    user = db.query(models.User).filter(models.User.email == "root@test.com").first()
    workout = models.Workout(
        user_id=user.id,
        title="Para borrar todo",
        start_time=datetime(2026, 5, 1, 10, 0),
        end_time=datetime(2026, 5, 1, 11, 0),
    )
    db.add(workout)
    db.commit()

    resp = await client.post("/exercises/reset-all", headers=root_headers)
    assert resp.status_code == 200
    db.expire_all()
    assert db.query(models.Exercise).count() == 0
    assert db.query(models.Muscle).count() == 0


# ---------------------------------------------------------------------------
# Media endpoint — covers YouTube/Pexels helpers (early return without API key)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_exercise_media_no_api_keys(client, auth_headers, sample_exercise):
    with (
        patch("app.routers.exercises._fetch_youtube_videos", new=AsyncMock(return_value=(None, None))),
        patch("app.routers.exercises._fetch_pexels_image", new=AsyncMock(return_value=None)),
    ):
        resp = await client.get(
            f"/exercises/{sample_exercise.id}/media",
            headers=auth_headers,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["video_url_1"] is None
    assert data["video_url_2"] is None
    assert data["image_url"] is None


@pytest.mark.anyio
async def test_get_exercise_media_not_found(client, auth_headers):
    resp = await client.get("/exercises/nonexistent-id/media", headers=auth_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# _fetch_youtube_videos — with API key (lines 17-44)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_fetch_youtube_videos_with_key(client, auth_headers, db, sample_exercise):
    """With YOUTUBE_API_KEY set, fetches and caches YouTube URLs."""
    import os
    from unittest.mock import AsyncMock, MagicMock, patch

    mock_response = MagicMock()
    mock_response.json.return_value = {
        "items": [
            {"id": {"videoId": "vid1aaa"}},
            {"id": {"videoId": "vid2bbb"}},
        ]
    }
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.get = AsyncMock(return_value=mock_response)

    with (
        patch.dict(os.environ, {"YOUTUBE_API_KEY": "fake-yt-key"}),
        patch("app.routers.exercises.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        resp = await client.get(f"/exercises/{sample_exercise.id}/media", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["video_url_1"] is not None
    assert "vid1aaa" in data["video_url_1"]


@pytest.mark.anyio
async def test_fetch_youtube_videos_exception_handled(client, auth_headers, db, sample_exercise):
    """Exception during YouTube fetch is caught and returns None URLs."""
    import os
    from unittest.mock import AsyncMock, patch

    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.get = AsyncMock(side_effect=Exception("network error"))

    with (
        patch.dict(os.environ, {"YOUTUBE_API_KEY": "fake-yt-key"}),
        patch("app.routers.exercises.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        resp = await client.get(f"/exercises/{sample_exercise.id}/media", headers=auth_headers)

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# _fetch_pexels_image — with API key (lines 48-75)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_fetch_pexels_image_with_key(client, auth_headers, db, sample_muscle):
    """With PEXELS_API_KEY set and no YouTube key, fetches and caches Pexels image."""
    import os
    from unittest.mock import AsyncMock, MagicMock, patch

    # Exercise with no cached URLs
    ex = models.Exercise(name="pull up pexels", muscle_id=sample_muscle.id)
    db.add(ex)
    db.commit()
    db.refresh(ex)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "photos": [{"src": {"medium": "https://images.pexels.com/photos/123/photo.jpg"}}]
    }
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.get = AsyncMock(return_value=mock_response)

    with (
        patch.dict(os.environ, {"PEXELS_API_KEY": "fake-px-key"}, clear=False),
        patch.dict(os.environ, {"YOUTUBE_API_KEY": ""}, clear=False),
        patch("app.routers.exercises.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        resp = await client.get(f"/exercises/{ex.id}/media", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["image_url"] == "https://images.pexels.com/photos/123/photo.jpg"


@pytest.mark.anyio
async def test_fetch_pexels_image_error_status(client, auth_headers, db, sample_muscle):
    """Pexels API returns non-200 → image_url stays None (line 66-68)."""
    import os
    from unittest.mock import AsyncMock, MagicMock, patch

    ex = models.Exercise(name="pull up pexels err", muscle_id=sample_muscle.id)
    db.add(ex)
    db.commit()
    db.refresh(ex)

    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.json.return_value = {"error": "bad request"}
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)
    mock_client_instance.get = AsyncMock(return_value=mock_response)

    with (
        patch.dict(os.environ, {"PEXELS_API_KEY": "fake-px-key"}, clear=False),
        patch.dict(os.environ, {"YOUTUBE_API_KEY": ""}, clear=False),
        patch("app.routers.exercises.httpx.AsyncClient", return_value=mock_client_instance),
    ):
        resp = await client.get(f"/exercises/{ex.id}/media", headers=auth_headers)

    assert resp.status_code == 200
    assert resp.json()["image_url"] is None


# ---------------------------------------------------------------------------
# update_muscle — rename branch (lines 136-138 create_muscle, 162-165 update_muscle)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_muscle_rename_success(client, root_headers, db):
    muscle = models.Muscle(name="femoral_rename")
    db.add(muscle)
    db.commit()
    resp = await client.put(
        f"/muscles/{muscle.id}",
        json={"name": "femoral_renamed"},
        headers=root_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "femoral_renamed"


@pytest.mark.anyio
async def test_update_muscle_not_found_by_uuid(client, root_headers):
    resp = await client.put(
        "/muscles/00000000-0000-0000-0000-000000000000",
        json={"name": "newname"},
        headers=root_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_exercise_muscle_change(client, root_headers, db, sample_muscle):
    """update_exercise with a different muscle_id — covers line 203."""
    muscle2 = models.Muscle(name="triceps_ue")
    db.add(muscle2)
    db.flush()
    ex = models.Exercise(name="extension triceps ue", muscle_id=sample_muscle.id)
    db.add(ex)
    db.commit()
    resp = await client.put(
        f"/exercises/{ex.id}",
        json={"name": "extension triceps ue", "muscle_id": muscle2.id},
        headers=root_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["muscle_id"] == muscle2.id


@pytest.mark.anyio
async def test_update_exercise_target_muscle_not_found(client, root_headers, db, sample_muscle):
    """update_exercise with non-existent muscle_id → 404 (line 202-203)."""
    ex = models.Exercise(name="press dumbbell nmf", muscle_id=sample_muscle.id)
    db.add(ex)
    db.commit()
    resp = await client.put(
        f"/exercises/{ex.id}",
        json={"name": "press dumbbell nmf", "muscle_id": "00000000-0000-0000-0000-000000000000"},
        headers=root_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_standardize_exercises_existing_standard(client, auth_headers, db, sample_muscle):
    """standardize_exercises when standard exercise already exists (line 456-459)."""
    ex1 = models.Exercise(name="press banca std1", muscle_id=sample_muscle.id)
    ex2 = models.Exercise(name="press banca std2", muscle_id=sample_muscle.id)
    # Standard already exists
    std = models.Exercise(name="Press Banca Std", muscle_id=sample_muscle.id)
    db.add_all([ex1, ex2, std])
    db.commit()

    resp = await client.post(
        "/exercises/standardize",
        json={
            "standard_name": "Press Banca Std",
            "exercise_ids_to_merge": [ex1.id, ex2.id],
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert "merged" in resp.json()["message"]


@pytest.mark.anyio
async def test_standardize_with_calendar_update(client, auth_headers, db, sample_muscle):
    """standardize_exercises when user has tokens with calendar — hits lines 477-487."""
    from unittest.mock import patch

    user = db.query(models.User).filter(models.User.email == "user@test.com").first()
    tokens = models.UserTokens(
        user_id=user.id,
        selected_calendar_id="cal-std",
        google_access_token="goog-std",
    )
    db.add(tokens)
    db.flush()

    ex1 = models.Exercise(name="curl biceps cal1", muscle_id=sample_muscle.id)
    ex2 = models.Exercise(name="curl biceps cal2", muscle_id=sample_muscle.id)
    db.add_all([ex1, ex2])
    db.flush()

    workout = models.Workout(
        user_id=user.id,
        title="Biceps",
        start_time=datetime(2026, 6, 1, 10, 0),
        end_time=datetime(2026, 6, 1, 11, 0),
    )
    db.add(workout)
    db.flush()
    db.add(models.ExerciseSet(workout_id=workout.id, exercise_id=ex1.id, value="50", measurement="kg"))
    db.commit()

    with patch("app.routers.workouts.update_google_calendar_event", return_value=None):
        resp = await client.post(
            "/exercises/standardize",
            json={
                "standard_name": "Curl Biceps Cal",
                "exercise_ids_to_merge": [ex1.id, ex2.id],
                "muscle_id": sample_muscle.id,
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
