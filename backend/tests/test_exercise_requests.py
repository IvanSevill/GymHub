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


# ---------------------------------------------------------------------------
# create_request — missing branches
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_create_request_muscle_not_found(client, auth_headers, sample_muscle):
    resp = await client.post(
        "/exercise-requests",
        json={
            "type": "exercise",
            "exercise_name": "Fondos",
            "muscle_id": "00000000-0000-0000-0000-000000000000",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_create_request_muscle_with_exercise_no_name(client, auth_headers):
    resp = await client.post(
        "/exercise-requests",
        json={"type": "muscle_with_exercise", "exercise_name": "Curl", "muscle_name": None},
        headers=auth_headers,
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_create_request_invalid_type(client, auth_headers):
    resp = await client.post(
        "/exercise-requests",
        json={"type": "unknown_type", "exercise_name": "Curl"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# get_all_requests — with status filter (line 65)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_get_all_requests_with_status_filter(client, root_headers, auth_headers, sample_muscle):
    await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Fondos Filter", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    resp = await client.get("/exercise-requests?status=pending", headers=root_headers)
    assert resp.status_code == 200
    for req in resp.json():
        assert req["status"] == "pending"


# ---------------------------------------------------------------------------
# delete_exercise_request — missing paths
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_delete_request_not_found(client, auth_headers):
    resp = await client.delete(
        "/exercise-requests/00000000-0000-0000-0000-000000000000",
        headers=auth_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# update_exercise_request — lines 97-116
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_request_success(client, auth_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Fondos Update", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}",
        json={"exercise_name": "Fondos Updated"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["exercise_name"] == "Fondos Updated"


@pytest.mark.anyio
async def test_update_request_not_found(client, auth_headers):
    resp = await client.put(
        "/exercise-requests/00000000-0000-0000-0000-000000000000",
        json={"exercise_name": "X"},
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_update_request_not_mine(client, auth_headers, root_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Fondos Mine", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}",
        json={"exercise_name": "Fondos Stolen"},
        headers=root_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# admin_edit_request — lines 126-143
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_admin_edit_request_success(client, auth_headers, root_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Admin Edit Ex", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}/admin-edit",
        json={"exercise_name": "Admin Edited"},
        headers=root_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["exercise_name"] == "Admin Edited"


@pytest.mark.anyio
async def test_admin_edit_request_not_found(client, root_headers):
    resp = await client.put(
        "/exercise-requests/00000000-0000-0000-0000-000000000000/admin-edit",
        json={"exercise_name": "X"},
        headers=root_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_admin_edit_request_not_pending(client, auth_headers, root_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Admin NP Ex", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    resp = await client.put(
        f"/exercise-requests/{req_id}/admin-edit",
        json={"exercise_name": "NP"},
        headers=root_headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# approve_request — missing branches
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_approve_request_not_found(client, root_headers):
    resp = await client.put(
        "/exercise-requests/00000000-0000-0000-0000-000000000000/approve",
        headers=root_headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_approve_request_not_pending(client, auth_headers, root_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Double Approve", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    resp = await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_approve_request_muscle_not_found(client, auth_headers, root_headers, db, sample_muscle):
    """Approve fails when the muscle linked to the request has been deleted."""
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Orphan Ex", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    # Delete the muscle before approving
    db.delete(sample_muscle)
    db.commit()
    resp = await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_approve_muscle_request_exercise_already_exists(client, auth_headers, root_headers, db):
    """muscle_with_exercise approve fails when exercise name already exists."""
    muscle = models.Muscle(name="gemelos_dup")
    db.add(muscle)
    db.flush()
    # Pre-create the exercise so it already exists
    existing_ex = models.Exercise(name="Calf Raise Dup", muscle_id=muscle.id)
    db.add(existing_ex)
    db.commit()

    create = await client.post(
        "/exercise-requests",
        json={"type": "muscle_with_exercise", "exercise_name": "Calf Raise Dup", "muscle_name": "gemelos_dup"},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# reject_request — not found
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_reject_request_not_found(client, root_headers):
    resp = await client.put(
        "/exercise-requests/00000000-0000-0000-0000-000000000000/reject",
        json={"rejection_reason": "Does not fit"},
        headers=root_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# delete_exercise_request — all branches (lines 82-87, skipped tests were sprint-3 stubs)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_delete_own_pending_request_new(client, auth_headers, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "To Delete", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.delete(f"/exercise-requests/{req_id}", headers=auth_headers)
    assert resp.status_code == 204


@pytest.mark.anyio
async def test_delete_not_mine_new(client, auth_headers, root_headers, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Remo Not Mine", "muscle_id": sample_muscle.id},
        headers=root_headers,
    )
    req_id = create.json()["id"]
    resp = await client.delete(f"/exercise-requests/{req_id}", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_delete_not_pending_new(client, auth_headers, root_headers, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "To Approve Delete", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    resp = await client.delete(f"/exercise-requests/{req_id}", headers=auth_headers)
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# update_exercise_request — muscle_id and muscle_name branches (lines 111, 113)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_update_request_with_muscle_id(client, auth_headers, db, sample_muscle):
    muscle2 = models.Muscle(name="hombro_upd")
    db.add(muscle2)
    db.commit()
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Press Muscle Upd", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}",
        json={"muscle_id": muscle2.id},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["muscle_id"] == muscle2.id


@pytest.mark.anyio
async def test_update_request_with_muscle_name(client, auth_headers):
    create = await client.post(
        "/exercise-requests",
        json={"type": "muscle_with_exercise", "exercise_name": "Name Upd Ex", "muscle_name": "old_muscle_upd"},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}",
        json={"muscle_name": "new_muscle_upd"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["muscle_name"] == "new_muscle_upd"


@pytest.mark.anyio
async def test_update_request_not_pending_new(client, auth_headers, root_headers, db, sample_muscle):
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Update NP New", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    await client.put(f"/exercise-requests/{req_id}/approve", headers=root_headers)
    resp = await client.put(
        f"/exercise-requests/{req_id}",
        json={"exercise_name": "Updated NP"},
        headers=auth_headers,
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# admin_edit_request — muscle_id and muscle_name branches (lines 138, 140)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_admin_edit_with_muscle_id(client, auth_headers, root_headers, db, sample_muscle):
    muscle2 = models.Muscle(name="biceps_admin_edit")
    db.add(muscle2)
    db.commit()
    create = await client.post(
        "/exercise-requests",
        json={"type": "exercise", "exercise_name": "Admin Mid Ex", "muscle_id": sample_muscle.id},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}/admin-edit",
        json={"muscle_id": muscle2.id},
        headers=root_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["muscle_id"] == muscle2.id


@pytest.mark.anyio
async def test_admin_edit_with_muscle_name(client, auth_headers, root_headers):
    create = await client.post(
        "/exercise-requests",
        json={"type": "muscle_with_exercise", "exercise_name": "Admin Mname Ex", "muscle_name": "old_admin_mname"},
        headers=auth_headers,
    )
    req_id = create.json()["id"]
    resp = await client.put(
        f"/exercise-requests/{req_id}/admin-edit",
        json={"muscle_name": "new_admin_mname"},
        headers=root_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["muscle_name"] == "new_admin_mname"
