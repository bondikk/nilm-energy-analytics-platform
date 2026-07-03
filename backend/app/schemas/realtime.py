import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.infrastructure.database.models.energy_metric import EnergyMetric


class RealtimeMetricEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_type: Literal["metric.created"] = "metric.created"
    home_id: uuid.UUID
    device_id: uuid.UUID
    ts: datetime
    voltage_v: float | None
    current_a: float | None
    active_power_w: float | None
    reactive_power_var: float | None
    apparent_power_va: float | None
    power_factor: float | None
    frequency_hz: float | None
    energy_wh_delta: float | None

    @classmethod
    def from_metric(cls, metric: EnergyMetric) -> "RealtimeMetricEvent":
        return cls(
            home_id=metric.home_id,
            device_id=metric.device_id,
            ts=metric.ts,
            voltage_v=metric.voltage_v,
            current_a=metric.current_a,
            active_power_w=metric.active_power_w,
            reactive_power_var=metric.reactive_power_var,
            apparent_power_va=metric.apparent_power_va,
            power_factor=metric.power_factor,
            frequency_hz=metric.frequency_hz,
            energy_wh_delta=metric.energy_wh_delta,
        )
