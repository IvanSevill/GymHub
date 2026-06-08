from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_root_user, get_current_user
from ..database import get_db

router = APIRouter(prefix="/exercise-requests", tags=["exercise-requests"])


@router.post("", response_model=schemas.ExerciseRequestResponse, status_code=201)
def create_request(
    body: schemas.ExerciseRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.type == "exercise":
        if not body.muscle_id:
            raise HTTPException(400, "muscle_id is required for type 'exercise'")
        muscle = db.query(models.Muscle).filter(models.Muscle.id == body.muscle_id).first()
        if not muscle:
            raise HTTPException(404, "Muscle not found")
    elif body.type == "muscle_with_exercise":
        if not body.muscle_name:
            raise HTTPException(400, "muscle_name is required for type 'muscle_with_exercise'")
    else:
        raise HTTPException(400, "Invalid type; must be 'exercise' or 'muscle_with_exercise'")

    req = models.ExerciseRequest(
        type=body.type,
        exercise_name=body.exercise_name.strip(),
        muscle_id=body.muscle_id,
        muscle_name=body.muscle_name.strip() if body.muscle_name else None,
        requested_by_id=current_user.id,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/my", response_model=list[schemas.ExerciseRequestResponse])
def get_my_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.requested_by_id == current_user.id)
        .order_by(models.ExerciseRequest.created_at.desc())
        .all()
    )


@router.get("", response_model=list[schemas.ExerciseRequestResponse])
def get_all_requests(
    status: str | None = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_root_user),
):
    q = db.query(models.ExerciseRequest)
    if status:
        q = q.filter(models.ExerciseRequest.status == status)
    return q.order_by(models.ExerciseRequest.created_at.desc()).all()


@router.delete("/{request_id}", status_code=204)
def delete_exercise_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    req = (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.requested_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be deleted")
    db.delete(req)
    db.commit()


@router.put("/{request_id}", response_model=schemas.ExerciseRequestResponse)
def update_exercise_request(
    request_id: str,
    data: schemas.ExerciseRequestUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    req = (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.requested_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited")
    if data.exercise_name is not None:
        req.exercise_name = data.exercise_name
    if data.muscle_id is not None:
        req.muscle_id = data.muscle_id
    if data.muscle_name is not None:
        req.muscle_name = data.muscle_name
    db.commit()
    db.refresh(req)
    return req


@router.put("/{request_id}/admin-edit", response_model=schemas.ExerciseRequestResponse)
def admin_edit_request(
    request_id: str,
    data: schemas.ExerciseRequestUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_root_user),
):
    req = (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending requests can be edited")
    if data.exercise_name is not None:
        req.exercise_name = data.exercise_name
    if data.muscle_id is not None:
        req.muscle_id = data.muscle_id
    if data.muscle_name is not None:
        req.muscle_name = data.muscle_name
    db.commit()
    db.refresh(req)
    return req


@router.put("/{request_id}/approve", response_model=schemas.ExerciseRequestResponse)
def approve_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_root_user),
):
    req = (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != "pending":
        raise HTTPException(400, "Request is not pending")

    if req.type == "exercise":
        muscle = db.query(models.Muscle).filter(models.Muscle.id == req.muscle_id).first()
        if not muscle:
            raise HTTPException(404, "Muscle no longer exists")
        existing = (
            db.query(models.Exercise).filter(models.Exercise.name == req.exercise_name).first()
        )
        if existing:
            raise HTTPException(409, f"Exercise '{req.exercise_name}' already exists")
        new_exercise = models.Exercise(name=req.exercise_name, muscle_id=muscle.id)
        db.add(new_exercise)
        db.flush()
        req.exercise_id = new_exercise.id

    elif req.type == "muscle_with_exercise":
        normalized_muscle_name = req.muscle_name.strip().lower()
        muscle = (
            db.query(models.Muscle)
            .filter(models.Muscle.name == normalized_muscle_name)
            .first()
        )
        if not muscle:
            muscle = models.Muscle(name=normalized_muscle_name)
            db.add(muscle)
            db.flush()
        existing = (
            db.query(models.Exercise).filter(models.Exercise.name == req.exercise_name).first()
        )
        if existing:
            raise HTTPException(409, f"Exercise '{req.exercise_name}' already exists")
        new_exercise = models.Exercise(name=req.exercise_name, muscle_id=muscle.id)
        db.add(new_exercise)
        db.flush()
        req.exercise_id = new_exercise.id

    req.status = "approved"
    req.reviewed_by_id = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req


@router.put("/{request_id}/reject", response_model=schemas.ExerciseRequestResponse)
def reject_request(
    request_id: str,
    body: schemas.ExerciseRequestReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_root_user),
):
    req = (
        db.query(models.ExerciseRequest)
        .filter(models.ExerciseRequest.id == request_id)
        .first()
    )
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != "pending":
        raise HTTPException(400, "Request is not pending")

    req.status = "rejected"
    req.rejection_reason = body.rejection_reason
    req.reviewed_by_id = current_user.id
    req.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    return req
