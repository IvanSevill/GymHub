"""Tests for /exercise-requests endpoints."""

import pytest

from app import models


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_exercise_request_success(client, auth_headers, sample_muscle):
    response = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Press Banca",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["exercise_name"] == "Press Banca"
    assert data["type"] == "exercise"
    assert data["status"] == "pending"
    assert data["muscle_id"] == sample_muscle.id


@pytest.mark.anyio
async def test_create_muscle_request_success(client, auth_headers):
    response = await client.post(
        "/exercise-requests",
        json={
            "type": "muscle_with_exercise",
            "exercise_name": "Sentadilla Profunda",
            "muscle_name": "cuádriceps",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["exercise_name"] == "Sentadilla Profunda"
    assert data["type"] == "muscle_with_exercise"
    assert data["status"] == "pending"
    assert data["muscle_name"] == "cuádriceps"


@pytest.mark.anyio
async def test_create_request_missing_muscle_id_for_exercise_type(client, auth_headers):
    response = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Curl Bíceps",
        },
        headers=auth_headers,
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# List own requests
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_my_requests_returns_own(client, auth_headers, db):
    await client.post(
        "/exercise-requests",
        json={
            "type": "muscle_with_exercise",
            "exercise_name": "Remo Polea",
            "muscle_name": "espalda",
        },
        headers=auth_headers,
    )
    response = await client.get("/exercise-requests/my", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["exercise_name"] == "Remo Polea"


@pytest.mark.anyio
async def test_get_my_requests_empty(client, auth_headers):
    response = await client.get("/exercise-requests/my", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# Root view all
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_root_can_get_all_requests(client, root_headers, auth_headers, db):
    await client.post(
        "/exercise-requests",
        json={
            "type": "muscle_with_exercise",
            "exercise_name": "Fondos en Paralelas",
            "muscle_name": "tríceps",
        },
        headers=auth_headers,
    )
    response = await client.get("/exercise-requests", headers=root_headers)
    assert response.status_code == 200
    items = response.json()
    assert any(r["exercise_name"] == "Fondos en Paralelas" for r in items)


@pytest.mark.anyio
async def test_nonroot_cannot_get_all_requests(client, auth_headers):
    response = await client.get("/exercise-requests", headers=auth_headers)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Approve
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_root_approve_exercise_request(client, root_headers, auth_headers, db, sample_muscle):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Aperturas con Mancuernas",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"

    exercise = db.query(models.Exercise).filter_by(name="Aperturas con Mancuernas").first()
    assert exercise is not None


@pytest.mark.anyio
async def test_root_approve_muscle_request(client, root_headers, auth_headers, db):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "muscle_with_exercise",
            "exercise_name": "Sentadilla Goblet",
            "muscle_name": "glúteos",
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"

    muscle = db.query(models.Muscle).filter_by(name="glúteos").first()
    assert muscle is not None
    exercise = db.query(models.Exercise).filter_by(name="Sentadilla Goblet").first()
    assert exercise is not None


@pytest.mark.anyio
async def test_nonroot_cannot_approve(client, auth_headers, root_headers, db, sample_muscle):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Jalón al Pecho",
            "muscle_id": sample_muscle.id,
        },
        headers=root_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=auth_headers,
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_approve_duplicate_exercise_returns_409(
    client, root_headers, auth_headers, db, sample_muscle
):
    # Create the exercise directly so a duplicate request would conflict
    db.add(models.Exercise(name="Press Militar", muscle_id=sample_muscle.id))
    db.commit()

    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Press Militar",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_root_reject_request_with_reason(
    client, root_headers, auth_headers, db, sample_muscle
):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Ejercicio Inválido",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}/reject",
        json={"rejection_reason": "Nombre poco claro."},
        headers=root_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "rejected"
    assert data["rejection_reason"] == "Nombre poco claro."


@pytest.mark.anyio
async def test_cannot_reject_already_approved(
    client, root_headers, auth_headers, db, sample_muscle
):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Extensiones de Cuádriceps",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )

    response = await client.put(
        f"/exercise-requests/{request_id}/reject",
        json={"rejection_reason": "Too late."},
        headers=root_headers,
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Delete (sprint 3 endpoints not yet merged)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="requires sprint 3 merge (feat/exercise-requests-crud)")
@pytest.mark.anyio
async def test_delete_own_pending_request(client, auth_headers, db, sample_muscle):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Curl Concentrado",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.delete(
        f"/exercise-requests/{request_id}",
        headers=auth_headers,
    )
    assert response.status_code == 204


@pytest.mark.skip(reason="requires sprint 3 merge (feat/exercise-requests-crud)")
@pytest.mark.anyio
async def test_cannot_delete_others_request(client, auth_headers, root_headers, db, sample_muscle):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Remo con Barra",
            "muscle_id": sample_muscle.id,
        },
        headers=root_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.delete(
        f"/exercise-requests/{request_id}",
        headers=auth_headers,
    )
    assert response.status_code in (403, 404)


@pytest.mark.skip(reason="requires sprint 3 merge (feat/exercise-requests-crud)")
@pytest.mark.anyio
async def test_cannot_delete_approved_request(
    client, auth_headers, root_headers, db, sample_muscle
):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Pullover con Mancuerna",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )

    response = await client.delete(
        f"/exercise-requests/{request_id}",
        headers=auth_headers,
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Edit (sprint 3 endpoints not yet merged)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="requires sprint 3 merge (feat/exercise-requests-crud)")
@pytest.mark.anyio
async def test_edit_own_pending_request(client, auth_headers, db, sample_muscle):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Nombre Original",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    response = await client.put(
        f"/exercise-requests/{request_id}",
        json={
            "exercise_name": "Nombre Corregido",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["exercise_name"] == "Nombre Corregido"


@pytest.mark.skip(reason="requires sprint 3 merge (feat/exercise-requests-crud)")
@pytest.mark.anyio
async def test_cannot_edit_approved_request(
    client, auth_headers, root_headers, db, sample_muscle
):
    create_resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Curl Predicador",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    request_id = create_resp.json()["id"]

    await client.put(
        f"/exercise-requests/{request_id}/approve",
        headers=root_headers,
    )

    response = await client.put(
        f"/exercise-requests/{request_id}",
        json={
            "exercise_name": "Curl Predicador Modificado",
            "muscle_id": sample_muscle.id,
        },
        headers=auth_headers,
    )
    assert response.status_code == 400
