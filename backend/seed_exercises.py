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
            {"name": "press de banca", "muscle": "pecho"},
            {"name": "press inclinado", "muscle": "pecho"},
            {"name": "aperturas con mancuernas", "muscle": "pecho"},
            # Hombro
            {"name": "press militar", "muscle": "hombro"},
            {"name": "elevaciones laterales", "muscle": "hombro"},
            {"name": "pájaros", "muscle": "hombro"},
            # Triceps
            {"name": "extensión de triceps", "muscle": "triceps"},
            {"name": "press francés", "muscle": "triceps"},
            {"name": "fondos", "muscle": "triceps"},
            # Biceps
            {"name": "curl de biceps", "muscle": "biceps"},
            {"name": "curl martillo", "muscle": "biceps"},
            {"name": "curl concentrado", "muscle": "biceps"},
            # Espalda
            {"name": "dominadas", "muscle": "espalda"},
            {"name": "remo con barra", "muscle": "espalda"},
            {"name": "jalón al pecho", "muscle": "espalda"},
            # Abdominales
            {"name": "crunch abdominal", "muscle": "abdominales"},
            {"name": "plancha", "muscle": "abdominales"},
            {"name": "elevación de piernas", "muscle": "abdominales"},
            # Pierna
            {"name": "sentadillas", "muscle": "cuadriceps"},
            {"name": "prensa", "muscle": "cuadriceps"},
            {"name": "peso muerto rumano", "muscle": "femoral"},
            {"name": "curl femoral", "muscle": "femoral"},
            {"name": "extensiones de cuadriceps", "muscle": "cuadriceps"},
            {"name": "elevación de gemelos", "muscle": "gemelos"},
            {"name": "hip thrust", "muscle": "gluteos"},
            # Cardio
            {"name": "cardio", "muscle": "cardio"},
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
