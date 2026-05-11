# Created at: 2026-05-12 00:31
# Updated at: 2026-05-12 00:31
# Description: Request device/IP helpers and security event recording utilities.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

from fastapi import Request
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SecurityEvent, SessionToken


# ###############################################
# Request Context Helpers
# ###############################################

def request_ip_address(request: Request | None) -> str | None:
    if request is None:
        return None

    if settings.trust_proxy_headers:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip() or None

        real_ip = request.headers.get("x-real-ip", "")
        if real_ip:
            return real_ip.strip() or None

    return request.client.host if request.client else None


def request_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    return request.headers.get("user-agent")


def device_label_from_user_agent(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown device"

    normalized = user_agent.lower()
    if "iphone" in normalized:
        return "iPhone"
    if "ipad" in normalized:
        return "iPad"
    if "android" in normalized:
        return "Android device"
    if "windows" in normalized:
        return "Windows device"
    if "macintosh" in normalized or "mac os x" in normalized:
        return "Mac"
    if "linux" in normalized:
        return "Linux device"
    return user_agent.split(" ", 1)[0][:120]


def request_device_label(request: Request | None) -> str:
    return device_label_from_user_agent(request_user_agent(request))


# ###############################################
# Security Event Recording
# ###############################################

def record_security_event(
    db: Session,
    user_id: str,
    event_type: str,
    request: Request | None = None,
    session: SessionToken | None = None,
    metadata: dict | None = None,
) -> None:
    ip_address = request_ip_address(request)
    user_agent = request_user_agent(request)
    device_label = request_device_label(request)

    if session is not None:
        ip_address = ip_address or session.last_seen_ip_address or session.login_ip_address
        user_agent = user_agent or session.user_agent
        device_label = device_label if device_label != "Unknown device" else session.device_label

    db.add(
        SecurityEvent(
            user_id=user_id,
            event_type=event_type,
            ip_address=ip_address,
            user_agent=user_agent,
            device_label=device_label,
            metadata_json=metadata,
        )
    )
