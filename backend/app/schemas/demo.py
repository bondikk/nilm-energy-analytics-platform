import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.services.demo_data import DEMO_EMAIL, DEMO_PASSWORD


class DemoSeedRequest(BaseModel):
    email: str = Field(default=DEMO_EMAIL, max_length=320)
    password: str = Field(default=DEMO_PASSWORD, min_length=8, max_length=128)
    sample_count: int = Field(default=96, ge=1, le=2880)
    interval_minutes: int = Field(default=15, ge=1, le=1440)
    start_at: datetime | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("Invalid email address")
        return normalized


class DemoSeedResponse(BaseModel):
    email: str
    password: str
    user_id: uuid.UUID
    home_id: uuid.UUID
    device_id: uuid.UUID
    metric_count: int
    anomaly_count: int
