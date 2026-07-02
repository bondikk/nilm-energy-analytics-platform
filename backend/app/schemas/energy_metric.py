import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class EnergyMetricCreate(BaseModel):
    ts: datetime
    voltage_v: float | None = Field(default=None, ge=0)
    current_a: float | None = Field(default=None, ge=0)
    active_power_w: float | None = None
    reactive_power_var: float | None = None
    apparent_power_va: float | None = None
    power_factor: float | None = Field(default=None, ge=-1, le=1)
    frequency_hz: float | None = None
    energy_wh_delta: float | None = None
    raw_payload: dict[str, object] | None = None


class EnergyMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    device_id: uuid.UUID
    ts: datetime
    user_id: uuid.UUID
    home_id: uuid.UUID
    voltage_v: float | None
    current_a: float | None
    active_power_w: float | None
    reactive_power_var: float | None
    apparent_power_va: float | None
    power_factor: float | None
    frequency_hz: float | None
    energy_wh_delta: float | None
    raw_payload: dict[str, object] | None
