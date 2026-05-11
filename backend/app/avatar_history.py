# Created at: 2026-05-12 02:17
# Updated at: 2026-05-12 02:17
# Description: Helpers for maintaining per-user avatar history stored as JSON.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from datetime import datetime, timezone

from app.models import User


# ###############################################
# Normalization Helpers
# ###############################################

def iso_datetime(value: datetime | None) -> str:
    if value is None:
        value = datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def normalized_avatar_history(user: User) -> list[dict[str, str]]:
    history = user.avatar_history or []
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in history:
        public_id = str(item.get("public_id") or "").strip()
        url = str(item.get("url") or "").strip()
        if not public_id or not url or public_id in seen or public_id == user.avatar_public_id:
            continue

        normalized.append(
            {
                "public_id": public_id,
                "url": url,
                "uploaded_at": str(item.get("uploaded_at") or iso_datetime(None)),
                "replaced_at": str(item.get("replaced_at") or iso_datetime(None)),
            }
        )
        seen.add(public_id)

    return normalized


def current_avatar_history_item(user: User, replaced_at: datetime) -> dict[str, str] | None:
    if not user.avatar_public_id or not user.avatar_url:
        return None

    return {
        "public_id": user.avatar_public_id,
        "url": user.avatar_url,
        "uploaded_at": iso_datetime(user.updated_at),
        "replaced_at": iso_datetime(replaced_at),
    }


# ###############################################
# Mutation Helpers
# ###############################################

def append_current_avatar_to_history(user: User, replaced_at: datetime) -> None:
    current_item = current_avatar_history_item(user, replaced_at)
    history = normalized_avatar_history(user)

    if current_item and current_item["public_id"] not in {item["public_id"] for item in history}:
        history.append(current_item)

    user.avatar_history = history


def restore_avatar_from_history(user: User, public_id: str, replaced_at: datetime) -> dict[str, str] | None:
    history = normalized_avatar_history(user)
    restored_item = next((item for item in history if item["public_id"] == public_id), None)
    if not restored_item:
        return None

    next_history = [item for item in history if item["public_id"] != public_id]
    current_item = current_avatar_history_item(user, replaced_at)
    if current_item and current_item["public_id"] not in {item["public_id"] for item in next_history}:
        next_history.append(current_item)

    user.avatar_public_id = restored_item["public_id"]
    user.avatar_url = restored_item["url"]
    user.avatar_history = next_history
    return restored_item


def remove_avatar_from_history(user: User, public_id: str) -> dict[str, str] | None:
    history = normalized_avatar_history(user)
    removed_item = next((item for item in history if item["public_id"] == public_id), None)
    if not removed_item:
        return None

    user.avatar_history = [item for item in history if item["public_id"] != public_id]
    return removed_item
