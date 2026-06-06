from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/", status_code=201)
async def submit_feedback(
    data: schemas.FeedbackCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Submit feedback from a non-root user."""
    fb = models.UserFeedback(
        user_id=current_user.id,
        message=data.message,
        rating=data.rating,
    )
    db.add(fb)
    db.commit()
    return {"ok": True}


@router.get("/", response_model=list[schemas.FeedbackResponse])
async def list_feedback(
    current_user: models.User = Depends(auth.get_current_root_user),
    db: Session = Depends(database.get_db),
):
    """List all feedback entries, newest first. Root only."""
    rows = (
        db.query(models.UserFeedback)
        .order_by(models.UserFeedback.created_at.desc())
        .all()
    )
    return [
        schemas.FeedbackResponse(
            id=r.id,
            message=r.message,
            rating=r.rating,
            created_at=r.created_at,
            user_name=r.user.name or "",
            user_email=r.user.email,
        )
        for r in rows
    ]
