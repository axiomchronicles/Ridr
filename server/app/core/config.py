from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Ridr API"
    app_env: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    database_url: str = f"sqlite:///{BASE_DIR / 'ridr.db'}"

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []

            if raw_value.startswith("["):
                parsed_value = json.loads(raw_value)
                if isinstance(parsed_value, list):
                    return [str(item).strip() for item in parsed_value if str(item).strip()]

            return [item.strip() for item in raw_value.split(",") if item.strip()]

        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
