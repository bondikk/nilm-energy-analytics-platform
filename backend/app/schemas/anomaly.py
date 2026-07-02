import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.infrastructure.database.models.anomaly import (
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
)


class AnomalyCreate(BaseModel):
    device_id: uuid.UUID | None = None
    anomaly_type: AnomalyType
    severity: AnomalySeverity = AnomalySeverity.MEDIUM
    status: AnomalyStatus = AnomalyStatus.OPEN
    detected_at: datetime
    resolved_at: datetime | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    score: float | None = Field(default=None, ge=0, le=1)
    metadata_json: dict[str, object] | None = None

    @field_validator("title", "description")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class AnomalyUpdate(BaseModel):
    device_id: uuid.UUID | None = None
    anomaly_type: AnomalyType | None = None
    severity: AnomalySeverity | None = None
    status: AnomalyStatus | None = None
    detected_at: datetime | None = None
    resolved_at: datetime | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    score: float | None = Field(default=None, ge=0, le=1)
    metadata_json: dict[str, object] | None = None

    @field_validator("title", "description")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Value cannot be blank")
        return stripped


class AnomalyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    home_id: uuid.UUID
    device_id: uuid.UUID | None
    anomaly_type: AnomalyType
    severity: AnomalySeverity
    status: AnomalyStatus
    detected_at: datetime
    resolved_at: datetime | None
    title: str
    description: str | None
    score: float | None
    metadata_json: dict[str, object] | None
    created_at: datetime
    updated_at: datetime
