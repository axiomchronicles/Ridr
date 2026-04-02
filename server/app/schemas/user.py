from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    city: str | None = Field(default=None, max_length=120)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def normalize_required_names(cls, value: str) -> str:
        return value.strip()

    @field_validator("phone", "city", mode="before")
    @classmethod
    def normalize_optional_text_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()
        return cleaned or None


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)


class UserPublic(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
