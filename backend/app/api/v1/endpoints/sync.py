import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User
from app.services.sync_service import sync_data_for_user, unify_cardio_sessions

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/manual")
def manual_sync(user_email: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Run sync in background as it can take time
    background_tasks.add_task(sync_data_for_user, user, db)
    return {"status": "Sync started in background"}
