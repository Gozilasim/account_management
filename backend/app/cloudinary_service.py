# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Cloudinary avatar validation, upload, and cleanup helpers.

from __future__ import annotations

import io
import uuid
import logging

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile, status

from app.config import settings
from app.models import User

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
logger = logging.getLogger(__name__)


def configure_cloudinary() -> None:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


async def read_validated_avatar(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be a JPEG, PNG, WEBP, or GIF image.",
        )

    content = await file.read(settings.avatar_max_bytes + 1)
    if len(content) > settings.avatar_max_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file is too large.")
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file is empty.")
    return content


def upload_avatar(user: User, content: bytes) -> tuple[str, str]:
    if not settings.cloudinary_configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cloudinary is not configured.")

    configure_cloudinary()
    public_id = f"portal/avatars/{user.id}/{uuid.uuid4().hex}"
    result = cloudinary.uploader.upload(
        io.BytesIO(content),
        public_id=public_id,
        resource_type="image",
        overwrite=True,
        transformation=[
            {"width": 512, "height": 512, "crop": "fill", "gravity": "face"},
            {"quality": "auto", "fetch_format": "auto"},
        ],
    )
    return result["public_id"], result["secure_url"]


def delete_avatar(public_id: str | None) -> None:
    if not public_id or not settings.cloudinary_configured:
        return
    configure_cloudinary()
    try:
        cloudinary.uploader.destroy(public_id, invalidate=True, resource_type="image")
    except Exception:
        logger.exception("Failed to delete old Cloudinary avatar: %s", public_id)
