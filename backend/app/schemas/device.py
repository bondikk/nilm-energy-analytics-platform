import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.infrastructure.database.models.device import DeviceStatus, DeviceType


class DeviceCreate(BaseModel):
    external_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    device_type: DeviceType = DeviceType.SIMULATED_METER
    status: DeviceStatus = DeviceStatus.ACTIVE
    firmware_version: str | None = Field(default=None, max_length=64)
    sampling_rate_hz: float | None = Field(default=None, gt=0)

    @field_validator("external_id", "name", "firmware_version")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class DeviceUpdate(BaseModel):
    external_id: str | None = Field(default=None, min_length=1, max_length=128)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    device_type: DeviceType | None = None
    status: DeviceStatus | None = None
    firmware_version: str | None = Field(default=None, max_length=64)
    sampling_rate_hz: float | None = Field(default=None, gt=0)

    @field_validator("external_id", "name", "firmware_version")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class DeviceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    external_id: str
    name: str
    device_type: DeviceType
    status: DeviceStatus
    firmware_version: str | None
    sampling_rate_hz: float | None
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime
