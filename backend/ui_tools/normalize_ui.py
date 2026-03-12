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

        # Eliminar etiqueta [GymHub] para procesar el contenido limpio
        clean_text = text.replace("[GymHub]", "").strip()
        lines = clean_text.split('\n')
        new_lines = []
        
        # Mapeo de músculos para unificación (Normalizado - Músculo base)
        muscle_synonyms = {
            'pecho': 'Pecho',
            'espalda': 'Espalda',
            'hombro': 'Hombro', 'hombros': 'Hombro',
            'biceps': 'Biceps',
            'triceps': 'Triceps',
            'pierna': 'Pierna', 'piernas': 'Pierna',
            'cuadriceps': 'Cuadriceps', 'cuadiceps': 'Cuadriceps',
            'gluteo': 'Gluteo', 'gluteos': 'Gluteo',
            'femoral': 'Femoral',
            'gemelo': 'Gemelo', 'gemelos': 'Gemelo',
            'abdomen': 'Abdominales', 'abdominales': 'Abdominales'
        }
        
        for line in lines:
            line = line.strip()
            if not line:
                new_lines.append("")
                continue
                
            # Limpiar línea (sin checkmarks ni emojis de GymHub antiguos)
            line = re.sub(r"^[✅•\-\*\s]+", "", line).strip()
            line = line.replace("(", "").replace(")", "")
            
            # Buscar coincidencia de músculo
            line_no_accents = remove_accents(line).lower()
            matched_muscle = None
            
            # Separar por guiones si ya vienen con formato semi-válido
            parts = [p.strip() for p in line.split('-')] if '-' in line else [line]
            
            for syn, base in muscle_synonyms.items():
                if syn in line_no_accents:
                    matched_muscle = base
                    break
            
            if matched_muscle:
                # Extraer ejercicio y valor si existe
                # Pattern: Intenta separar "Músculo - Ejercicio 50kg" o similares
                content = line
                if '-' in content:
                    # Si ya tiene guion, confiamos en que lo que hay después es el ejercicio
                    content = content.split('-', 1)[1].strip()
                
                # Quitar el nombre del músculo del nombre del ejercicio si está presente
                content_no_accents = remove_accents(content).lower()
                clean_muscle_name = remove_accents(matched_muscle).lower()
                if content_no_accents.startswith(clean_muscle_name):
                    content = content[len(matched_muscle):].strip()
                    # Quitar guiones o puntos iniciales residuales
                    content = re.sub(r"^[\-\.\:\s]+", "", content)

                # Limpieza de valores 0kg (GymHub standar)
                # Si la línea termina en un número 0 o 0kg/0lb
                if re.search(r"\s+0\s*[a-zA-Z]*$", content) or content.endswith(" 0"):
                    content = re.sub(r"\s+0\s*[a-zA-Z]*$", "", content).strip()

                line = f"{matched_muscle} - {content}"
                
            new_lines.append(line.strip())
            
        final_desc = "[GymHub]\n" + "\n".join([l for l in new_lines if l])
        return final_desc.strip()

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
