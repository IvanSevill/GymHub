from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User
from app.services.google_calendar import GoogleCalendarService

router = APIRouter()

@router.get("/me")
def get_me(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    return user

@router.get("/calendars")
def get_user_calendars(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user or not user.google_access_token:
        raise HTTPException(404, "User or Google tokens not found")
    
    cal_service = GoogleCalendarService(user, db)
    return cal_service.list_calendars()

@router.patch("/selected-calendar")
def update_selected_calendar(user_email: str, calendar_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    
    user.selected_calendar_id = calendar_id
    db.commit()
    return {"status": "Calendar updated", "selected_calendar_id": calendar_id}
