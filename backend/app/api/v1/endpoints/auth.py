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
    """
    client_id = settings.FITBIT_CLIENT_ID
    
    # redirect_uri must EXACTLY match what is registered in the Fitbit Developer Portal
    redirect_uri = "https://gymhub-jd53.onrender.com"

    scopes = "activity heartrate sleep profile weight location nutrition settings"
    
    # Encode user_email in state to retrieve it in callback
    import urllib.parse
    state = urllib.parse.quote(user_email)

    auth_url = (
        f"https://www.fitbit.com/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={client_id}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri, safe='')}&"
        f"scope={urllib.parse.quote(scopes, safe='')}&"
        f"state={state}&"
        f"prompt=login%20consent"
    )
    from fastapi.responses import RedirectResponse
    return RedirectResponse(auth_url)

@router.get("/fitbit/callback")
def fitbit_callback(code: str, state: str, db: Session = Depends(get_db)):
    """
    Handle the callback from Fitbit, exchange code for tokens, and link to user.
    After success, redirect to the Android deep link gymhub://auth-callback?status=success
    """
    import urllib.parse
    user_email = urllib.parse.unquote(state)
    # Must match EXACTLY the registered Redirect URL in the Fitbit Developer Portal
    redirect_uri = "https://gymhub-jd53.onrender.com"
    
    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("gymhub://auth-callback?status=error&reason=user_not_found")

    try:
        tokens = FitbitService.exchange_code_for_token(code, redirect_uri=redirect_uri)
        fitbit_id = tokens.get("user_id")
        
        # Check for existing links
        existing_user = db.query(User).filter(User.fitbit_id == fitbit_id, User.email != user_email).first()
        if existing_user:
            existing_user.fitbit_id = None
            existing_user.fitbit_access_token = None
            existing_user.fitbit_refresh_token = None
            db.commit()

        user.fitbit_id = fitbit_id
        user.fitbit_access_token = tokens.get("access_token")
        user.fitbit_refresh_token = tokens.get("refresh_token")
        db.commit()

        # Redirect back to Android app via deep link
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"gymhub://auth-callback?status=success&email={urllib.parse.quote(user_email)}")
    except Exception as e:
        logger.error(f"Fitbit Callback Error: {e}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"gymhub://auth-callback?status=error&reason={urllib.parse.quote(str(e))}")

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

@router.get("/fitbit/mobile-connect")
def fitbit_mobile_connect_init(user_email: str):
    """
    Initiates the Fitbit OAuth flow for the Android app.
    Uses a separate Fitbit app (23TY4J) with its own redirect_uri.
    """
    import urllib.parse
    client_id = settings.FITBIT_MOBILE_CLIENT_ID
    redirect_uri = "https://gymhub-jd53.onrender.com/api/v1/auth/fitbit/mobile-callback"
    scopes = "activity heartrate sleep profile weight location nutrition settings"
    state = urllib.parse.quote(user_email)

    auth_url = (
        f"https://www.fitbit.com/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={client_id}&"
        f"redirect_uri={urllib.parse.quote(redirect_uri, safe='')}&"
        f"scope={urllib.parse.quote(scopes, safe='')}&"
        f"state={state}&"
        f"prompt=login%20consent"
    )
    from fastapi.responses import RedirectResponse
    return RedirectResponse(auth_url)


@router.get("/fitbit/mobile-callback")
def fitbit_mobile_callback(code: str, state: str, db: Session = Depends(get_db)):
    """
    Callback for the Android Fitbit OAuth flow.
    Exchanges code for tokens using the mobile app credentials, saves to DB,
    then redirects back to the Android app via deep link: gymhub://auth-callback
    """
    import urllib.parse
    user_email = urllib.parse.unquote(state)
    redirect_uri = "https://gymhub-jd53.onrender.com/api/v1/auth/fitbit/mobile-callback"

    user = db.query(User).filter(User.email == user_email).first()
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("gymhub://auth-callback?status=error&reason=user_not_found")

    try:
        # Use mobile-specific credentials
        tokens = FitbitService.exchange_code_for_token(
            code,
            redirect_uri=redirect_uri,
            client_id=settings.FITBIT_MOBILE_CLIENT_ID,
            client_secret=settings.FITBIT_MOBILE_CLIENT_SECRET
        )
        fitbit_id = tokens.get("user_id")

        # Transfer fitbit link if it was on another account
        existing_user = db.query(User).filter(User.fitbit_id == fitbit_id, User.email != user_email).first()
        if existing_user:
            existing_user.fitbit_id = None
            existing_user.fitbit_access_token = None
            existing_user.fitbit_refresh_token = None
            db.commit()

        user.fitbit_id = fitbit_id
        user.fitbit_access_token = tokens.get("access_token")
        user.fitbit_refresh_token = tokens.get("refresh_token")
        db.commit()

        # Open the Android deep link via JS — more reliable than a bare 301 redirect
        deep_link = f"gymhub://auth-callback?status=success&email={urllib.parse.quote(user_email)}"
        from fastapi.responses import HTMLResponse
        return HTMLResponse(f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Conectando con GymHub...</title>
    <style>
        body {{ font-family: sans-serif; background: #020617; color: white;
               display: flex; flex-direction: column; align-items: center;
               justify-content: center; height: 100vh; margin: 0; }}
        h1 {{ color: #06b6d4; }}
        p {{ color: #94a3b8; }}
        a {{ background: #06b6d4; color: white; text-decoration: none;
             padding: 12px 24px; border-radius: 12px; font-weight: bold; margin-top: 16px; display: inline-block; }}
    </style>
</head>
<body>
    <h1>✅ ¡Fitbit Conectado!</h1>
    <p>Volviendo a GymHub...</p>
    <a href="{deep_link}">Abrir GymHub</a>
    <script>
        // Try to open the app immediately
        window.location.href = "{deep_link}";
        // If the app doesn't open in 2s (e.g. browser blocks it), show the button
        setTimeout(function() {{
            document.querySelector('p').textContent = 'Pulsa el botón si la app no se abrió:';
        }}, 2000);
    </script>
</body>
</html>
        """)

    except Exception as e:
        logger.error(f"Fitbit Mobile Callback Error: {e}")
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"gymhub://auth-callback?status=error&reason={urllib.parse.quote(str(e))}")


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
