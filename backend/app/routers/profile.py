# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 02:17
# Description: Profile details, onboarding state, and Cloudinary avatar API routes.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.audit import record_security_event
from app.avatar_history import (
    append_current_avatar_to_history,
    normalized_avatar_history,
    remove_avatar_from_history,
    restore_avatar_from_history,
)
from app.cloudinary_service import delete_avatar, read_validated_avatar, upload_avatar
from app.database import get_db
from app.deps import get_current_user
from app.models import User, utcnow
from app.profile_completion import mark_field_skipped, unskip_filled_fields
from app.routers.auth import user_out
from app.schemas import AvatarHistoryItemOut, AvatarRestoreRequest, MessageOut, OnboardingSkipRequest, ProfileUpdateRequest, UserOut

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

@router.get("/avatar/history", response_model=list[AvatarHistoryItemOut])
def get_avatar_history(current_user: User = Depends(get_current_user)) -> list[dict[str, str]]:
    return normalized_avatar_history(current_user)


@router.post("/avatar", response_model=UserOut)
async def upload_profile_avatar(
    request: Request,
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    content = await read_validated_avatar(avatar)
    public_id, secure_url = upload_avatar(current_user, content)

    now = utcnow()
    append_current_avatar_to_history(current_user, now)
    current_user.avatar_public_id = public_id
    current_user.avatar_url = secure_url
    record_security_event(db, current_user.id, "avatar_updated", request)
    db.commit()
    db.refresh(current_user)

    return user_out(current_user)


@router.post("/avatar/restore", response_model=UserOut)
def restore_profile_avatar(
    payload: AvatarRestoreRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    if payload.public_id == current_user.avatar_public_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar is already current.")

    restored_item = restore_avatar_from_history(current_user, payload.public_id, utcnow())
    if not restored_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar history item not found.")

    record_security_event(
        db,
        current_user.id,
        "avatar_updated",
        request,
        metadata={"restored_public_id": restored_item["public_id"]},
    )
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.delete("/avatar/history/{public_id:path}", response_model=MessageOut)
def delete_avatar_history_item(
    public_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    if public_id == current_user.avatar_public_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current avatar cannot be deleted from history.")

    removed_item = remove_avatar_from_history(current_user, public_id)
    if not removed_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar history item not found.")

    try:
        delete_avatar(removed_item["public_id"])
    except Exception as exc:
        logger.exception("Failed to delete avatar history item for user %s", current_user.id)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to delete avatar asset.") from exc

    record_security_event(
        db,
        current_user.id,
        "avatar_updated",
        request,
        metadata={"deleted_public_id": removed_item["public_id"]},
    )
    db.commit()
    return MessageOut(message="Avatar history item deleted.")
