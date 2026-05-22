from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from .. import models, schemas, database, auth
import os
import requests
import base64
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
BACKEND_HOST = os.getenv("BACKEND_HOST", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# FastAPI router for authentication-related endpoints
router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/google", response_model=schemas.Token)
async def google_auth(req: schemas.GoogleAuthRequest, db: Session = Depends(database.get_db)):
    """
    Handles Google OAuth authentication.
    Exchanges the authorization code for Google tokens, verifies the ID token,
    and authenticates/registers the user. Returns a JWT access token.
    """
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": req.code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": "postmessage",  # Standard for SPAs
        "grant_type": "authorization_code",
    }

    response = requests.post(token_url, data=data)
    if response.status_code != 200:
        print(f"[Google OAuth] client_id set: {bool(GOOGLE_CLIENT_ID)}, secret set: {bool(GOOGLE_CLIENT_SECRET)}")
        print(f"[Google OAuth] status: {response.status_code}, response: {response.text}")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to exchange Google code: {response.text}",
        )

    tokens = response.json()
    id_info = id_token.verify_oauth2_token(tokens["id_token"], google_requests.Request(), GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)

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
        db.flush()  # Get user id

    # Update or create tokens
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=user.id)
        db.add(user_tokens)

    user_tokens.google_id = google_id
    user_tokens.google_access_token = tokens["access_token"]
    if "refresh_token" in tokens:
        user_tokens.google_refresh_token = tokens["refresh_token"]

    db.commit()

    access_token = auth.create_access_token(data={"sub": user.email})

    has_calendar = False
    if user_tokens and user_tokens.selected_calendar_id:
        has_calendar = True

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture_url": user.picture_url,
            "is_root": user.is_root,
            "has_calendar": has_calendar,
            "fitbit_connected": bool(user_tokens and user_tokens.fitbit_id)
        }
    }

@router.get("/fitbit")
async def fitbit_auth_init(current_user: models.User = Depends(auth.get_current_user)):
    """
    Initiates the Fitbit OAuth flow.
    Returns the Fitbit authorization URL to the frontend.
    """
    from urllib.parse import quote
    scope = "activity heartrate location profile sleep weight"
    # Use the variable from .env or fallback
    redirect_uri = os.getenv("FITBIT_REDIRECT_URI", f"{BACKEND_HOST}/auth/fitbit/callback")
    
    encoded_redirect = quote(redirect_uri, safe='')
    
    url = (
        f"https://www.fitbit.com/oauth2/authorize?"
        f"response_type=code&"
        f"client_id={FITBIT_CLIENT_ID}&"
        f"redirect_uri={encoded_redirect}&"
        f"scope={scope}&"
        f"state={str(current_user.id)}"
    )
    print(f"DEBUG: Fitbit Auth URL -> {url}")
    return {"url": url}

@router.get("/fitbit/callback")
async def fitbit_callback(code: str, state: str, db: Session = Depends(database.get_db)):
    """
    Callback endpoint for Fitbit OAuth.
    """
    user_id = state
    redirect_uri = os.getenv("FITBIT_REDIRECT_URI", f"{BACKEND_HOST}/auth/fitbit/callback")

    token_url = "https://api.fitbit.com/oauth2/token"
    # Fitbit requires Basic Auth with Base64(client_id:client_secret)
    auth_header_str = f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}"
    auth_header = base64.b64encode(auth_header_str.encode()).decode()
    
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "client_id": FITBIT_CLIENT_ID,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
        "code": code
    }

    print(f"DEBUG: Fitbit Token Exchange - Data: {data}")
    
    response = requests.post(token_url, headers=headers, data=data)
    if response.status_code != 200:
        print(f"DEBUG: Fitbit Error Response: {response.text}")
        raise HTTPException(status_code=400, detail=f"Failed to exchange Fitbit code: {response.text}")

    tokens = response.json()
    fitbit_id = tokens["user_id"]

    # Save tokens to the user
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == user_id).first()
    if not user_tokens:
        user_tokens = models.UserTokens(user_id=user_id)
        db.add(user_tokens)

    user_tokens.fitbit_id = fitbit_id
    user_tokens.fitbit_access_token = tokens["access_token"]
    user_tokens.fitbit_refresh_token = tokens["refresh_token"]

    db.commit()

    # Redirect back to frontend
    return RedirectResponse(url=f"{FRONTEND_URL}/fitbit-success")

@router.delete("/fitbit")
async def disconnect_fitbit(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    """
    Disconnects Fitbit integration for the current user.
    Removes Fitbit tokens and associated Fitbit data from workouts.
    """
    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == current_user.id).first()
    if user_tokens:
        user_tokens.fitbit_id = None
        user_tokens.fitbit_access_token = None
        user_tokens.fitbit_refresh_token = None

    # Delete all FitbitData for this user's workouts
    workout_ids = [w.id for w in current_user.workouts]
    db.query(models.FitbitData).filter(models.FitbitData.workout_id.in_(workout_ids)).delete(synchronize_session=False)

    db.commit()
    return {"message": "Fitbit disconnected and data removed"}

@router.post("/register", response_model=schemas.User)
async def register_user(user_create: schemas.UserCreate, db: Session = Depends(database.get_db)):
    """
    Registers a new user with email and password.
    Hashes the password before storing it.
    """
    db_user = db.query(models.User).filter(models.User.email == user_create.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = auth.pwd_context.hash(user_create.password)
    new_user = models.User(email=user_create.email, name=user_create.name, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return schemas.User(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        picture_url=new_user.picture_url,
        is_root=new_user.is_root,
        has_calendar=False,
        fitbit_connected=False
    )

@router.post("/login", response_model=schemas.Token)
async def login_for_access_token(user_login: schemas.UserLogin, db: Session = Depends(database.get_db)):
    """
    Authenticates a user with email and password and returns an access token.
    """
    user = db.query(models.User).filter(models.User.email == user_login.email).first()
    if not user or not user.hashed_password or not auth.pwd_context.verify(user_login.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})

    user_tokens = db.query(models.UserTokens).filter(models.UserTokens.user_id == user.id).first()
    has_calendar = False
    if user_tokens and user_tokens.selected_calendar_id:
        has_calendar = True

    return schemas.Token(
        access_token=access_token,
        token_type="bearer",
        user=schemas.User(
            id=user.id,
            email=user.email,
            name=user.name,
            picture_url=user.picture_url,
            is_root=user.is_root,
            has_calendar=has_calendar,
            fitbit_connected=bool(user_tokens and user_tokens.fitbit_id)
        )
    )

@router.get("/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    """
    Retrieves the current authenticated user's information.
    """
    user_tokens = current_user.tokens # Relationship loads automatically
    has_calendar = False
    if user_tokens and user_tokens.selected_calendar_id:
        has_calendar = True

    # Manually create the schema instance to include derived properties
    return schemas.User(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        picture_url=current_user.picture_url,
        is_root=current_user.is_root,
        has_calendar=has_calendar,
        fitbit_connected=bool(user_tokens and user_tokens.fitbit_id)
    )
