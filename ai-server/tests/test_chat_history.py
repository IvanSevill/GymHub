"""Unit tests for chat_history module functions."""

import uuid
from datetime import datetime, timedelta

from chat_history import (
    HISTORY_LIMIT,
    RATE_LIMIT_HOURS,
    count_recent_user_messages,
    delete_history,
    get_history,
    save_message,
)
from models import ChatMessage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _user_id() -> str:
    return str(uuid.uuid4())


def _insert_message(db, user_id: str, role: str, content: str, created_at=None):
    """Directly insert a ChatMessage, optionally backdating created_at."""
    msg = ChatMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role=role,
        content=content,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(msg)
    db.commit()
    return msg


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_save_and_get_history(db):
    uid = _user_id()
    save_message(uid, "user", "Hello!", db)
    save_message(uid, "assistant", "Hi there!", db)

    history = get_history(uid, db)

    assert len(history) == 2
    assert history[0] == {"role": "user", "content": "Hello!"}
    assert history[1] == {"role": "assistant", "content": "Hi there!"}


def test_history_returns_oldest_first(db):
    uid = _user_id()
    save_message(uid, "user", "first", db)
    save_message(uid, "assistant", "second", db)
    save_message(uid, "user", "third", db)

    history = get_history(uid, db)

    assert [h["content"] for h in history] == ["first", "second", "third"]


def test_history_limited_to_10_messages(db):
    uid = _user_id()
    for i in range(15):
        save_message(uid, "user", f"message {i}", db)

    history = get_history(uid, db)

    assert len(history) == HISTORY_LIMIT
    # Should be the 10 most recent (messages 5–14)
    assert history[-1]["content"] == "message 14"
    assert history[0]["content"] == "message 5"


def test_count_recent_messages(db):
    uid = _user_id()
    save_message(uid, "user", "msg1", db)
    save_message(uid, "user", "msg2", db)
    save_message(uid, "assistant", "reply", db)

    count = count_recent_user_messages(uid, db)

    # Only user messages should be counted
    assert count == 2


def test_count_excludes_messages_older_than_window(db):
    uid = _user_id()
    # Insert an old message outside the rate-limit window
    old_time = datetime.utcnow() - timedelta(hours=RATE_LIMIT_HOURS + 1)
    _insert_message(db, uid, "user", "old message", created_at=old_time)

    # Insert a recent message inside the window
    save_message(uid, "user", "recent message", db)

    count = count_recent_user_messages(uid, db)

    assert count == 1


def test_delete_history_clears_messages_but_preserves_rate_limit(db):
    uid = _user_id()
    save_message(uid, "user", "hello", db)
    save_message(uid, "assistant", "world", db)

    delete_history(uid, db)

    # Visible history is emptied...
    assert get_history(uid, db) == []
    # ...but the rate-limit allowance is preserved (decoupled via ChatUsage),
    # so clearing the chat cannot be used to bypass the message limit.
    assert count_recent_user_messages(uid, db) == 1


def test_history_isolated_between_users(db):
    uid_a = _user_id()
    uid_b = _user_id()

    save_message(uid_a, "user", "message from A", db)
    save_message(uid_b, "user", "message from B", db)

    history_a = get_history(uid_a, db)
    history_b = get_history(uid_b, db)

    assert len(history_a) == 1
    assert history_a[0]["content"] == "message from A"

    assert len(history_b) == 1
    assert history_b[0]["content"] == "message from B"
