# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 00:31
# Description: Pydantic request and response schemas for Portal APIs.

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.config import settings
from app.profile_completion import PROFILE_PROMPT_FIELDS


GENDER_VALUES = {"male", "female", "non_binary", "prefer_not_to_say", "custom"}


# ###############################################
# Account Schemas
# ###############################################

class ProfileCompletionOut(BaseModel):
    onboarding_completed: bool
    missing_fields: list[str]
    skipped_fields: list[str]
    next_prompt_field: str | None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    first_name: str | None
    last_name: str | None
    phone_number: str | None
    phone_verified: bool
    gender: str | None
    gender_custom: str | None
    date_of_birth: date | None
    locale: str | None
    timezone: str | None
    avatar_url: str | None
    mfa_enabled: bool
    mfa_enrolled: bool
    email_verified: bool
    profile_completion: ProfileCompletionOut


# ###############################################
# Authentication Schemas
# ###############################################


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str = Field(min_length=1, max_length=120)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if len(value) < settings.password_min_length:
            raise ValueError(f"Password must be at least {settings.password_min_length} characters.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MfaSetupOut(BaseModel):
    challenge_id: str
    otpauth_uri: str
    qr_code_data_url: str
    manual_entry_key: str


class RegisterResponse(BaseModel):
    mfa_setup_required: bool = True
    mfa_setup: MfaSetupOut
    user: UserOut


class LoginResponse(BaseModel):
    user: UserOut | None = None
    mfa_required: bool = False
    mfa_setup_required: bool = False
    challenge_id: str | None = None
    mfa_setup: MfaSetupOut | None = None


class MfaVerifyRequest(BaseModel):
    challenge_id: str
    code: str = Field(min_length=6, max_length=12)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < settings.password_min_length:
            raise ValueError(f"Password must be at least {settings.password_min_length} characters.")
        return value


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_link: str | None = None


class ResetPasswordInspectRequest(BaseModel):
    token: str = Field(min_length=1)


class ResetPasswordInspectResponse(BaseModel):
    valid: bool
    mfa_required: bool


class ResetPasswordCompleteRequest(BaseModel):
    token: str = Field(min_length=1)
    new_password: str
    mfa_code: str | None = Field(default=None, min_length=6, max_length=12)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < settings.password_min_length:
            raise ValueError(f"Password must be at least {settings.password_min_length} characters.")
        return value


class DisableMfaRequest(BaseModel):
    current_password: str
    code: str = Field(min_length=6, max_length=12)


# ###############################################
# Profile Schemas
# ###############################################

class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    first_name: str | None = Field(default=None, max_length=80)
    last_name: str | None = Field(default=None, max_length=80)
    phone_number: str | None = Field(default=None, max_length=40)
    gender: str | None = Field(default=None, max_length=30)
    gender_custom: str | None = Field(default=None, max_length=80)
    date_of_birth: date | None = None
    locale: str | None = Field(default=None, max_length=35)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("display_name", mode="before")
    @classmethod
    def validate_display_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Display name cannot be empty.")
        return stripped

    @field_validator(
        "first_name",
        "last_name",
        "phone_number",
        "gender_custom",
        "locale",
        "timezone",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("gender", mode="before")
    @classmethod
    def normalize_gender(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not normalized:
            return None
        if normalized not in GENDER_VALUES:
            raise ValueError("Gender is not supported.")
        return normalized

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("Date of birth cannot be in the future.")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Timezone is not supported.") from exc
        return value

    @model_validator(mode="after")
    def validate_gender_custom(self) -> "ProfileUpdateRequest":
        if self.gender == "custom" and not self.gender_custom:
            raise ValueError("Custom gender requires gender_custom.")
        if self.gender and self.gender != "custom":
            self.gender_custom = None
        return self


class OnboardingSkipRequest(BaseModel):
    field: str

    @field_validator("field")
    @classmethod
    def validate_field(cls, value: str) -> str:
        if value not in PROFILE_PROMPT_FIELDS:
            raise ValueError("Field is not part of profile onboarding.")
        return value


# ###############################################
# Session And Security Event Schemas
# ###############################################

class SessionOut(BaseModel):
    id: str
    device_label: str | None
    login_ip_address: str | None
    last_seen_ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    is_current: bool


class SecurityEventOut(BaseModel):
    id: str
    event_type: str
    ip_address: str | None
    user_agent: str | None
    device_label: str | None
    created_at: datetime
    metadata: dict | None = None


# ###############################################
# Common Schemas
# ###############################################


class MessageOut(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    id_token: str
    scope: str
