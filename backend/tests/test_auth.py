import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import os
import requests
from dotenv import load_dotenv

load_dotenv()

client_id = os.getenv("GOOGLE_CLIENT_ID")
secret = os.getenv("GOOGLE_CLIENT_SECRET")
print(f"ID is: {client_id}")
print(f"Secret is present: {bool(secret)}")
