# Created at: 2026-05-12 00:31
# Updated at: 2026-05-12 00:31
# Description: Profile onboarding completeness rules for Portal accounts.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from app.models import User


# ###############################################
# Completion Rules
# ###############################################

PROFILE_PROMPT_FIELDS = ["phone_number", "gender", "date_of_birth", "first_name", "last_name"]


def normalized_skipped_fields(user: User) -> list[str]:
    skipped = user.profile_onboarding_skipped_fields or []
    return [field for field in skipped if field in PROFILE_PROMPT_FIELDS]


def field_has_value(user: User, field: str) -> bool:
    value = getattr(user, field)
    if isinstance(value, str):
        return bool(value.strip())
    return value is not None


def profile_completion(user: User) -> dict:
    missing_fields = [field for field in PROFILE_PROMPT_FIELDS if not field_has_value(user, field)]
    skipped_fields = normalized_skipped_fields(user)
    next_prompt_field = None

    if user.profile_onboarding_completed_at is None:
        for field in missing_fields:
            if field not in skipped_fields:
                next_prompt_field = field
                break

    return {
        "onboarding_completed": user.profile_onboarding_completed_at is not None,
        "missing_fields": missing_fields,
        "skipped_fields": skipped_fields,
        "next_prompt_field": next_prompt_field,
    }


def mark_field_skipped(user: User, field: str) -> None:
    skipped = normalized_skipped_fields(user)
    if field not in skipped:
        skipped.append(field)
    user.profile_onboarding_skipped_fields = skipped


def unskip_filled_fields(user: User, fields: set[str]) -> None:
    skipped = normalized_skipped_fields(user)
    next_skipped = [
        field
        for field in skipped
        if field not in fields or not field_has_value(user, field)
    ]
    user.profile_onboarding_skipped_fields = next_skipped
