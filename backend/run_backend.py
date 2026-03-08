import uvicorn
import os
import sys

# Ensure the root directory is in sys.path so 'app' can be imported
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from app.main import app

if __name__ == "__main__":
    from app.core.config import settings
    print(f"Starting GymHub Backend from redirection wrapper...")
    uvicorn.run("app.main:app", host=settings.BACKEND_HOST, port=settings.BACKEND_PORT, reload=True)
