import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HomeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    timezone: str = Field(default="Europe/Bratislava", min_length=1, max_length=64)
    location_label: str | None = Field(default=None, max_length=255)

    @field_validator("name", "timezone", "location_label")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class HomeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    location_label: str | None = Field(default=None, max_length=255)

    @field_validator("name", "timezone", "location_label")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class HomeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    timezone: str
    location_label: str | None
    created_at: datetime
    updated_at: datetime
