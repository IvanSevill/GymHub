from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter(prefix="/weight", tags=["weight"])


@router.post("/", response_model=schemas.WeightLogResponse, status_code=201)
async def log_weight(
    data: schemas.WeightLogCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Create or update the weight log entry for a given date (upserts by date)."""
    existing = (
        db.query(models.WeightLog)
        .filter(models.WeightLog.user_id == current_user.id, models.WeightLog.date == data.date)
        .first()
    )
    if existing:
        existing.weight_kg = data.weight_kg
        existing.body_fat_pct = data.body_fat_pct
        db.commit()
        db.refresh(existing)
        return existing

    entry = models.WeightLog(
        user_id=current_user.id,
        date=data.date,
        weight_kg=data.weight_kg,
        body_fat_pct=data.body_fat_pct,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/", response_model=list[schemas.WeightLogResponse])
async def get_weight_logs(
    days: Optional[int] = 90,
    date: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """List weight log entries. Filter by ?days=N or exact ?date=YYYY-MM-DD."""
    query = db.query(models.WeightLog).filter(models.WeightLog.user_id == current_user.id)
    if date:
        query = query.filter(models.WeightLog.date == date)
    else:
        from datetime import datetime, timedelta
        cutoff = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
        query = query.filter(models.WeightLog.date >= cutoff)
    return query.order_by(models.WeightLog.date.asc()).all()


@router.delete("/{entry_id}", status_code=204)
async def delete_weight_log(
    entry_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete a weight log entry owned by the current user."""
    entry = (
        db.query(models.WeightLog)
        .filter(models.WeightLog.id == entry_id, models.WeightLog.user_id == current_user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
