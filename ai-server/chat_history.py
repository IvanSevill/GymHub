"""Ring-buffer chat history — 10 message slots per user.

Slot 0..9 are reused in order. `ChatCursor.next_slot` is the pointer
to the next slot to overwrite (always the oldest message when full).
"""

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from models import ChatCursor, ChatEntry

BUFFER_SIZE = 10


def get_history(user_id: str, db: Session) -> list[dict]:
    """Return messages in chronological order (oldest first)."""
    cursor = db.query(ChatCursor).filter_by(user_id=user_id).first()
    if not cursor or cursor.total_written == 0:
        return []

    entries = {
        e.slot: e
        for e in db.query(ChatEntry).filter_by(user_id=user_id).all()
    }

    filled = min(cursor.total_written, BUFFER_SIZE)
    if cursor.total_written < BUFFER_SIZE:
        # Buffer not yet full: slots 0 .. filled-1 in insertion order
        order = list(range(filled))
    else:
        # Full: oldest slot is next_slot, wrap around
        start = cursor.next_slot
        order = [(start + i) % BUFFER_SIZE for i in range(BUFFER_SIZE)]

    return [
        {"role": entries[s].role, "content": entries[s].content}
        for s in order
        if s in entries
    ]


def save_message(user_id: str, role: str, content: str, db: Session) -> None:
    """Write one message into the ring buffer, advancing the pointer."""
    cursor = (
        db.query(ChatCursor)
        .filter_by(user_id=user_id)
        .with_for_update()
        .first()
    )
    if not cursor:
        cursor = ChatCursor(user_id=user_id, next_slot=0, total_written=0)
        db.add(cursor)
        db.flush()

    slot = cursor.next_slot
    now = datetime.utcnow()

    existing = db.query(ChatEntry).filter_by(user_id=user_id, slot=slot).first()
    if existing:
        existing.role = role
        existing.content = content
        existing.created_at = now
    else:
        db.add(ChatEntry(
            id=str(uuid.uuid4()),
            user_id=user_id,
            slot=slot,
            role=role,
            content=content,
            created_at=now,
        ))

    cursor.next_slot = (slot + 1) % BUFFER_SIZE
    cursor.total_written += 1
    db.commit()
