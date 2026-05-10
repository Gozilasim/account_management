# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Profile display name and Cloudinary avatar API routes.

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.cloudinary_service import delete_avatar, read_validated_avatar, upload_avatar
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.routers.auth import user_out
from app.schemas import ProfileUpdateRequest, UserOut

router = APIRouter(prefix="/api/profile", tags=["profile"])
logger = logging.getLogger(__name__)


@router.patch("", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    current_user.display_name = payload.display_name.strip()
    db.commit()
    db.refresh(current_user)
    return user_out(current_user)


@router.post("/avatar", response_model=UserOut)
async def upload_profile_avatar(
    avatar: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    content = await read_validated_avatar(avatar)
    previous_public_id = current_user.avatar_public_id
    public_id, secure_url = upload_avatar(current_user, content)

    current_user.avatar_public_id = public_id
    current_user.avatar_url = secure_url
    db.commit()
    db.refresh(current_user)

    if previous_public_id and previous_public_id != public_id:
        try:
            delete_avatar(previous_public_id)
        except Exception:
            logger.exception("Failed to delete old avatar for user %s", current_user.id)

    return user_out(current_user)
