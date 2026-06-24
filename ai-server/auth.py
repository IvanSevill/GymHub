import os
from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

import backend_client

SECRET_KEY = os.getenv("SECRET_KEY") or ""
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is not set — refusing to start")
ALGORITHM = "HS256"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@dataclass
class AuthUser:
    id: str
    name: str
    token: str
    is_root: bool = False


async def get_current_user(token: str = Depends(oauth2_scheme)) -> AuthUser:
    # Decode locally to reject malformed/expired tokens fast…
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

    # …then resolve the user via the backend so the AI server never reads the DB.
    try:
        me = backend_client.get("/auth/me", token)
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        raise HTTPException(status_code=401 if status == 401 else 502, detail="No se pudo validar el usuario")
    except Exception:
        raise HTTPException(status_code=502, detail="Backend no disponible")

    if not me or not me.get("id"):
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return AuthUser(
        id=me["id"],
        name=me.get("name") or email,
        token=token,
        is_root=bool(me.get("is_root")),
    )
