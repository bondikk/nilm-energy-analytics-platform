import uuid
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.analytics import get_energy_summary
from app.main import app
from app.schemas.analytics import EnergySummaryRead


def test_analytics_summary_route_is_registered() -> None:
    home_id = uuid.uuid4()

    assert (
        str(app.url_path_for("get_energy_summary", home_id=home_id))
        == f"/homes/{home_id}/analytics/summary"
    )


def test_energy_summary_read_schema() -> None:
    home_id = uuid.uuid4()
    start = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)
    end = datetime(2026, 7, 2, 13, 0, tzinfo=UTC)

    payload = EnergySummaryRead(
        home_id=home_id,
        device_id=None,
        start=start,
        end=end,
        sample_count=12,
        energy_wh_delta_total=1800.0,
        active_power_w_avg=900.0,
        active_power_w_min=500.0,
        active_power_w_max=1200.0,
        current_a_avg=4.0,
        voltage_v_avg=230.0,
    )

    assert payload.home_id == home_id
    assert payload.sample_count == 12
    assert payload.energy_wh_delta_total == 1800.0


@pytest.mark.asyncio
async def test_energy_summary_rejects_inverted_time_range() -> None:
    home = SimpleNamespace(id=uuid.uuid4())
    start = datetime(2026, 7, 2, 13, 0, tzinfo=UTC)
    end = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)

    with pytest.raises(HTTPException) as exc_info:
        await get_energy_summary(
            home=home,
            session=SimpleNamespace(),
            start=start,
            end=end,
            device_id=None,
        )

    assert exc_info.value.status_code == 400
