import sys
import os
# Mantenemos tu configuración de path exacta para que encuentre 'models'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import datetime
import re
import tkinter as tk
from tkinter import messagebox
from tkinter import ttk
from collections import defaultdict
from app.database import SessionLocal
from app.models import User, UserTokens
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
import requests

class UnifyExercisesApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Unificador de Ejercicios - GymHub (Literal)")
        self.root.geometry("850x650")
        
        self.db = SessionLocal()
        user = self.db.query(User).filter(User.email.ilike("%ivan%")).first()
        if not user:
            user = self.db.query(User).first()
            
        if not user:
            messagebox.showerror("Error", "No se encontró ningún usuario.")
            sys.exit(1)
            
        user_tokens = self.db.query(UserTokens).filter(UserTokens.user_id == user.id).first()
        if not user_tokens or not user_tokens.google_access_token:
            messagebox.showerror("Error", "El usuario no tiene Google conectado.")
            sys.exit(1)
            
        creds = Credentials(token=user_tokens.google_access_token)
        self.service = build('calendar', 'v3', credentials=creds)
        self.calendar_id = user_tokens.selected_calendar_id or 'primary'
        self.user_email = user.email
        
        self.events = []
        self.unique_exercises = defaultdict(set)
        
        self.setup_ui()
        self.load_events()
        
    def setup_ui(self):
        main_frame = tk.Frame(self.root, padx=15, pady=15)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        left_frame = tk.Frame(main_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        tk.Label(left_frame, text="1. Selecciona ejercicios a unificar:", font=("Helvetica", 11, "bold")).pack(anchor="w")
        
        scroll = tk.Scrollbar(left_frame)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.tree = ttk.Treeview(left_frame, selectmode=tk.EXTENDED, yscrollcommand=scroll.set, height=20)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.tree.heading("#0", text="Músculo / Ejercicio", anchor="w")
        
        style = ttk.Style()
        style.configure("Treeview", font=("Consolas", 10), rowheight=25)
        
        scroll.config(command=self.tree.yview)
        
        right_frame = tk.Frame(main_frame, padx=20)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        tk.Label(right_frame, text="2. Nuevo nombre (respeta tildes/mayúsculas):", font=("Helvetica", 11, "bold")).pack(anchor="w", pady=(0, 5))
        self.entry_new_name = tk.Entry(right_frame, font=("Helvetica", 11), width=35)
        self.entry_new_name.pack(anchor="w", pady=(0, 20))
        
        self.btn_unify = tk.Button(right_frame, text="🔄 Unificar en Google Calendar", 
                                   command=self.unify_and_upload, bg="#1976D2", fg="white", font=("Helvetica", 10, "bold"), pady=8)
        self.btn_unify.pack(fill=tk.X, pady=(0, 20))
        
        self.log_text = tk.Text(right_frame, height=18, width=45, font=("Consolas", 9), state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def log(self, text):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, text + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.root.update()

    def parse_line(self, line):
        if not line.startswith("✅"):
            return None
        match = re.search(r'✅\s*(.*?)\s*-\s*(.*?)([\d\(].*)?$', line)
        if match:
            # Aquí devolvemos el texto TAL CUAL, con sus tildes y mayúsculas
            muscle = match.group(1).strip()
            exercise = match.group(2).strip()
            weight = match.group(3).strip() if match.group(3) else ""
            return muscle, exercise, weight
        return None

    def load_events(self):
        self.log("Cargando eventos de Calendar...")
        time_max = datetime.datetime(2030, 1, 1).isoformat() + 'Z'
        time_min = datetime.datetime(2020, 1, 1).isoformat() + 'Z'
        
        try:
            self.events = []
            page_token = None
            while True:
                events_result = self.service.events().list(
                    calendarId=self.calendar_id, timeMin=time_min, timeMax=time_max,
                    singleEvents=True, orderBy='startTime', maxResults=2500, pageToken=page_token
                ).execute()
                self.events.extend(events_result.get('items', []))
                page_token = events_result.get('nextPageToken')
                if not page_token: break
            
            self.unique_exercises.clear()
            for item in self.events:
                desc = item.get('description', '')
                if not desc: continue
                for line in desc.split('\n'):
                    parsed = self.parse_line(line.strip())
                    if parsed:
                        muscle, exercise, _ = parsed
                        # Sin normalizar: 'Bíceps' es distinto de 'biceps'
                        if exercise and muscle:
                            self.unique_exercises[muscle].add(exercise)
            
            self.refresh_listbox()
            self.log(f"¡Cargados {len(self.events)} eventos!")
        except Exception as e:
            messagebox.showerror("Error", str(e))

    def refresh_listbox(self):
        for item in self.tree.get_children(): self.tree.delete(item)
        for muscle in sorted(self.unique_exercises.keys()):
            parent_id = self.tree.insert("", tk.END, text=f"💪 {muscle}", open=True)
            for ex in sorted(list(self.unique_exercises[muscle])):
                self.tree.insert(parent_id, tk.END, text=ex)

    def unify_and_upload(self):
        selected_items = self.tree.selection()
        new_name = self.entry_new_name.get().strip()
        
        if not selected_items or not new_name:
            messagebox.showwarning("Aviso", "Selecciona ejercicios y escribe un nombre.")
            return
            
        selected_pairs = []
        for item in selected_items:
            if not self.tree.get_children(item):
                parent_id = self.tree.parent(item)
                muscle = self.tree.item(parent_id, "text").replace("💪 ", "")
                exercise = self.tree.item(item, "text")
                selected_pairs.append((muscle, exercise))
        
        if not messagebox.askyesno("Confirmar", f"¿Unificar a '{new_name}'?"): return
            
        self.btn_unify.config(state=tk.DISABLED)
        events_updated_count = 0
        
        for item in self.events:
            desc = item.get('description', '')
            if not desc: continue
            lines = desc.split('\n')
            new_lines = []
            changed = False
            
            for line in lines:
                parsed = self.parse_line(line.strip())
                if parsed:
                    m, e, w = parsed
                    # Match exacto (sensible a tildes y mayúsculas)
                    if any(m == sel_m and e == sel_e for sel_m, sel_e in selected_pairs):
                        spacer = " " if w else ""
                        new_lines.append(f"✅{m} - {new_name}{spacer}{w}".strip())
                        changed = True
                    else:
                        new_lines.append(line.strip())
                else:
                    new_lines.append(line.strip())
            
            if changed:
                try:
                    self.service.events().patch(
                        calendarId=self.calendar_id,
                        eventId=item['id'],
                        body={'description': '\n'.join(new_lines)}
                    ).execute()
                    events_updated_count += 1
                except: pass

        self.log(f"✅ Actualizados {events_updated_count} eventos.")
        self.load_events()
        self.btn_unify.config(state=tk.NORMAL)

        # Sync backend (localhost)
        try:
            requests.post(f"http://localhost:8000/workouts/sync-all?user_email={self.user_email}", timeout=5)
        except: pass

if __name__ == "__main__":
    root = tk.Tk()
    app = UnifyExercisesApp(root)
    root.mainloop()