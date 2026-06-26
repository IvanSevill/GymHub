"""AI assistant (GymChat) persistence: chat history, memory and rate-limit usage.

These endpoints own the chat_messages, chat_usage and chat_memories tables so
the AI server never touches the database directly — it reaches them through the
backend REST API like any other client, authenticated with the user's JWT.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])

HISTORY_LIMIT = 10
RATE_LIMIT_COUNT = 5
RATE_LIMIT_HOURS = 2


def _is_root(user: models.User) -> bool:
    root_emails = [e.strip() for e in os.getenv("ROOT_EMAILS", "").split(",") if e.strip()]
    return bool(user.is_root) or user.email in root_emails


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------

@router.get("/history", response_model=List[schemas.ChatMessageItem])
async def get_history(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return the last HISTORY_LIMIT messages for the user, oldest first."""
    rows = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.user_id == current_user.id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(HISTORY_LIMIT)
        .all()
    )
    rows.reverse()
    return [{"role": r.role, "content": r.content} for r in rows]


@router.post("/history", response_model=dict)
async def save_message(
    message: schemas.ChatMessageItem,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Persist a chat message. A 'user' message also counts towards the rate limit."""
    now = datetime.utcnow()
    db.add(
        models.ChatMessage(
            user_id=current_user.id,
            role=message.role,
            content=message.content,
            created_at=now,
        )
    )
    # Track usage independently of visible history so clearing the chat does
    # not reset the allowance. Root users are never rate-limited, so we skip
    # logging usage rows for them entirely.
    if message.role == "user" and not _is_root(current_user):
        window = timedelta(hours=RATE_LIMIT_HOURS)
        last = (
            db.query(models.ChatUsage)
            .filter(models.ChatUsage.user_id == current_user.id)
            .order_by(models.ChatUsage.created_at.desc())
            .first()
        )
        # Open a new window when there is no prior usage or the window anchored
        # at its first message has fully elapsed; otherwise stay in the current
        # window. Every message in the same window shares one window_start.
        if last is None or last.window_start is None or now >= last.window_start + window:
            window_start = now
        else:
            window_start = last.window_start
        db.add(
            models.ChatUsage(
                user_id=current_user.id,
                created_at=now,
                window_start=window_start,
            )
        )
    db.commit()
    return {"ok": True}


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete the user's entire chat history (rate-limit usage is preserved)."""
    db.query(models.ChatMessage).filter(
        models.ChatMessage.user_id == current_user.id
    ).delete()
    db.commit()


# ---------------------------------------------------------------------------
# Rate-limit usage
# ---------------------------------------------------------------------------

@router.get("/usage", response_model=schemas.ChatUsageInfo)
async def get_usage(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return the user's message usage in the current rate-limit window.

    The window is a fixed window anchored at its first message: it allows
    RATE_LIMIT_COUNT messages and resets exactly RATE_LIMIT_HOURS after that
    first message. Root users are exempt (no limit).
    """
    if _is_root(current_user):
        return {"used": 0, "limit": None, "reset_at": None, "is_root": True}

    now = datetime.utcnow()
    window = timedelta(hours=RATE_LIMIT_HOURS)
    last = (
        db.query(models.ChatUsage)
        .filter(models.ChatUsage.user_id == current_user.id)
        .order_by(models.ChatUsage.created_at.desc())
        .first()
    )
    # No usage yet, or the window anchored at the first message has elapsed:
    # the allowance is fully reset (a clean reset, not a sliding one).
    if last is None or last.window_start is None or now >= last.window_start + window:
        return {"used": 0, "limit": RATE_LIMIT_COUNT, "reset_at": None, "is_root": False}

    window_start = last.window_start
    used = (
        db.query(models.ChatUsage)
        .filter(
            models.ChatUsage.user_id == current_user.id,
            models.ChatUsage.window_start == window_start,
        )
        .count()
    )
    reset_at = (window_start + window).isoformat() + "Z"
    return {"used": used, "limit": RATE_LIMIT_COUNT, "reset_at": reset_at, "is_root": False}


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@router.get("/memory", response_model=List[schemas.ChatMemoryItem])
async def get_memories(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Return all stored memory facts for the user, oldest first."""
    rows = (
        db.query(models.ChatMemory)
        .filter(models.ChatMemory.user_id == current_user.id)
        .order_by(models.ChatMemory.created_at.asc())
        .all()
    )
    return [
        {"id": r.id, "key": r.key, "value": r.value, "created_at": str(r.created_at)}
        for r in rows
    ]


@router.post("/memory", response_model=schemas.ChatMemoryItem)
async def save_memory(
    memory: schemas.ChatMemoryCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Upsert a memory fact by key for the user."""
    now = datetime.utcnow()
    existing = (
        db.query(models.ChatMemory)
        .filter(
            models.ChatMemory.user_id == current_user.id,
            models.ChatMemory.key == memory.key,
        )
        .first()
    )
    if existing:
        existing.value = memory.value
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "key": existing.key, "value": existing.value, "created_at": str(existing.created_at)}

    mem = models.ChatMemory(
        user_id=current_user.id,
        key=memory.key,
        value=memory.value,
        created_at=now,
        updated_at=now,
    )
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return {"id": mem.id, "key": mem.key, "value": mem.value, "created_at": str(mem.created_at)}


@router.delete("/memory/{memory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory(
    memory_id: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Delete one of the user's memory facts."""
    mem = (
        db.query(models.ChatMemory)
        .filter(
            models.ChatMemory.id == memory_id,
            models.ChatMemory.user_id == current_user.id,
        )
        .first()
    )
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    db.delete(mem)
    db.commit()
