import os
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models, database # Corrected relative import
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration for JWT
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-please-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2PasswordBearer for token extraction from request headers
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Creates a new JWT access token.

    Args:
        data (dict): The payload to encode into the token.
        expires_delta (Optional[timedelta]): Optional timedelta for token expiration.

    Returns:
        str: The encoded JWT access token.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    """
    Dependency to get the current authenticated user from the JWT token.

    Args:
        token (str): The JWT token from the request header.
        db (Session): Database session dependency.

    Returns:
        models.User: The authenticated user object.

    Raises:
        HTTPException: If authentication fails or token is invalid/expired.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_root_user(current_user: models.User = Depends(get_current_user)):
    """
    Dependency to get the current authenticated user with root privileges.

    Args:
        current_user (models.User): The current authenticated user from `get_current_user`.

    Returns:
        models.User: The root user object.

    Raises:
        HTTPException: If the user does not have enough privileges.
    """
    root_emails = os.getenv("ROOT_EMAILS", "").split(",")
    if current_user.email not in root_emails and current_user.is_root == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user
