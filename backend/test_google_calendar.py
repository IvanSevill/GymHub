import os
import datetime
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from dotenv import load_dotenv

# Scope necessary for reading and modifying calendar events
SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly']

def main():
    load_dotenv()
    
    # We will need the client ID and secret from the env to perform OAuth2 login for tests
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    
    if not client_id or client_id == "your_google_client_id":
        print("❌ ERROR: Debes configurar GOOGLE_CLIENT_ID en el archivo .env")
        return
        
    if not client_secret or client_secret == "your_google_client_secret":
        print("❌ ERROR: Debes configurar GOOGLE_CLIENT_SECRET en el archivo .env")
        return

    creds = None
    # We save a local token.json just for test runs so you don't have to login every time
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # We mock a client_secrets.json structure using our .env variables
            client_config = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": ["http://localhost"]
                }
            }
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)
            
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    # Now we instantiate the Calendar service
    service = build('calendar', 'v3', credentials=creds)

    print("\n✅ Conectado a Google Calendar con éxito!")
    print("----------------------------------------------------------------")
    print("Buscando tus calendarios disponibles...\n")

    # Call the Calendar API to list calendars
    calendar_list = service.calendarList().list().execute()
    calendars = calendar_list.get('items', [])

    if not calendars:
        print("❌ No se encontraron calendarios.")
        return
        
    gimnasio_id = None
    
    for calendar in calendars:
        name = calendar.get('summary')
        cal_id = calendar.get('id')
        print(f"📅 Nombre: {name}")
        print(f"   ID:     {cal_id}")
        print("---")
        
        if name.lower() == "gimnasio":
            gimnasio_id = cal_id
            
    if gimnasio_id:
        print(f"\n✅ ¡Encontré tu calendario 'Gimnasio'!")
        print(f"--> Por favor, copia este ID: {gimnasio_id}")
        print(f"--> Y pégalo en el archivo .env donde dice SELECTED_CALENDAR_ID={gimnasio_id}\n")
        
        # Now let's test fetching events from this calendar
        print(f"Buscando los próximos eventos en '{gimnasio_id}'...")
        now = datetime.datetime.utcnow().isoformat() + 'Z'
        events_result = service.events().list(calendarId=gimnasio_id, timeMin=now,
                                              maxResults=5, singleEvents=True,
                                              orderBy='startTime').execute()
        events = events_result.get('items', [])
        
        if not events:
            print("No tienes eventos próximos en el calendario Gimnasio.")
        else:
            for event in events:
                start = event['start'].get('dateTime', event['start'].get('date'))
                print(f"- {start} | {event['summary']}")
                
    else:
        print("\n❌ No encontré ningún calendario que se llame 'Gimnasio'. Revisa el listado de arriba.")

if __name__ == '__main__':
    main()
