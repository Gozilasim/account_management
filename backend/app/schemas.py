# Created at: 2026-05-11 01:17
# Updated at: 2026-05-11 01:17
# Description: Pydantic request and response schemas for Portal APIs.

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.config import settings


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    avatar_url: str | None
    mfa_enabled: bool
    mfa_enrolled: bool
    email_verified: bool


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


class DisableMfaRequest(BaseModel):
    current_password: str
    code: str = Field(min_length=6, max_length=12)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)


class MessageOut(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    id_token: str
    scope: str
