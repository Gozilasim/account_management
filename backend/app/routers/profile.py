# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 00:31
# Description: Profile details, onboarding state, and Cloudinary avatar API routes.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging

from fastapi import APIRouter, Depends, File, Request, UploadFile
from sqlalchemy.orm import Session

from app.audit import record_security_event
from app.cloudinary_service import delete_avatar, read_validated_avatar, upload_avatar
from app.database import get_db
from app.deps import get_current_user
from app.models import User, utcnow
from app.profile_completion import mark_field_skipped, unskip_filled_fields
from app.routers.auth import user_out
from app.schemas import OnboardingSkipRequest, ProfileUpdateRequest, UserOut

router = APIRouter(prefix="/api/profile", tags=["profile"])
logger = logging.getLogger(__name__)


# ###############################################
# Profile Routes
# ###############################################

@router.patch("", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    updated_fields = set(payload.model_fields_set)
    if "gender" in updated_fields and payload.gender != "custom":
        updated_fields.add("gender_custom")

    for field in updated_fields:
        value = getattr(payload, field)
        if field == "phone_number" and value != current_user.phone_number:
            current_user.phone_verified = False
        setattr(current_user, field, value)

    unskip_filled_fields(current_user, updated_fields)
    record_security_event(db, current_user.id, "profile_updated", request, metadata={"fields": sorted(updated_fields)})
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.post("/onboarding/skip", response_model=UserOut)
def skip_profile_onboarding_field(
    payload: OnboardingSkipRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    mark_field_skipped(current_user, payload.field)
    record_security_event(db, current_user.id, "profile_updated", request, metadata={"skipped_field": payload.field})
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.post("/onboarding/complete", response_model=UserOut)
def complete_profile_onboarding(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    current_user.profile_onboarding_completed_at = utcnow()
    record_security_event(db, current_user.id, "profile_updated", request, metadata={"onboarding_completed": True})
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


# ###############################################
# Avatar Routes
# ###############################################

@router.post("/avatar", response_model=UserOut)
async def upload_profile_avatar(
    request: Request,
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    content = await read_validated_avatar(avatar)
    previous_public_id = current_user.avatar_public_id
    public_id, secure_url = upload_avatar(current_user, content)

    current_user.avatar_public_id = public_id
    current_user.avatar_url = secure_url
    record_security_event(db, current_user.id, "avatar_updated", request)
    db.commit()
    db.refresh(current_user)

    if previous_public_id and previous_public_id != public_id:
        try:
            delete_avatar(previous_public_id)
        except Exception:
            logger.exception("Failed to delete old avatar for user %s", current_user.id)

    return user_out(current_user)
