"""Flat chat history — messages stored with timestamps for time-window rate limiting."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models import ChatMessage

HISTORY_LIMIT = 10
RATE_LIMIT_COUNT = 5
RATE_LIMIT_HOURS = 2


def get_history(user_id: str, db: Session) -> list[dict]:
    rows = (
        db.query(ChatMessage)
        .filter_by(user_id=user_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    rows.reverse()
    return [{"role": r.role, "content": r.content} for r in rows]


def save_message(user_id: str, role: str, content: str, db: Session) -> None:
    db.add(ChatMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role=role,
        content=content,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    ))
    db.commit()


def count_recent_user_messages(user_id: str, db: Session) -> int:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=RATE_LIMIT_HOURS)
    return (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == user_id,
            ChatMessage.role == "user",
            ChatMessage.created_at >= cutoff,
        )
        .count()
    )


def get_window_info(user_id: str, db: Session) -> tuple[int, datetime | None]:
    """Return (used_count, window_start) where window_start is the oldest message
    in the current rate-limit window (first message time). Returns (0, None) if
    no messages exist in the window."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=RATE_LIMIT_HOURS)
    row = (
        db.query(ChatMessage.created_at)
        .filter(
            ChatMessage.user_id == user_id,
            ChatMessage.role == "user",
            ChatMessage.created_at >= cutoff,
        )
        .order_by(ChatMessage.created_at.asc())
        .first()
    )
    if row is None:
        return 0, None
    window_start = row.created_at
    used = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.user_id == user_id,
            ChatMessage.role == "user",
            ChatMessage.created_at >= window_start,
        )
        .count()
    )
    return used, window_start


def delete_history(user_id: str, db: Session) -> None:
    """Delete the user's entire chat history.

    Clearing the conversation removes every stored message for the user. The
    rate-limit window is time-based (see count_recent_user_messages), so a
    fresh start also resets the message allowance — acceptable in a personal,
    single-user deployment where the limit only throttles the owner.
    """
    db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id,
    ).delete()
    db.commit()
