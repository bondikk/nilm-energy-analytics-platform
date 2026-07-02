import uuid
from datetime import datetime

from pydantic import BaseModel


class EnergySummaryRead(BaseModel):
    home_id: uuid.UUID
    device_id: uuid.UUID | None
    start: datetime | None
    end: datetime | None
    sample_count: int
    energy_wh_delta_total: float | None
    active_power_w_avg: float | None
    active_power_w_min: float | None
    active_power_w_max: float | None
    current_a_avg: float | None
    voltage_v_avg: float | None
