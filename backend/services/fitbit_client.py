import os
import httpx
import base64
import logging
from typing import Optional, List, Dict
from pydantic import BaseModel
from datetime import datetime

logger = logging.getLogger(__name__)

FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_API_BASEURL = "https://api.fitbit.com/1"

class FitbitService:
    @staticmethod
    def get_auth_headers() -> str:
        client_id = os.getenv("FITBIT_CLIENT_ID")
        client_secret = os.getenv("FITBIT_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise ValueError("Las credenciales de Fitbit no están configuradas en .env")
        
        credentials = f"{client_id}:{client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded_credentials}"

    @staticmethod
    def exchange_code_for_token(code: str, redirect_uri: str = "http://localhost:5173/auth/fitbit/callback") -> dict:
        """Cambia el código de autorización por los tokens de acceso y refresco."""
        headers = {
            "Authorization": FitbitService.get_auth_headers(),
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {
            "clientId": os.getenv("FITBIT_CLIENT_ID"),
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": code
        }
        
        try:
            with httpx.Client() as client:
                response = client.post(FITBIT_TOKEN_URL, headers=headers, data=data)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Error al conectar con Fitbit: {e}")
            if hasattr(e, 'response') and e.response:
                logger.error(f"Detalle de error Fitbit: {e.response.text}")
            raise ValueError(f"No se pudo completar la autenticación con Fitbit.")

    @staticmethod
    def refresh_token(refresh_token: str) -> dict:
        """Renueva el token usando el refresh_token."""
        headers = {
            "Authorization": FitbitService.get_auth_headers(),
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token
        }
        
        with httpx.Client() as client:
            response = client.post(FITBIT_TOKEN_URL, headers=headers, data=data)
            response.raise_for_status()
            return response.json()

    @staticmethod
    def fetch_recent_activities(access_token: str, after_date: str) -> List[dict]:
        """Obtiene la lista de actividades recientes."""
        # Fitbit endpoint para lista de actividades.
        url = f"{FITBIT_API_BASEURL}/user/-/activities/list.json"
        params = {
            "afterDate": after_date,
            "sort": "asc",
            "limit": 100,
            "offset": 0
        }
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        
        try:
            with httpx.Client() as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
                return data.get("activities", [])
        except Exception as e:
            logger.error(f"Error al obtener actividades Fitbit: {e}")
            return []

    @staticmethod
    def fetch_profile(access_token: str) -> dict:
        """Devuelve el perfil del usuario de Fitbit."""
        headers = {"Authorization": f"Bearer {access_token}"}
        with httpx.Client() as client:
            response = client.get(f"{FITBIT_API_BASEURL}/user/-/profile.json", headers=headers)
            response.raise_for_status()
            return response.json().get("user", {})

    @staticmethod
    def fetch_daily_summary(access_token: str, date: str) -> dict:
        """Devuelve el resumen de actividad de un dia concreto (pasos, calorias, distancia, etc.)."""
        headers = {"Authorization": f"Bearer {access_token}"}
        with httpx.Client() as client:
            url = f"{FITBIT_API_BASEURL}/user/-/activities/date/{date}.json"
            response = client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()

    @staticmethod
    def fetch_heart_rate_zones(access_token: str, date: str) -> dict:
        """Devuelve las zonas de frecuencia cardiaca de un dia."""
        headers = {"Authorization": f"Bearer {access_token}"}
        with httpx.Client() as client:
            url = f"{FITBIT_API_BASEURL}/user/-/activities/heart/date/{date}/1d.json"
            response = client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()

