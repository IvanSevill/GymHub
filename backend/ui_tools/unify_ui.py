import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sys
import datetime
import re
import tkinter as tk
from tkinter import messagebox
from tkinter import ttk
from collections import defaultdict
from sqlalchemy.orm import Session
from models import SessionLocal, User
from google_calendar import GoogleCalendarService

class UnifyExercisesApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Unificador de Ejercicios por Músculo - GymHub")
        self.root.geometry("850x650")
        
        self.db = SessionLocal()
        user = self.db.query(User).filter(User.email.ilike("%ivan%")).first()
        if not user:
            user = self.db.query(User).first()
            
        if not user:
            messagebox.showerror("Error", "No se encontró ningún usuario.")
            sys.exit(1)
            
        self.cal_service = GoogleCalendarService(user, self.db)
        self.calendar_id = user.selected_calendar_id or 'primary'
        
        self.events = []
        self.unique_exercises = defaultdict(set)
        
        self.setup_ui()
        self.load_events()
        
    def setup_ui(self):
        # Frame principal
        main_frame = tk.Frame(self.root, padx=15, pady=15)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Frame izquierdo para la lista (ahora un Treeview)
        left_frame = tk.Frame(main_frame)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        tk.Label(left_frame, text="1. Selecciona ejercicios a unificar:", font=("Helvetica", 11, "bold")).pack(anchor="w")
        tk.Label(left_frame, text="(Puedes abrir los grupos musculares y seleccionar varios)", font=("Helvetica", 9)).pack(anchor="w", pady=(0, 5))
        
        # Scrollbar y Treeview
        scroll = tk.Scrollbar(left_frame)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.tree = ttk.Treeview(left_frame, selectmode=tk.EXTENDED, yscrollcommand=scroll.set, height=20)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.tree.heading("#0", text="Músculo / Ejercicio", anchor="w")
        
        # Opcional: ajustar tamaño fuente del Treeview
        style = ttk.Style()
        style.configure("Treeview", font=("Consolas", 10), rowheight=25)
        style.configure("Treeview.Heading", font=("Helvetica", 10, "bold"))
        
        scroll.config(command=self.tree.yview)
        
        # Frame derecho para las acciones
        right_frame = tk.Frame(main_frame, padx=20)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y)
        
        tk.Label(right_frame, text="2. Escribe el nuevo nombre único:", font=("Helvetica", 11, "bold")).pack(anchor="w", pady=(0, 5))
        self.entry_new_name = tk.Entry(right_frame, font=("Helvetica", 11), width=35)
        self.entry_new_name.pack(anchor="w", pady=(0, 20))
        
        self.btn_unify = tk.Button(right_frame, text="🔄 Unificar y Subir a Google Calendar", 
                                   command=self.unify_and_upload, bg="#1976D2", fg="white", font=("Helvetica", 10, "bold"), pady=8)
        self.btn_unify.pack(fill=tk.X, pady=(0, 20))
        
        tk.Label(right_frame, text="Log de resultados:", font=("Helvetica", 11, "bold")).pack(anchor="w", pady=(0, 5))
        self.log_text = tk.Text(right_frame, height=18, width=45, font=("Consolas", 9), state=tk.DISABLED)
        self.log_text.pack(fill=tk.BOTH, expand=True)

    def log(self, text):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, text + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.root.update()

    def normalize_str(self, text):
        import unicodedata
        if not text:
            return ""
        nfkd_form = unicodedata.normalize('NFKD', text)
        return "".join([c for c in nfkd_form if not unicodedata.combining(c)]).strip()

    def parse_line(self, line):
        """
        Extrae Músculo, Ejercicio y Peso.
        Ej: '✅Espalda - Remo agarre neutro 50kg'
        """
        if not line.startswith("✅"):
            return None
            
        match = re.search(r'✅\s*(.*?)\s*-\s*(.*?)([\d\(].*)?$', line)
        if match:
            muscle = match.group(1).strip()
            exercise = match.group(2).strip()
            weight = match.group(3).strip() if match.group(3) else ""
            return muscle, exercise, weight
        return None

    def load_events(self):
        self.log("Obteniendo eventos de Google Calendar...\n(Esto puede tardar unos segundos)")
        
        time_max = datetime.datetime(2030, 1, 1).isoformat() + 'Z'
        time_min = datetime.datetime(2020, 1, 1).isoformat() + 'Z'
        
        try:
            self.events = []
            page_token = None
            while True:
                events_result = self.cal_service.service.events().list(
                    calendarId=self.calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy='startTime',
                    maxResults=2500,
                    pageToken=page_token
                ).execute()
                
                self.events.extend(events_result.get('items', []))
                page_token = events_result.get('nextPageToken')
                if not page_token:
                    break
            
            self.unique_exercises.clear()
            
            total_exercises = 0
            for item in self.events:
                desc = item.get('description', '')
                if not desc:
                    continue
                for line in desc.split('\n'):
                    parsed = self.parse_line(line.strip())
                    if parsed:
                        muscle, exercise, _ = parsed
                        muscle_norm = self.normalize_str(muscle).capitalize()
                        exercise_norm = self.normalize_str(exercise).capitalize()
                        if exercise_norm and muscle_norm:
                            if exercise_norm not in self.unique_exercises[muscle_norm]:
                                self.unique_exercises[muscle_norm].add(exercise_norm)
                                total_exercises += 1
                            
            self.refresh_listbox()
            self.log(f"¡Cargados {len(self.events)} eventos!")
            self.log(f"Se encontraron {total_exercises} ejercicios clasificados por músculo.")
            
        except Exception as e:
            messagebox.showerror("Error", f"Error al cargar eventos:\n{e}")

    def refresh_listbox(self):
        # Limpiar el Treeview
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # Rellenar con los grupos musculares y sus hijos
        for muscle in sorted(self.unique_exercises.keys()):
            if not self.unique_exercises[muscle]:
                continue
            parent_id = self.tree.insert("", tk.END, text=f"💪 {muscle}", open=True)
            
            for ex in sorted(list(self.unique_exercises[muscle])):
                self.tree.insert(parent_id, tk.END, text=ex)

    def unify_and_upload(self):
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showwarning("Aviso", "No has seleccionado ningún ejercicio del árbol.")
            return
            
        new_name = self.entry_new_name.get().strip()
        if not new_name:
            messagebox.showwarning("Aviso", "Escribe el nuevo nombre único para los ejercicios seleccionados.")
            return
            
        selected_pairs = []
        for item in selected_items:
            # Los elementos finales (ejercicios) no tienen hijos
            if not self.tree.get_children(item):
                parent_id = self.tree.parent(item)
                muscle_raw = self.tree.item(parent_id, "text")
                muscle = muscle_raw.replace("💪 ", "") # Limpiar el icono
                exercise = self.tree.item(item, "text")
                selected_pairs.append((muscle, exercise))
                
        if not selected_pairs:
            messagebox.showwarning("Aviso", "Has seleccionado un grupo muscular entero. Abre el grupo y selecciona los ejercicios individuales que quieres unificar.")
            return
            
        confirm = messagebox.askyesno("Confirmar", f"Se unificarán {len(selected_pairs)} ejercicios bajo el nombre:\n'{new_name}'\n\n¿Estás seguro/a? (Se actualizará Google Calendar de forma inmediata)")
        if not confirm:
            return
            
        self.btn_unify.config(state=tk.DISABLED)
        self.log(f"\nUnificando a -> {new_name}...")
        
        events_updated_count = 0
        
        # Procesar todos los eventos
        for item in self.events:
            desc = item.get('description', '')
            if not desc:
                continue
                
            lines = desc.split('\n')
            new_lines = []
            changed = False
            
            for line in lines:
                line_str = line.strip()
                parsed = self.parse_line(line_str)
                if parsed:
                    muscle, exercise, weight = parsed
                    # Verificamos si este combo músculo+ejercicio exacto estaba seleccionado
                    match = False
                    muscle_norm = self.normalize_str(muscle).capitalize()
                    exercise_norm = self.normalize_str(exercise).capitalize()
                    
                    for (sel_muscle, sel_ex) in selected_pairs:
                        if muscle_norm == sel_muscle and exercise_norm == sel_ex:
                            match = True
                            break
                            
                    if match:
                        spacer = " " if weight else ""
                        new_line = f"✅{muscle_norm} - {new_name}{spacer}{weight}".strip()
                        new_lines.append(new_line)
                        changed = True
                    else:
                        new_lines.append(line_str)
                else:
                    new_lines.append(line_str)
                    
            if changed:
                new_desc = '\n'.join(new_lines)
                try:
                    self.cal_service.update_event(
                        event_id=item['id'],
                        title=item.get('summary', ''),
                        description=new_desc,
                        calendar_id=self.calendar_id
                    )
                    item['description'] = new_desc
                    events_updated_count += 1
                except Exception as e:
                    self.log(f"❌ Error al actualizar {item.get('start', {}).get('date', '')}: {e}")

        self.log(f"✅ ¡Excelente! Se modificaron {events_updated_count} eventos.")
        
        # Limpiar la caché local y refrescar la vista
        for mus, ex in selected_pairs:
            if ex in self.unique_exercises[mus]:
                self.unique_exercises[mus].remove(ex)
            self.unique_exercises[mus].add(new_name)
            
        self.refresh_listbox()
        self.entry_new_name.delete(0, tk.END)
        self.btn_unify.config(state=tk.NORMAL)

        # Disparar resincronización automatica en el backend para que la Web se entere localmente
        try:
            import requests
            user_email = "ivansevillano2005@gmail.com"  # O extraer del objeto user
            ans = requests.post(f"http://localhost:8000/sync/manual?user_email={user_email}", timeout=10)
            if ans.status_code == 200:
                self.log("✅ ¡GymHub Web sincronizado (recarga la página)!")
            else:
                self.log(f"⚠️ Aviso: Sincronización web devolvió {ans.status_code}.")
        except Exception as e:
            self.log(f"⚠️ Aviso: No se pudo auto-sincronizar GymHub Web, pulsa Sincronizar en la web.")

    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    root = tk.Tk()
    app = UnifyExercisesApp(root)
    root.mainloop()
