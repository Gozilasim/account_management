# Created at: 2026-10-11 11:48
# Updated at: 2026-10-11 12:13
# Description: SMTP delivery and the account emails GozilaSim ID sends (password reset, new sign-in alert).

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import html
import logging
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings

logger = logging.getLogger(__name__)


# ###############################################
# Delivery
# ###############################################

def deliver(message: EmailMessage) -> None:
    """Hands one message to the configured SMTP server. Tests replace this function."""
    security = settings.smtp_security.lower()
    host = settings.smtp_host or ""
    if security == "ssl":
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
            context=ssl.create_default_context(),
        )
    else:
        server = smtplib.SMTP(host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
    with server:
        if security == "starttls":
            server.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def send_email(to_address: str, subject: str, text_body: str, html_body: str) -> None:
    """Sends one email. Failures are logged and never raised, because this runs after the response is sent."""
    if not settings.email_configured:
        logger.warning("Email to %s was not sent because SMTP is not configured.", to_address)
        return

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    try:
        deliver(message)
    except Exception:
        logger.exception("Could not send email to %s (subject: %s).", to_address, subject)


# ###############################################
# Layout
# ###############################################

def _language(locale: str | None) -> str:
    return "zh" if (locale or "").strip().lower().startswith("zh") else "en"


def _html_page(title: str, paragraphs: list[str], button: tuple[str, str] | None, footnote: str | None) -> str:
    body = "".join(
        f'<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3c4043;">{paragraph}</p>' for paragraph in paragraphs
    )
    action = ""
    if button:
        label, url = button
        action = (
            f'<p style="margin:22px 0;"><a href="{html.escape(url, quote=True)}" '
            'style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1a73e8;color:#ffffff;'
            f'font-size:15px;font-weight:600;text-decoration:none;">{html.escape(label)}</a></p>'
        )
    note = (
        f'<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#5f6368;">{footnote}</p>' if footnote else ""
    )
    product = html.escape(settings.product_name)
    return (
        '<div style="margin:0;padding:24px;background:#f8f9fa;font-family:Arial,Helvetica,sans-serif;">'
        '<div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e8eaed;border-radius:12px;background:#ffffff;">'
        f'<p style="margin:0 0 18px;font-size:14px;font-weight:700;color:#202124;">{product}</p>'
        f'<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#202124;">{html.escape(title)}</h1>'
        f"{body}{action}{note}"
        "</div></div>"
    )


# ###############################################
# Password Reset Email
# ###############################################

def send_password_reset_email(to_address: str, reset_link: str, locale: str | None) -> None:
    minutes = settings.password_reset_token_ttl_minutes
    email = html.escape(to_address)
    if _language(locale) == "zh":
        subject = "重置你的密码"
        title = "重置你的密码"
        intro = f"有人申请重置 {email} 的密码。链接 {minutes} 分钟内有效，只能使用一次。"
        button = "设置新密码"
        footnote = "不是你本人？忽略这封邮件即可，密码不会改变。"
        text = (
            f"有人申请重置 {to_address} 的密码。\n\n"
            f"打开下面的链接设置新密码（{minutes} 分钟内有效，只能使用一次）：\n{reset_link}\n\n"
            "不是你本人？忽略这封邮件即可，密码不会改变。"
        )
    else:
        subject = "Reset your password"
        title = "Reset your password"
        intro = f"Someone asked to reset the password for {email}. The link works once and expires in {minutes} minutes."
        button = "Choose a new password"
        footnote = "Not you? Ignore this email and your password stays the same."
        text = (
            f"Someone asked to reset the password for {to_address}.\n\n"
            f"Open this link to choose a new password (it works once and expires in {minutes} minutes):\n{reset_link}\n\n"
            "Not you? Ignore this email and your password stays the same."
        )
    send_email(to_address, subject, text, _html_page(title, [intro], (button, reset_link), footnote))


# ###############################################
# One-Time Code Email
# ###############################################

# What each kind of code is for, as (English, Chinese).
_CODE_PURPOSES = {
    "email_verification": ("Verify your email address", "验证你的邮箱"),
    "recovery_email": ("Confirm your recovery email", "确认你的恢复邮箱"),
    "recovery_sign_in": ("Your sign-in code", "你的登录验证码"),
    "account_deletion": ("Confirm deleting your account", "确认删除你的账号"),
}


def send_code_email(to_address: str, code: str, purpose: str, minutes: int, locale: str | None) -> None:
    english_title, chinese_title = _CODE_PURPOSES.get(purpose, _CODE_PURPOSES["email_verification"])
    code_html = f'<span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#202124;">{html.escape(code)}</span>'
    if _language(locale) == "zh":
        title = chinese_title
        intro = f"在 {html.escape(settings.product_name)} 中输入这个验证码。它 {minutes} 分钟内有效，只能使用一次。"
        footnote = "如果不是你本人申请的，可以忽略这封邮件，也不要把验证码告诉任何人。"
        text = (
            f"{chinese_title}\n\n验证码：{code}\n\n"
            f"它 {minutes} 分钟内有效，只能使用一次。\n如果不是你本人申请的，可以忽略这封邮件，也不要把验证码告诉任何人。"
        )
    else:
        title = english_title
        intro = f"Enter this code in {html.escape(settings.product_name)}. It works once and expires in {minutes} minutes."
        footnote = "If you did not ask for this, ignore this email and do not share the code with anyone."
        text = (
            f"{english_title}\n\nCode: {code}\n\n"
            f"It works once and expires in {minutes} minutes.\n"
            "If you did not ask for this, ignore this email and do not share the code with anyone."
        )
    send_email(to_address, title, text, _html_page(title, [intro, code_html], None, footnote))


# ###############################################
# New Sign-In Email
# ###############################################

def _local_time(moment: datetime, timezone_name: str | None) -> str:
    zone_label = "UTC"
    local = moment.astimezone(timezone.utc)
    if timezone_name:
        try:
            local = moment.astimezone(ZoneInfo(timezone_name))
            zone_label = timezone_name
        except ZoneInfoNotFoundError:
            pass
    return f"{local:%Y-%m-%d %H:%M} ({zone_label})"


def send_new_sign_in_email(
    to_address: str,
    device_label: str,
    ip_address: str | None,
    signed_in_at: datetime,
    timezone_name: str | None,
    locale: str | None,
) -> None:
    review_link = f"{settings.frontend_origin}/security?section=activity"
    when = _local_time(signed_in_at, timezone_name)
    chinese = _language(locale) == "zh"
    unknown = "未知" if chinese else "Unknown"
    rows = [
        ("设备" if chinese else "Device", device_label or unknown),
        ("时间" if chinese else "Time", when),
        ("IP 地址" if chinese else "IP address", ip_address or unknown),
    ]
    details_html = "<br>".join(f"{html.escape(label)}: <strong>{html.escape(value)}</strong>" for label, value in rows)
    details_text = "\n".join(f"{label}: {value}" for label, value in rows)

    if chinese:
        subject = "新设备登录了你的账号"
        title = "有新设备登录了你的账号"
        footnote = "如果是你本人，不需要做任何事。"
        button = "不是我，检查账号安全"
        text = f"有新设备登录了你的账号。\n\n{details_text}\n\n如果是你本人，不需要做任何事。\n如果不是你，请检查账号安全：{review_link}"
    else:
        subject = "New sign-in to your account"
        title = "A new device signed in to your account"
        footnote = "If this was you, there is nothing you need to do."
        button = "Not me, review my account"
        text = (
            f"A new device signed in to your account.\n\n{details_text}\n\n"
            f"If this was you, there is nothing you need to do.\nIf it was not, review your account: {review_link}"
        )
    send_email(to_address, subject, text, _html_page(title, [details_html], (button, review_link), footnote))


# ###############################################
# Account Deleted Email
# ###############################################

def send_account_deleted_email(to_address: str, locale: str | None) -> None:
    """A last notice, so the owner hears about the deletion even if someone else carried it out."""
    product = html.escape(settings.product_name)
    email = html.escape(to_address)
    if _language(locale) == "zh":
        subject = "你的账号已删除"
        title = "你的账号已删除"
        intro = f"{email} 的 {product} 账号和其中的数据已被永久删除。"
        footnote = "这是这个账号的最后一封邮件。如果不是你本人操作的，请尽快联系我们。"
        text = (
            f"{to_address} 的 {settings.product_name} 账号和其中的数据已被永久删除。\n\n"
            "这是这个账号的最后一封邮件。如果不是你本人操作的，请尽快联系我们。"
        )
    else:
        subject = "Your account was deleted"
        title = "Your account was deleted"
        intro = f"The {product} account for {email} and the data in it were permanently deleted."
        footnote = "This is the last email for this account. If you did not do this, contact us as soon as you can."
        text = (
            f"The {settings.product_name} account for {to_address} and the data in it were permanently deleted.\n\n"
            "This is the last email for this account. If you did not do this, contact us as soon as you can."
        )
    send_email(to_address, subject, text, _html_page(title, [intro], None, footnote))
