import os
from dataclasses import dataclass

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from database import SessionLocal
from models import User

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@dataclass
class AuthUser:
    id: str
    name: str
    token: str
    is_root: bool = False


async def get_current_user(token: str = Depends(oauth2_scheme)) -> AuthUser:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        return AuthUser(
            id=user.id,
            name=user.name or email,
            token=token,
            is_root=bool(user.is_root),
        )
    finally:
        db.close()
