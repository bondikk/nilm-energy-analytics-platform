import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.main import app
from app.services.live_nilm import analyze_live_nilm


def _metric(index: int, power_w: float) -> SimpleNamespace:
    return SimpleNamespace(
        device_id=uuid.UUID("00000000-0000-0000-0000-000000000123"),
        home_id=uuid.UUID("00000000-0000-0000-0000-000000000456"),
        ts=datetime(2026, 7, 6, 9, 0, tzinfo=UTC) + timedelta(minutes=index),
        voltage_v=230.0,
        current_a=round(power_w / 230, 3),
        active_power_w=power_w,
        apparent_power_va=None,
        raw_payload={"source": "test"},
    )


def test_live_nilm_routes_are_registered() -> None:
    home_id = uuid.uuid4()

    assert (
        str(app.url_path_for("get_live_nilm_summary", home_id=home_id))
        == f"/homes/{home_id}/live-nilm/summary"
    )
    assert (
        str(app.url_path_for("get_live_nilm_current", home_id=home_id))
        == f"/homes/{home_id}/live-nilm/current"
    )
    assert (
        str(app.url_path_for("get_live_nilm_events", home_id=home_id))
        == f"/homes/{home_id}/live-nilm/events"
    )


def test_live_nilm_detects_current_disaggregation_and_signal_quality() -> None:
    home_id = uuid.uuid4()
    device_id = uuid.uuid4()
    metrics = [
        _metric(0, 180),
        _metric(1, 185),
        _metric(2, 190),
        _metric(3, 2320),
        _metric(4, 2360),
        _metric(5, 2350),
    ]

    summary = analyze_live_nilm(
        home_id=home_id,
        device_id=device_id,
        metrics=metrics,
        min_step_w=300,
    )

    assert summary.home_id == home_id
    assert summary.current.current_power_w == 2350
    assert summary.current.appliance_estimates
    assert summary.current.appliance_estimates[0].appliance == "kettle"
    assert summary.current.appliance_estimates[0].confidence > 0.6
    assert summary.events[0].direction == "on"
    assert summary.events[0].step_magnitude_w >= 2000
    assert summary.signal.sample_count == 6
    assert summary.signal.step_count == 1
    assert "heuristic" in summary.current.limitations[0].lower()
