"""
Fetch every workout event from the 'Gimnasio' Google Calendar, re-parse it
with the fixed parser, map exercise names to the canonical DB names, and
patch the event description back to Google Calendar.

Usage:
    python standardize_calendar.py          # live run
    python standardize_calendar.py --dry    # preview only, no API writes
"""
import argparse
import os
import re
import sys
import unicodedata
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

sys.stdout.reconfigure(encoding="utf-8")
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.calendar_utils import parse_calendar_description  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Exercise, Muscle, UserTokens  # noqa: E402
from app.routers.workouts import get_google_credentials  # noqa: E402
from googleapiclient.discovery import build  # noqa: E402

GIMNASIO_NAME = "Gimnasio"
GYMHUB_TAG    = "[GymHub]"


# ── Name normalisation ────────────────────────────────────────────────────────

def _norm(name: str) -> str:
    """Lowercase, strip diacritics, collapse whitespace."""
    name = name.lower().strip()
    name = unicodedata.normalize("NFD", name)
    name = "".join(c for c in name if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", name)


def _cleanliness(name: str) -> float:
    """Higher score → cleaner / more canonical name."""
    score = 100.0
    if "~" in name:
        score -= 50
    if re.search(r"\+\d", name):
        score -= 30
    if re.search(r"\bpr\b", name.lower()):
        score -= 40
    if re.search(r"\d{2,}\s*kg", name.lower()):
        score -= 25
    if name.rstrip().endswith(" -"):
        score -= 25
    # Penalise names that end with a bare number — those are old parser artifacts
    # where a weight got stuck into the exercise name (e.g. "Press maquina 55")
    if re.search(r"\s\d+\s*$", name):
        score -= 40
    score -= len(name) * 0.05
    return score


def find_canonical(muscle: str, raw: str, exs_by_muscle: Dict[str, list]) -> str:
    """
    Return the best-matching canonical exercise name from the DB.
    Falls back to the cleaned raw name when nothing matches.
    """
    exs = exs_by_muscle.get(muscle, [])
    if not exs:
        return raw

    raw_n    = _norm(raw)
    muscle_n = _norm(muscle)
    candidates: List[Tuple[object, float]] = []

    for ex in exs:
        db_n  = _norm(ex.name)
        base  = _cleanliness(ex.name)

        # Exact match (after normalisation)
        if db_n == raw_n:
            candidates.append((ex, base + 1000))
            continue

        # DB name == muscle + " " + raw  (e.g. raw="alto", db="pecho alto")
        if db_n == f"{muscle_n} {raw_n}":
            candidates.append((ex, base + 900))
            continue

        # DB name with muscle prefix stripped == raw
        if db_n.startswith(f"{muscle_n} ") and db_n[len(muscle_n) + 1:] == raw_n:
            candidates.append((ex, base + 900))
            continue

        # Jaccard word overlap ≥ 0.5 — only for clean DB names (base ≥ 60)
        # so dirty names (e.g. "Press maquina 55") never win via fuzzy match
        if base < 60:
            continue
        raw_words = set(raw_n.split())
        db_words  = set(db_n.split())
        union = raw_words | db_words
        if union:
            jaccard = len(raw_words & db_words) / len(union)
            if jaccard >= 0.5:
                candidates.append((ex, base + jaccard * 500))

    if not candidates:
        return raw

    return max(candidates, key=lambda x: x[1])[0].name


# ── Description reconstruction ───────────────────────────────────────────────

def _cap(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


def _no_accents(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def _extract_fitbit_raw(description: str) -> str:
    """Return the raw [Fitbit Metrics] block as-is (to preserve it unchanged)."""
    if "[Fitbit Metrics]" in description:
        return "[Fitbit Metrics]" + description.split("[Fitbit Metrics]")[1]
    return ""


def rebuild_description(sets_data: list, fitbit_raw: str, was_gymhub: bool) -> str:
    """
    Rebuild a clean calendar description from the list of parsed & canonicalised sets.
    Completed sets come first, then incomplete. Duplicate (muscle+exercise) pairs
    that appear both as completed and not are deduplicated in favour of completed.
    """
    completed_pairs = {
        (s["muscle_name"], s["exercise_name"])
        for s in sets_data if s["is_completed"]
    }

    # Accumulate values per (muscle, exercise, is_completed, unit) preserving order
    groups: Dict[Tuple, List[str]] = {}
    order:  List[Tuple] = []

    for s in sets_data:
        pair = (s["muscle_name"], s["exercise_name"])
        # Drop not-completed if a completed version of the same exercise exists
        if not s["is_completed"] and pair in completed_pairs:
            continue

        key = (s["muscle_name"], s["exercise_name"], s["is_completed"], s["measurement"])
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(s["value"])

    lines = []
    if was_gymhub:
        lines.append(GYMHUB_TAG)

    def _format_line(key: Tuple) -> str:
        muscle, exercise, completed, unit = key
        values = groups[key]
        prefix = "✅" if completed else ""

        # Omit weight when the parser produced a fallback "0 kg"
        if values == ["0"] and unit == "kg":
            weight = ""
        else:
            # Deduplicate identical values to avoid "50-50kg" when two sets
            # at the same weight were recorded as separate lines
            display = list(dict.fromkeys(values))
            weight = "-".join(display) + unit

        line = f"{prefix}{_cap(_no_accents(muscle))} - {_cap(_no_accents(exercise))}"
        return f"{line} {weight}" if weight else line

    # Completed first, then incomplete
    for key in order:
        if key[2]:
            lines.append(_format_line(key))
    for key in order:
        if not key[2]:
            lines.append(_format_line(key))

    if fitbit_raw:
        lines.append("")
        lines.append(fitbit_raw.strip())

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main(dry_run: bool = False) -> None:
    db = SessionLocal()

    user_tokens = db.query(UserTokens).filter(
        UserTokens.google_access_token.isnot(None)
    ).first()
    if not user_tokens:
        print("No user with Google Calendar connected.")
        return

    creds = get_google_credentials(user_tokens, db)
    if not creds:
        print("Could not refresh Google credentials.")
        return

    service = build("calendar", "v3", credentials=creds)

    # Locate the Gimnasio calendar
    gimnasio_id: Optional[str] = None
    for cal in service.calendarList().list().execute().get("items", []):
        if cal["summary"].lower() == GIMNASIO_NAME.lower():
            gimnasio_id = cal["id"]
            break

    if not gimnasio_id:
        print(f"'{GIMNASIO_NAME}' calendar not found.")
        return

    print(f"Calendar: {GIMNASIO_NAME}  ({gimnasio_id})")
    if dry_run:
        print("*** DRY-RUN MODE — no changes will be written ***\n")

    # Fetch all events
    from datetime import datetime, timedelta
    time_min = (datetime.utcnow() - timedelta(days=365 * 5)).isoformat() + "Z"
    events, page_token = [], None
    while True:
        res = service.events().list(
            calendarId=gimnasio_id, timeMin=time_min,
            singleEvents=True, orderBy="startTime",
            pageToken=page_token, maxResults=2500,
        ).execute()
        events.extend(res.get("items", []))
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    print(f"Fetched {len(events)} events from calendar.\n")

    # Build look-up structures from DB
    muscle_map = {m.name.lower(): m.id for m in db.query(Muscle).all()}
    exs_by_muscle: Dict[str, list] = defaultdict(list)
    for ex in db.query(Exercise).all():
        if ex.muscle:
            exs_by_muscle[ex.muscle.name.lower()].append(ex)

    # Filter to actual workout events (skip Fitbit auto-sync and empty descriptions)
    FITBIT_AUTO = "Actividad sincronizada automáticamente desde Fitbit"
    workout_events = [
        e for e in events
        if (desc := (e.get("description") or "").strip())
        and FITBIT_AUTO not in desc
        and (
            GYMHUB_TAG in desc
            or (" - " in desc and any(m in desc.lower() for m in muscle_map))
            or "pierna" in (e.get("summary") or "").lower()
        )
    ]
    print(f"Workout events to process: {len(workout_events)}\n")
    print("=" * 70)

    updated = skipped = errors = 0

    for event in workout_events:
        desc    = (event.get("description") or "").strip()
        summary = event.get("summary", "")
        date    = (
            event.get("start", {})
            .get("dateTime", event.get("start", {}).get("date", ""))[:10]
        )
        event_id   = event["id"]
        was_gymhub = GYMHUB_TAG in desc

        # 1. Parse with the fixed parser
        parsed = parse_calendar_description(desc, muscle_map, title=summary)
        raw_sets = parsed["sets"]

        if not raw_sets and not parsed["fitbit"]:
            print(f"  SKIP (empty after parse): {date} | {summary}")
            skipped += 1
            continue

        # 2. Map each exercise name to its canonical DB equivalent
        canonical_sets = [
            {
                **s,
                "exercise_name": find_canonical(
                    s["muscle_name"], s["exercise_name"], exs_by_muscle
                ),
            }
            for s in raw_sets
        ]

        # 3. Rebuild description
        fitbit_raw  = _extract_fitbit_raw(desc)
        new_desc    = rebuild_description(canonical_sets, fitbit_raw, was_gymhub)

        # 4. Decide whether to update
        if new_desc == desc:
            skipped += 1
            continue

        print(f"\n  {date} | {summary}")
        print(f"  Sets parsed: {len(raw_sets)}  |  was_gymhub={was_gymhub}")

        # Show a brief diff (first changed line for brevity)
        old_lines = desc.splitlines()
        new_lines = new_desc.splitlines()
        for old, new in zip(old_lines, new_lines):
            if old != new:
                print(f"    - {old}")
                print(f"    + {new}")
                break
        if len(new_lines) != len(old_lines):
            print(f"    (line count: {len(old_lines)} → {len(new_lines)})")

        if not dry_run:
            try:
                service.events().patch(
                    calendarId=gimnasio_id,
                    eventId=event_id,
                    body={"description": new_desc},
                ).execute()
                print("  UPDATED")
                updated += 1
            except Exception as exc:
                print(f"  ❌ ERROR: {exc}")
                errors += 1
        else:
            print("  [dry-run] would update")
            updated += 1

    print("\n" + "=" * 70)
    label = "Would update" if dry_run else "Updated"
    print(f"{label}: {updated}   Skipped: {skipped}   Errors: {errors}")
    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="Preview changes without writing")
    args = parser.parse_args()
    main(dry_run=args.dry)
