"""Centralized backend configuration.

Single place where the backend reads its environment variables, so tunables are
discoverable and easy to override per environment. Import the shared ``settings``
instance instead of calling ``os.getenv`` directly.

The environment is loaded by ``app.main`` (via python-dotenv) before it imports
the routers that import this module, so values are available at import time.
"""

import os


def _env_int(name: str, default: int) -> int:
    """Read an int env var, falling back to *default* when unset or invalid."""
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_list(name: str) -> list[str]:
    """Read a comma-separated env var into a list of trimmed, non-empty items."""
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


class Settings:
    """Typed view over the process environment."""

    def __init__(self) -> None:
        # --- GymChat rate limiting (applies to non-root users) ---
        # Messages allowed per fixed window, and the window length in MINUTES.
        # The window resets this many minutes after its first message. Lower
        # these to exercise the limit/countdown without waiting (e.g. 2 and 3).
        self.CHAT_RATE_LIMIT_COUNT: int = _env_int("CHAT_RATE_LIMIT_COUNT", 5)
        self.CHAT_RATE_LIMIT_MINUTES: int = _env_int("CHAT_RATE_LIMIT_MINUTES", 2 * 60)
        # Number of recent messages returned as chat history.
        self.CHAT_HISTORY_LIMIT: int = _env_int("CHAT_HISTORY_LIMIT", 10)

        # --- Root / admin ---
        # Emails always treated as root (exempt from the chat rate limit).
        self.ROOT_EMAILS: list[str] = _env_list("ROOT_EMAILS")


settings = Settings()
