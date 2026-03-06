import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sys
import json
import datetime
import tkinter as tk
from tkinter import messagebox
from sqlalchemy.orm import Session
from models import SessionLocal, User
from google_calendar import GoogleCalendarService

class CalendarNormalizerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Normalizador de Eventos - GymHub")
        self.root.geometry("650x650")
        
        # Cargar BD y Servicio
        self.db = SessionLocal()
        user = self.db.query(User).filter(User.email.ilike("%ivan%")).first()
        if not user:
            user = self.db.query(User).first()
            
        if not user:
            messagebox.showerror("Error", "No se encontró ningún usuario en la base de datos.")
            sys.exit(1)
            
        self.cal_service = GoogleCalendarService(user, self.db)
        self.calendar_id = user.selected_calendar_id or 'primary'
        
        print("Obteniendo eventos desde Google Calendar...")
        time_max = datetime.datetime(2026, 1, 1).isoformat() + 'Z'
        time_min = datetime.datetime(2020, 1, 1).isoformat() + 'Z'
        
        try:
            events_result = self.cal_service.service.events().list(
                calendarId=self.calendar_id,
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy='startTime',
                maxResults=2500
            ).execute()
            
            items = events_result.get('items', [])
            items = sorted(items, key=lambda x: x.get('start', {}).get('dateTime', x.get('start', {}).get('date')), reverse=True)
            
            self.events = []
            for item in items:
                self.events.append({
                    'id': item.get('id'),
                    'date': item.get('start', {}).get('dateTime', item.get('start', {}).get('date')),
                    'title': item.get('summary', ''),
                    'description': item.get('description', '')
                })
        except Exception as e:
            messagebox.showerror("Error", f"Error al obtener eventos de Google:\n{e}")
            sys.exit(1)
            
        self.current_index = 0
        
        self.setup_ui()
        self.load_event()
        
    def setup_ui(self):
        self.info_lbl = tk.Label(self.root, text="", font=("Helvetica", 12, "bold"))
        self.info_lbl.pack(pady=10)
        
        tk.Label(self.root, text="Título del Evento:").pack()
        self.title_entry = tk.Entry(self.root, width=80, font=("Helvetica", 11))
        self.title_entry.pack(pady=5)
        
        tk.Label(self.root, text="Descripción (Datos del Entrenamiento):").pack()
        self.desc_text = tk.Text(self.root, width=80, height=22, font=("Consolas", 10))
        self.desc_text.pack(pady=5)
        
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(pady=15)
        
        tk.Button(btn_frame, text="⬅ Anterior", command=self.prev_event, width=15).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="Ignorar ➡", command=self.next_event, width=15).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="💾 Guardar en Calendar y Siguiente", command=self.save_and_next, bg="#2e7d32", fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=10)
        
    def normalize_text(self, text):
        import re
        import unicodedata
        
        def remove_accents(input_str):
            nfkd_form = unicodedata.normalize('NFKD', input_str)
            return u"".join([c for c in nfkd_form if not unicodedata.combining(c)])

        lines = text.split('\n')
        new_lines = []
        muscles = ['Pecho', 'Espalda', 'Hombros', 'Hombro', 'Biceps', 'Triceps', 'Piernas', 'Pierna', 'Cuadriceps', 'Gluteo', 'Femoral', 'Gemelos', 'Abdomen', 'Abdominales', 'Sentadillas', 'Sentadilla']
        
        for line in lines:
            line = line.strip()
            if not line:
                new_lines.append("")
                continue
                
            has_check = "✅" in line
            line = line.replace("✅", "").strip()
            line = line.replace("(", "").replace(")", "")
            
            # Quitar tildes para la comparación
            line_no_accents = remove_accents(line)
            
            matched_muscle = None
            for m in muscles:
                m_no_accents = remove_accents(m)
                if m_no_accents.lower() in line_no_accents.lower():
                    matched_muscle = m
                    # Estándar sin tildes
                    if m.lower() in ['hombros']: matched_muscle = 'Hombro'
                    elif m.lower() in ['biceps']: matched_muscle = 'Biceps'
                    elif m.lower() in ['triceps']: matched_muscle = 'Triceps'
                    elif m.lower() in ['abdomen', 'abdominales']: matched_muscle = 'Abdominales'
                    elif m.lower() in ['cuadriceps', 'cuadiceps']: matched_muscle = 'Cuadriceps'
                    elif m.lower() in ['gluteo']: matched_muscle = 'Gluteo'
                    elif m.lower() in ['piernas']: matched_muscle = 'Pierna'
                    elif m.lower() in ['sentadillas', 'sentadilla']: matched_muscle = 'Cuadriceps'
                    break
                    
            if matched_muscle:
                # Quitar el músculo del principio por si estaba repetido (para no poner Hombro - Hombro...)
                pattern = re.compile(r'^\s*' + re.escape(matched_muscle) + r'\s*[-–/:]?\s*', re.IGNORECASE)
                if pattern.search(line_no_accents):
                    # Aplicarlo a la línea original sin tildes
                    line = pattern.sub('', line_no_accents)
                else:
                    # Aplicarlo igual por si caso estaba al principio de alguna manera
                    line = line_no_accents
                    
                line = f"{matched_muscle} - {line.strip()}"
                
            if has_check:
                line = f"✅{line}"
                
            new_lines.append(line.strip())
            
        return '\n'.join(new_lines)

    def load_event(self):
        if self.current_index >= len(self.events):
            messagebox.showinfo("Fin", "¡Has revisado todos los eventos!")
            self.current_index = len(self.events) - 1
            return
        if self.current_index < 0:
            self.current_index = 0
            return
            
        evt = self.events[self.current_index]
        self.info_lbl.config(text=f"Entrenamiento {self.current_index + 1} de {len(self.events)} | Fecha: {evt['date'].split('T')[0]}")
        
        self.title_entry.delete(0, tk.END)
        self.title_entry.insert(0, evt.get('title', ''))
        
        normalized_desc = self.normalize_text(evt.get('description', ''))
        self.desc_text.delete("1.0", tk.END)
        self.desc_text.insert(tk.END, normalized_desc)
        
    def next_event(self):
        self.current_index += 1
        self.load_event()
        
    def prev_event(self):
        self.current_index -= 1
        self.load_event()
        
    def save_and_next(self):
        evt = self.events[self.current_index]
        new_title = self.title_entry.get().strip()
        new_desc = self.desc_text.get("1.0", tk.END).strip()
        
        try:
            self.cal_service.update_event(
                event_id=evt['id'],
                title=new_title,
                description=new_desc,
                calendar_id=self.calendar_id
            )
            # Actualizamos la variable en memoria por si retrocedes, pero ya no modificamos el archivo
            self.events[self.current_index]['title'] = new_title
            self.events[self.current_index]['description'] = new_desc
                
        except Exception as e:
            messagebox.showerror("Error", f"Error al actualizar en Google Calendar:\n{e}")
            return
            
        self.next_event()

if __name__ == "__main__":
    root = tk.Tk()
    app = CalendarNormalizerApp(root)
    root.mainloop()
