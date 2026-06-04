from datetime import datetime

from sqlalchemy.orm import Session

from models import ChatMemory


def get_memories(user_id: str, db: Session) -> list[dict]:
    rows = (
        db.query(ChatMemory)
        .filter(ChatMemory.user_id == user_id)
        .order_by(ChatMemory.created_at.asc())
        .all()
    )
    return [
        {"id": r.id, "key": r.key, "value": r.value, "created_at": str(r.created_at)}
        for r in rows
    ]


def save_memory(user_id: str, key: str, value: str, db: Session) -> dict:
    existing = (
        db.query(ChatMemory)
        .filter(ChatMemory.user_id == user_id, ChatMemory.key == key)
        .first()
    )
    now = datetime.utcnow()
    if existing:
        existing.value = value
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "key": existing.key, "value": existing.value}
    mem = ChatMemory(user_id=user_id, key=key, value=value, created_at=now, updated_at=now)
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return {"id": mem.id, "key": mem.key, "value": mem.value}


def delete_memory(user_id: str, memory_id: str, db: Session) -> bool:
    mem = (
        db.query(ChatMemory)
        .filter(ChatMemory.id == memory_id, ChatMemory.user_id == user_id)
        .first()
    )
    if not mem:
        return False
    db.delete(mem)
    db.commit()
    return True
