# Created at: 2026-05-11 01:17
# Updated at: 2026-05-12 02:42
# Description: Application settings loaded from environment variables.

from __future__ import annotations

# ###############################################
# Imports
# ###############################################

import os
from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ###############################################
# Paths
# ###############################################

PROJECT_ROOT = Path(os.getenv("PORTAL_PROJECT_ROOT", Path(__file__).resolve().parents[2])).resolve()
BACKEND_ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_SQLITE_PATH = PROJECT_ROOT / "data" / "portal.db"


# ###############################################
# Settings Model
# ###############################################

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: str = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    backend_url: AnyHttpUrl | None = None
    frontend_host: str = "127.0.0.1"
    frontend_port: int = 5173
    frontend_url: AnyHttpUrl | None = None
    cors_origins: str = ""

    session_cookie_name: str = "portal_session"
    session_cookie_secure: bool = False
    session_ttl_minutes: int = 60 * 24 * 7
    trust_proxy_headers: bool = False

    mfa_issuer: str = "My Portal"
    password_min_length: int = 8
    password_reset_delivery: str = "dev_log"
    password_reset_token_ttl_minutes: int = 30
    avatar_max_bytes: int = 5 * 1024 * 1024

    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None

    oidc_private_key_pem: str | None = None
    oidc_private_key_path: str | None = None
    oidc_key_id: str = "portal-dev-key"
    oidc_access_token_ttl_minutes: int = 60
    oidc_code_ttl_minutes: int = 5
    oidc_clients_json: str = ""

    @model_validator(mode="after")
    def normalize_sqlite_database_url(self) -> "Settings":
        prefix = self.sqlite_prefix(self.database_url)
        if not prefix or self.database_url.endswith(":memory:"):
            return self

        raw_path = self.database_url.split("///", 1)[1]
        db_path = Path(raw_path).expanduser()
        if not db_path.is_absolute():
            db_path = PROJECT_ROOT / db_path
        self.database_url = f"{prefix}{db_path.resolve().as_posix()}"
        return self

    @field_validator(
        "backend_url",
        "frontend_url",
        "cloudinary_cloud_name",
        "cloudinary_api_key",
        "cloudinary_api_secret",
        "oidc_private_key_pem",
        "oidc_private_key_path",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value == "":
            return None
        return value

    @property
    def issuer(self) -> str:
        if self.backend_url:
            return str(self.backend_url).rstrip("/")
        return f"http://{self.public_host(self.backend_host)}:{self.backend_port}"

    @property
    def frontend_origin(self) -> str:
        if self.frontend_url:
            return str(self.frontend_url).rstrip("/")
        return f"http://{self.public_host(self.frontend_host)}:{self.frontend_port}"

    @property
    def cors_allowed_origins(self) -> list[str]:
        configured_origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if configured_origins:
            return configured_origins

        origins = [
            self.frontend_origin,
            f"http://localhost:{self.frontend_port}",
            f"http://127.0.0.1:{self.frontend_port}",
        ]
        return list(dict.fromkeys(origins))

    @property
    def cloudinary_configured(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    def ensure_sqlite_parent_directory(self) -> None:
        prefix = self.sqlite_prefix(self.database_url)
        if not prefix:
            return
        if self.database_url.endswith(":memory:"):
            return
        raw_path = self.database_url.split("///", 1)[1]
        Path(raw_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def public_host(host: str) -> str:
        if host in {"0.0.0.0", "::", "127.0.0.1"}:
            return "localhost"
        return host

    @staticmethod
    def sqlite_prefix(database_url: str) -> str | None:
        if database_url.startswith("sqlite+pysqlite:///"):
            return "sqlite+pysqlite:///"
        if database_url.startswith("sqlite:///"):
            return "sqlite:///"
        return None


# ###############################################
# Settings Singleton
# ###############################################

@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
