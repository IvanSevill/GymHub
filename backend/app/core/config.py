import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(BASE_DIR, ".env"))

class Settings:
    PROJECT_NAME: str = "GymHub"
    DB_URL: str = os.getenv("DB_URL", "sqlite:///./gymhub_v2.db")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET")
    FITBIT_CLIENT_ID: str = os.getenv("FITBIT_CLIENT_ID")
    FITBIT_CLIENT_SECRET: str = os.getenv("FITBIT_CLIENT_SECRET")
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", 8000))
    ROOT_USERS_FILE: str = os.path.join(BASE_DIR, "root_users.json")
    ROOT_EMAILS: str = os.getenv("ROOT_EMAILS", "") # Comma separated
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

settings = Settings()
