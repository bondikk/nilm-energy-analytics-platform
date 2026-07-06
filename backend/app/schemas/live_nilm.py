import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LiveNILMReadingPointRead(BaseModel):
    ts: datetime
    power_w: float
    smoothed_power_w: float
    voltage_v: float | None
    current_a: float | None


class LiveNILMEventRead(BaseModel):
    event_id: str
    ts: datetime
    direction: str
    step_magnitude_w: float
    before_power_w: float
    after_power_w: float
    estimated_appliance: str
    confidence: float = Field(ge=0, le=1)
    duration_seconds: int | None
    source_signal: str
    explanation: str
    limitations: list[str]


class LiveNILMApplianceEstimateRead(BaseModel):
    appliance: str
    label: str
    estimated_power_w: float
    confidence: float = Field(ge=0, le=1)
    state: str
    source_event_id: str | None
    explanation: str


class LiveNILMCurrentRead(BaseModel):
    home_id: uuid.UUID
    device_id: uuid.UUID | None
    current_power_w: float
    voltage_v: float | None
    current_a: float | None
    base_load_w: float
    unknown_load_w: float
    source_signal: str
    signal_unit: str = "W"
    latest_sample_at: datetime | None
    appliance_estimates: list[LiveNILMApplianceEstimateRead]
    last_event: LiveNILMEventRead | None
    limitations: list[str]


class LiveNILMSignalSummaryRead(BaseModel):
    sample_count: int
    start_at: datetime | None
    end_at: datetime | None
    source_signal: str
    min_power_w: float | None
    mean_power_w: float | None
    max_power_w: float | None
    base_load_w: float
    peak_to_base_w: float
    step_count: int
    voltage_estimated: bool
    quality_flags: list[str]


class LiveNILMSummaryRead(BaseModel):
    home_id: uuid.UUID
    device_id: uuid.UUID | None
    current: LiveNILMCurrentRead
    signal: LiveNILMSignalSummaryRead
    events: list[LiveNILMEventRead]
    recent_points: list[LiveNILMReadingPointRead]
