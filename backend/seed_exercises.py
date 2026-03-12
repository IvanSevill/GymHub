from sqlalchemy import create_mock_engine
from sqlalchemy.orm import sessionmaker
from app.database import SessionLocal
from app import models

def seed():
    db = SessionLocal()
    try:
        # Get muscles
        muscles = {m.name: m.id for m in db.query(models.Muscle).all()}
        
        exercises = [
            # Pecho
            {"name": "Press de Banca", "muscle": "pecho"},
            {"name": "Press Inclinado", "muscle": "pecho"},
            {"name": "Aperturas con Mancuernas", "muscle": "pecho"},
            # Hombro
            {"name": "Press Militar", "muscle": "hombro"},
            {"name": "Elevaciones Laterales", "muscle": "hombro"},
            {"name": "Pájaros", "muscle": "hombro"},
            # Triceps
            {"name": "Extensión de Triceps", "muscle": "triceps"},
            {"name": "Press Francés", "muscle": "triceps"},
            {"name": "Fondos", "muscle": "triceps"},
            # Biceps
            {"name": "Curl de Biceps", "muscle": "biceps"},
            {"name": "Curl Martillo", "muscle": "biceps"},
            {"name": "Curl Concentrado", "muscle": "biceps"},
            # Espalda
            {"name": "Dominadas", "muscle": "espalda"},
            {"name": "Remo con Barra", "muscle": "espalda"},
            {"name": "Jalón al Pecho", "muscle": "espalda"},
            # Abdominales
            {"name": "Crunch Abdominal", "muscle": "abdominales"},
            {"name": "Plancha", "muscle": "abdominales"},
            {"name": "Elevación de Piernas", "muscle": "abdominales"},
            # Pierna
            {"name": "Sentadillas", "muscle": "cuadriceps"},
            {"name": "Prensa", "muscle": "cuadriceps"},
            {"name": "Peso Muerto Rumano", "muscle": "femoral"},
            {"name": "Curl Femoral", "muscle": "femoral"},
            {"name": "Extensiones de Cuadriceps", "muscle": "cuadriceps"},
            {"name": "Elevación de Gemelos", "muscle": "gemelos"},
            {"name": "Hip Thrust", "muscle": "gluteos"},
        ]

        for e_data in exercises:
            m_name = e_data["muscle"]
            if m_name in muscles:
                if not db.query(models.Exercise).filter(models.Exercise.name == e_data["name"]).first():
                    ex = models.Exercise(name=e_data["name"], muscle_id=muscles[m_name])
                    db.add(ex)
        
        db.commit()
        print("Exercises seeded successfully")
    except Exception as e:
        print(f"Error seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()
