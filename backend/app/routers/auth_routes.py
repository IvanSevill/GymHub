import base64
import logging
import os
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

logger = logging.getLogger(__name__)

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
BACKEND_HOST = os.getenv("BACKEND_HOST", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_user_schema(
    user: models.User,
    user_tokens: Optional[models.UserTokens],
) -> schemas.User:
    """Build a schemas.User response from a DB user and their tokens."""
    return schemas.User(
        id=user.id,
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
        is_root=user.is_root,
        has_calendar=bool(user_tokens and user_tokens.selected_calendar_id),
        fitbit_connected=bool(user_tokens and user_tokens.fitbit_id),
    )


@router.post("/google", response_model=schemas.Token)
async def google_auth(req: schemas.GoogleAuthRequest, db: Session = Depends(database.get_db)):
    """Exchange a Google authorization code for a JWT access token."""
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": req.code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": "postmessage",
        "grant_type": "authorization_code",
    }

    response = requests.post(token_url, data=data)
    if response.status_code != 200:
        logger.warning(
            "Google OAuth failed — client_id set: %s, status: %s, response: %s",
            bool(GOOGLE_CLIENT_ID),
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Failed to exchange Google code: {response.text}",
        )

    tokens = response.json()
    id_info = id_token.verify_oauth2_token(
        tokens["id_token"],
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
        clock_skew_in_seconds=10,
    )

    email = id_info["email"]
    name = id_info.get("name", "")
    picture = id_info.get("picture", "")
    google_id = id_info["sub"]

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        root_emails = os.getenv("ROOT_EMAILS", "").split(",")
        is_root = 1 if email in root_emails else 0
        user = models.User(email=email, name=name, picture_url=picture, is_root=is_root)
        db.add(user)
        db.flush()

    user_tokens = (
        db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    )
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=user.id)
        db.add(user_tokens)

    user_tokens.google_id = google_id
    user_tokens.google_access_token = tokens["access_token"]
    if "refresh_token" in tokens:
        user_tokens.google_refresh_token = tokens["refresh_token"]

    db.commit()

    access_token = auth.create_access_token(data={"sub": user.email})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _build_user_schema(user, user_tokens),
    }


@router.get("/fitbit")
async def fitbit_auth_init(current_user: models.User = Depends(auth.get_current_user)):
    """Initiate the Fitbit OAuth flow. Returns the authorization URL."""
    from urllib.parse import quote

    scope = "activity heartrate location profile sleep weight"
    redirect_uri = os.getenv("FITBIT_REDIRECT_URI", f"{BACKEND_HOST}/auth/fitbit/callback")
    encoded_redirect = quote(redirect_uri, safe="")

    url = (
        f"https://www.fitbit.com/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={FITBIT_CLIENT_ID}&"
        f"redirect_uri={encoded_redirect}&"
        f"scope={scope}&"
        f"state={str(current_user.id)}"
    )
    logger.debug("Fitbit auth URL generated for user %s", current_user.id)
    return {"url": url}


@router.get("/fitbit/callback")
async def fitbit_callback(code: str, state: str, db: Session = Depends(database.get_db)):
    """Callback endpoint for Fitbit OAuth — exchanges code for tokens."""
    user_id = state
    redirect_uri = os.getenv("FITBIT_REDIRECT_URI", f"{BACKEND_HOST}/auth/fitbit/callback")

    token_url = "https://api.fitbit.com/oauth2/token"
    auth_header = base64.b64encode(
        f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()
    ).decode()

    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "client_id": FITBIT_CLIENT_ID,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code": code,
    }

    response = requests.post(token_url, headers=headers, data=data)
    if response.status_code != 200:
        logger.error("Fitbit token exchange failed: HTTP %s", response.status_code)
        raise HTTPException(
            status_code=400,
            detail="Failed to exchange Fitbit authorization code",
        )

    tokens = response.json()
    fitbit_id = tokens["user_id"]

    user_tokens = (
        db.query(models.UserTokens).filter(models.UserTokens.user_id == user_id).first()
    )
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=user_id)
        db.add(user_tokens)

    user_tokens.fitbit_id = fitbit_id
    user_tokens.fitbit_access_token = tokens["access_token"]
    user_tokens.fitbit_refresh_token = tokens["refresh_token"]

    db.commit()
    return RedirectResponse(url=f"{FRONTEND_URL}/fitbit-success")


@router.delete("/fitbit")
async def disconnect_fitbit(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Disconnect Fitbit: remove tokens and all associated FitbitData."""
    user_tokens = (
        db.query(models.UserTokens)
        .filter(models.UserTokens.user_id == current_user.id)
        .first()
    )
    if user_tokens:
        user_tokens.fitbit_id = None
        user_tokens.fitbit_access_token = None
        user_tokens.fitbit_refresh_token = None

    workout_ids = [w.id for w in current_user.workouts]
    db.query(models.FitbitData).filter(
        models.FitbitData.workout_id.in_(workout_ids)
    ).delete(synchronize_session=False)

    db.commit()
    return {"message": "Fitbit disconnected and data removed"}


@router.post("/register", response_model=schemas.User)
async def register_user(
    user_create: schemas.UserCreate, db: Session = Depends(database.get_db)
):
    """Register a new user with email and password."""
    db_user = db.query(models.User).filter(models.User.email == user_create.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    hashed_password = auth.pwd_context.hash(user_create.password)
    new_user = models.User(
        email=user_create.email, name=user_create.name, hashed_password=hashed_password
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return _build_user_schema(new_user, None)


@router.post("/login", response_model=schemas.Token)
async def login_for_access_token(
    user_login: schemas.UserLogin, db: Session = Depends(database.get_db)
):
    """Authenticate with email/password and return a JWT access token."""
    user = db.query(models.User).filter(models.User.email == user_login.email).first()
    if not user or not user.hashed_password or not auth.pwd_context.verify(
        user_login.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = auth.create_access_token(data={"sub": user.email})
    user_tokens = (
        db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    )
    return schemas.Token(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_schema(user, user_tokens),
    )


@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """Return the current authenticated user's profile."""
    return _build_user_schema(current_user, current_user.tokens)
