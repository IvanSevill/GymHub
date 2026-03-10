from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User
from app.services.google_calendar import GoogleCalendarService
from app.core.config import settings
import json
import logging
import os

router = APIRouter()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_user_root(email: str, db_is_root: int) -> bool:
    # 1. Check database flag (permanent root)
    if db_is_root == 1:
        return True
    return False

def check_json_for_root(email: str) -> bool:
    # 2. Check environment variable first
    if settings.ROOT_EMAILS:
        root_list = [r.strip().lower() for r in settings.ROOT_EMAILS.split(',') if r.strip()]
        if email.lower() in root_list:
            return True

    # 3. Fallback to JSON file
    try:
        if os.path.exists(settings.ROOT_USERS_FILE):
            with open(settings.ROOT_USERS_FILE, 'r') as f:
                roots = json.load(f)
                return email.lower() in [r.lower() for r in roots]
    except Exception as e:
        logger.error(f"Error reading root users file: {e}")
    return False

@router.get("/me")
def get_me(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    if not user: raise HTTPException(404, "User not found")
    
    user_dict = {
        "email": user.email,
        "name": user.name,
        "picture_url": user.picture_url,
        "selected_calendar_id": user.selected_calendar_id,
        "fitbit_access_token": user.fitbit_access_token,
        "is_root": bool(is_user_root(user.email, user.is_root))
    }
    return user_dict

@router.get("/calendars")
def get_user_calendars(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    if not user or not user.google_access_token:
        raise HTTPException(404, "User or Google tokens not found")
    
    cal_service = GoogleCalendarService(user, db)
    return cal_service.list_calendars()

@router.patch("/selected-calendar")
def update_selected_calendar(user_email: str, calendar_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email.ilike(user_email)).first()
    if not user: raise HTTPException(404, "User not found")
    
    tokens = user.get_or_create_tokens(db)
    tokens.selected_calendar_id = calendar_id
    db.commit()
    return {"status": "Calendar updated", "selected_calendar_id": calendar_id}
