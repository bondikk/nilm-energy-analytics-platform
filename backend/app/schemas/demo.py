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


class DemoLiveMetricRequest(BaseModel):
    home_id: uuid.UUID
    device_id: uuid.UUID
    ts: datetime | None = None
    active_power_w: float = Field(default=540.0, ge=0)
    voltage_v: float = Field(default=230.0, ge=0)
    current_a: float | None = Field(default=None, ge=0)
    power_factor: float = Field(default=0.94, ge=0.01, le=1)
    energy_wh_delta: float | None = Field(default=None, ge=0)
    interval_minutes: int = Field(default=15, ge=1, le=1440)
    scenario: str = Field(default="manual", min_length=1, max_length=64)

    @field_validator("scenario")
    @classmethod
    def strip_scenario(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("scenario cannot be blank")
        return stripped


class DemoLiveMetricResponse(BaseModel):
    published: bool
    topic: str
    home_id: uuid.UUID
    device_id: uuid.UUID
    device_external_id: str
    ts: datetime
    active_power_w: float
    voltage_v: float
    current_a: float
    energy_wh_delta: float
    scenario: str
