import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import User
from app.core.config import settings
from app.services.fitbit import FitbitService
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)

def create_access_token(data: dict):
    # In production, use jose library and a SECRET_KEY
    return f"token_{data['sub']}"

@router.post("/google/connect")
def google_connect(data: dict, db: Session = Depends(get_db)):
    code = data.get("code")
    if not code:
        raise HTTPException(400, "Authorization code is required")
    try:
        from google_auth_oauthlib.flow import Flow
        from google.oauth2 import id_token
        from google.auth.transport import requests

        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost", "postmessage"]
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'],
            redirect_uri='postmessage'
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        request = requests.Request()
        user_info = id_token.verify_oauth2_token(
            credentials.id_token, request, settings.GOOGLE_CLIENT_ID
        )
        
        email = user_info.get("email")
        if not email:
            raise HTTPException(400, "Could not get email from Google")
            
        user = db.query(User).filter(User.email.ilike(email)).first()
        if not user:
            user = User(email=email)
            db.add(user)
            
        user.name = user_info.get("name")
        user.picture_url = user_info.get("picture")
        user.google_id = user_info.get("sub")
        user.google_access_token = credentials.token
        
        from .users import check_json_for_root, is_user_root
        # Sync the is_root flag to DB if they are in the file during login/signup.
        if check_json_for_root(user.email):
            user.is_root = 1

        if credentials.refresh_token:
            user.google_refresh_token = credentials.refresh_token
            
        db.commit()
        db.refresh(user)
        
        from .users import is_user_root
        user_data = {
            "email": user.email,
            "name": user.name,
            "picture_url": user.picture_url,
            "selected_calendar_id": user.selected_calendar_id,
            "fitbit_access_token": user.fitbit_access_token,
            "is_root": bool(is_user_root(user.email, user.is_root))
        }
        session_token = create_access_token({"sub": user.email})
        return {"token": session_token, "user": user_data}
        
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(400, f"Authentication failed: {str(e)}")

@router.post("/google/callback")
def google_auth_mobile(data: dict, db: Session = Depends(get_db)):
    id_token_str = data.get("id_token")
    if not id_token_str:
        raise HTTPException(400, "id_token is required for mobile auth")
    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests
        
        request = requests.Request()
        try:
            user_info = id_token.verify_oauth2_token(
                id_token_str, request, settings.GOOGLE_CLIENT_ID
            )
        except ValueError:
            user_info = id_token.verify_oauth2_token(id_token_str, request)
        
        email = user_info.get("email")
        if not email:
            raise HTTPException(400, "Could not get email from Google ID token")
            
        user = db.query(User).filter(User.email.ilike(email)).first()
        if not user:
            user = User(email=email)
            db.add(user)
            
        user.name = user_info.get("name")
        user.picture_url = user_info.get("picture")
        user.google_id = user_info.get("sub")
        
        from .users import check_json_for_root, is_user_root
        if check_json_for_root(user.email):
            user.is_root = 1
        
        access_token_str = data.get("access_token")
        if access_token_str:
            user.google_access_token = access_token_str
            
        db.commit()
        db.refresh(user)
        
        from .users import is_user_root
        user_data = {
            "email": user.email,
            "name": user.name,
            "picture_url": user.picture_url,
            "selected_calendar_id": user.selected_calendar_id,
            "fitbit_access_token": user.fitbit_access_token,
            "is_root": bool(is_user_root(user.email, user.is_root))
        }
        session_token = create_access_token({"sub": user.email})
        return {"token": session_token, "user": user_data}
    except Exception as e:
        logger.error(f"Mobile Google auth error: {e}")
        raise HTTPException(400, f"Authentication failed: {str(e)}")

@router.get("/fitbit/connect")
def fitbit_connect_init(user_email: str):
    """
    Initiates the Fitbit OAuth flow by redirecting the user to Fitbit.
    This is called by the mobile app or browser.
    """
    client_id = settings.FITBIT_CLIENT_ID
    # We use the FRONTEND_URL from settings as the redirect destination
    redirect_uri = settings.FRONTEND_URL
    scopes = "activity heartrate sleep profile weight location nutrition settings"
    
    auth_url = (
        f"https://www.fitbit.com/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={client_id}&"
        f"redirect_uri={redirect_uri}&"
        f"scope={scopes}&"
        f"prompt=login%20consent"
    )
    from fastapi.responses import RedirectResponse
    return RedirectResponse(auth_url)

@router.post("/fitbit/connect")
def connect_fitbit(
    auth_code: str,
    user_email: str,
    redirect_uri: Optional[str] = None,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == user_email).first()
    if not user: raise HTTPException(404, "User not found")
    try:
        tokens = FitbitService.exchange_code_for_token(auth_code, redirect_uri=redirect_uri)
        fitbit_id = tokens.get("user_id")
        access_token = tokens.get("access_token")
        
        # Verify whose account we are actually connecting
        profile = FitbitService.fetch_profile(access_token)
        fitbit_name = profile.get("fullName", "Unknown")
        
        logger.info(f"Connecting GymHub user {user_email} to Fitbit account: {fitbit_name} ({fitbit_id})")
        
        # Prevent UNIQUE constraint error (users.fitbit_id)
        # If this Fitbit account is already linked to another GymHub user, transfer it.
        existing_user = db.query(User).filter(User.fitbit_id == fitbit_id, User.email != user_email).first()
        if existing_user:
            logger.warning(f"TRANSFER: Fitbit account {fitbit_id} ({fitbit_name}) was already linked to {existing_user.email}. Moving it to {user_email}.")
            existing_user.fitbit_id = None
            existing_user.fitbit_access_token = None
            existing_user.fitbit_refresh_token = None
            db.commit()

        user.fitbit_id = fitbit_id
        user.fitbit_access_token = access_token
        user.fitbit_refresh_token = tokens.get("refresh_token")
        db.commit()
        return {"status": "Fitbit connected"}
    except Exception as e:
        db.rollback()
        logger.error(f"Fitbit auth error: {e}")
        raise HTTPException(400, f"Failed to connect Fitbit account: {str(e)}")

@router.post("/fitbit/disconnect")
def disconnect_fitbit(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        raise HTTPException(404, "User not found")
        
    try:
        from app.models import FitbitData, Workout
        
        # Delete all Fitbit metrics
        db.query(FitbitData).filter(
            FitbitData.workout.has(Workout.user_email == user_email)
        ).delete(synchronize_session=False)
        
        # Delete all workouts that originated ONLY from Fitbit
        db.query(Workout).filter(
            Workout.user_email == user_email,
            Workout.source == 'fitbit'
        ).delete(synchronize_session=False)
        
        # Clear user fitbit tokens
        user.fitbit_id = None
        user.fitbit_access_token = None
        user.fitbit_refresh_token = None
        
        db.commit()
        return {"status": "Fitbit disconnected and all assigned data deleted"}
    except Exception as e:
        db.rollback()
        logger.error(f"Fitbit disconnect error: {e}")
        raise HTTPException(500, f"Error al desconectar Fitbit: {str(e)}")

@router.post("/google/mock")
def mock_google_auth(user_email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        user = User(email=user_email, google_id=f"mock_{user_email}")
        db.add(user)
    
    user.name = "Mock GymHub User"
    user.picture_url = "https://ui-avatars.com/api/?name=Ivan+J+Sevillano&background=06b6d4&color=fff&bold=true"
    user.google_access_token = "mock_access_token"
    user.google_refresh_token = "mock_refresh_token"
    db.commit()
    db.refresh(user)
    return {"status": "Mock Google connected", "user": user}
