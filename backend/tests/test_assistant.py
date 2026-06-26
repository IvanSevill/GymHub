"""Tests for the AI assistant persistence endpoints (/assistant/*)."""

from datetime import datetime, timedelta

import pytest

from app import models


async def _post_user_message(client, headers, content: str):
    return await client.post(
        "/assistant/history", headers=headers, json={"role": "user", "content": content}
    )


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_history_empty(client, auth_headers):
    resp = await client.get("/assistant/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_save_and_get_history(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "hola"}
    )
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "assistant", "content": "qué tal"}
    )
    resp = await client.get("/assistant/history", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Oldest first
    assert [m["role"] for m in data] == ["user", "assistant"]
    assert data[0]["content"] == "hola"


@pytest.mark.anyio
async def test_clear_history_preserves_usage(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "uno"}
    )
    resp = await client.get("/assistant/usage", headers=auth_headers)
    assert resp.json()["used"] == 1

    del_resp = await client.delete("/assistant/history", headers=auth_headers)
    assert del_resp.status_code == 204

    # History gone…
    assert (await client.get("/assistant/history", headers=auth_headers)).json() == []
    # …but the rate-limit counter survives.
    assert (await client.get("/assistant/usage", headers=auth_headers)).json()["used"] == 1


# ---------------------------------------------------------------------------
# Usage / rate limit
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_usage_only_counts_user_messages(client, auth_headers):
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "user", "content": "1"}
    )
    await client.post(
        "/assistant/history", headers=auth_headers, json={"role": "assistant", "content": "2"}
    )
    resp = await client.get("/assistant/usage", headers=auth_headers)
    body = resp.json()
    assert body["used"] == 1
    assert body["limit"] == 5
    assert body["is_root"] is False


@pytest.mark.anyio
async def test_usage_no_messages_yet(client, auth_headers):
    """A standard user with no messages: used=0, limit set, no reset window."""
    resp = await client.get("/assistant/usage", headers=auth_headers)
    body = resp.json()
    assert body["used"] == 0
    assert body["limit"] == 5
    assert body["reset_at"] is None
    assert body["is_root"] is False


@pytest.mark.anyio
async def test_usage_root_is_unlimited(client, root_headers):
    resp = await client.get("/assistant/usage", headers=root_headers)
    body = resp.json()
    assert body["is_root"] is True
    assert body["limit"] is None


@pytest.mark.anyio
async def test_usage_counts_up_to_limit_in_one_window(client, auth_headers, db):
    """Five messages sent in one burst share a single window and reach the cap."""
    for i in range(5):
        await _post_user_message(client, auth_headers, str(i))

    body = (await client.get("/assistant/usage", headers=auth_headers)).json()
    assert body["used"] == 5
    assert body["limit"] == 5
    assert body["reset_at"] is not None

    # All messages in the burst belong to the same fixed window.
    window_starts = {r.window_start for r in db.query(models.ChatUsage).all()}
    assert len(window_starts) == 1


@pytest.mark.anyio
async def test_usage_window_is_fixed_not_sliding(client, auth_headers, db):
    """The window resets cleanly 2h after its first message, never slides.

    Regression test: a sliding window would still count recent messages once
    the oldest fell out of the trailing 2h; the fixed window must report 0.
    """
    for i in range(5):
        await _post_user_message(client, auth_headers, str(i))

    rows = (
        db.query(models.ChatUsage)
        .order_by(models.ChatUsage.created_at.asc())
        .all()
    )
    # Anchor the window's first message just over 2h ago (window elapsed) while
    # keeping the other four messages very recent.
    anchor = datetime.utcnow() - timedelta(hours=2, minutes=6)
    recent = datetime.utcnow() - timedelta(minutes=90)
    for idx, r in enumerate(rows):
        r.window_start = anchor
        r.created_at = anchor if idx == 0 else recent
    db.commit()

    body = (await client.get("/assistant/usage", headers=auth_headers)).json()
    assert body["used"] == 0
    assert body["reset_at"] is None


@pytest.mark.anyio
async def test_usage_opens_new_window_after_reset(client, auth_headers, db):
    """Once the window elapses, the next message opens a fresh allowance."""
    await _post_user_message(client, auth_headers, "old")

    elapsed = datetime.utcnow() - timedelta(hours=3)
    for r in db.query(models.ChatUsage).all():
        r.created_at = elapsed
        r.window_start = elapsed
    db.commit()
    assert (await client.get("/assistant/usage", headers=auth_headers)).json()["used"] == 0

    # A new message starts a brand-new window.
    await _post_user_message(client, auth_headers, "new")
    body = (await client.get("/assistant/usage", headers=auth_headers)).json()
    assert body["used"] == 1
    assert body["reset_at"] is not None


@pytest.mark.anyio
async def test_root_messages_are_not_rate_limited(client, root_headers, db):
    """Root users are exempt: their messages never accrue usage rows."""
    for i in range(3):
        await _post_user_message(client, root_headers, str(i))

    assert db.query(models.ChatUsage).count() == 0
    body = (await client.get("/assistant/usage", headers=root_headers)).json()
    assert body["is_root"] is True
    assert body["used"] == 0


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_memory_upsert_and_list(client, auth_headers):
    r1 = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "objetivo", "value": "ganar masa"}
    )
    assert r1.status_code == 200
    mem_id = r1.json()["id"]

    # Upsert same key updates value, keeps id
    r2 = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "objetivo", "value": "perder grasa"}
    )
    assert r2.json()["id"] == mem_id
    assert r2.json()["value"] == "perder grasa"

    listing = await client.get("/assistant/memory", headers=auth_headers)
    assert len(listing.json()) == 1
    assert listing.json()[0]["value"] == "perder grasa"


@pytest.mark.anyio
async def test_memory_delete(client, auth_headers):
    created = await client.post(
        "/assistant/memory", headers=auth_headers, json={"key": "lesion", "value": "hombro"}
    )
    mem_id = created.json()["id"]
    del_resp = await client.delete(f"/assistant/memory/{mem_id}", headers=auth_headers)
    assert del_resp.status_code == 204
    assert (await client.get("/assistant/memory", headers=auth_headers)).json() == []


@pytest.mark.anyio
async def test_memory_delete_not_found(client, auth_headers):
    resp = await client.delete("/assistant/memory/does-not-exist", headers=auth_headers)
    assert resp.status_code == 404
