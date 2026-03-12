from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from .. import models, schemas, database, auth, fitbit_utils
import os
import requests
import base64
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from datetime import datetime

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FITBIT_CLIENT_ID = os.getenv("FITBIT_CLIENT_ID")
FITBIT_CLIENT_SECRET = os.getenv("FITBIT_CLIENT_SECRET")
BACKEND_HOST = os.getenv("BACKEND_HOST", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

@router.post("/google", response_model=schemas.Token)
def google_auth(req: schemas.GoogleAuthRequest, db: Session = Depends(database.get_db)):
    # In a real app, we'd exchange the code for a token.
    # For this implementation, we assume the 'code' is the ID Token for simplicity 
    # OR we use the code to get the token. Let's do the code exchange.
    
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": req.code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": "postmessage", # Standard for SPAs
        "grant_type": "authorization_code",
    }
    
    response = requests.post(token_url, data=data)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange Google code")
    
    tokens = response.json()
    id_info = id_token.verify_oauth2_token(tokens["id_token"], google_requests.Request(), GOOGLE_CLIENT_ID)
    
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
        db.flush() # Get user id
        
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
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "email": user.email,
            "name": user.name,
            "picture_url": user.picture_url,
            "is_root": user.is_root
        }
    }

@router.get("/fitbit")
def fitbit_auth_init(current_user: models.User = Depends(auth.get_current_user)):
    # Return the Fitbit authorization URL
    scope = "activity heartrate profile sleep weight"
    redirect_uri = f"{BACKEND_HOST}/auth/fitbit/callback"
    url = f"https://www.fitbit.com/oauth2/authorize?response_type=code&client_id={FITBIT_CLIENT_ID}&redirect_uri={redirect_uri}&scope={scope}"
    return {"url": url}

@router.get("/fitbit/callback")
def fitbit_callback(code: str, db: Session = Depends(database.get_db)):
    # This endpoint is called by Fitbit redirect. 
    # Usually it needs state to know which user it is. 
    # For simplicity, we might need the user to be logged in or pass state.
    # In a real app, 'state' would contain the user ID or a session token.
    
    token_url = "https://api.fitbit.com/oauth2/token"
    auth_header = base64.b64encode(f"{FITBIT_CLIENT_ID}:{FITBIT_CLIENT_SECRET}".encode()).decode()
    headers = {
        "Authorization": f"Basic {auth_header}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": f"{BACKEND_HOST}/auth/fitbit/callback"
    }
    
    response = requests.post(token_url, headers=headers, data=data)
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange Fitbit code")
    
    tokens = response.json()
    fitbit_id = tokens["user_id"]
    
    # How do we know which user? We'd need state. 
    # Let's assume for this mock/logic that we have a temporary way or the user is identified via another cookie/session if this was a browser flow.
    # But since this is an API, we'll probably need 'state' to be the user_id.
    
    # Redirect back to frontend
    return RedirectResponse(url=f"{FRONTEND_URL}/fitbit-success")

@router.delete("/fitbit")
def disconnect_fitbit(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
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
