import pytest
from pydantic import ValidationError

from app.api.routes.demo import build_live_metric_payload
from app.infrastructure.database.models.device import Device
from app.main import app
from app.schemas.demo import DemoLiveMetricRequest, DemoSeedRequest


def test_demo_seed_route_is_registered() -> None:
    assert str(app.url_path_for("seed_demo_dataset")) == "/demo/seed"
    assert str(app.url_path_for("publish_live_demo_metric")) == "/demo/live-metric"


def test_demo_seed_request_normalizes_email() -> None:
    payload = DemoSeedRequest(email="  Demo@VoltPulse.LOCAL  ")

    assert payload.email == "demo@voltpulse.local"


def test_demo_seed_request_rejects_invalid_sample_count() -> None:
    with pytest.raises(ValidationError):
        DemoSeedRequest(sample_count=0)


def test_demo_live_metric_request_strips_scenario() -> None:
    payload = DemoLiveMetricRequest(
        home_id="00000000-0000-0000-0000-000000000001",
        device_id="00000000-0000-0000-0000-000000000002",
        scenario="  spike  ",
    )

    assert payload.scenario == "spike"


def test_build_live_metric_payload_computes_current_and_energy() -> None:
    device = Device(
        id="00000000-0000-0000-0000-000000000002",
        home_id="00000000-0000-0000-0000-000000000001",
        external_id="demo-main-meter",
        name="Main Smart Meter",
    )
    request = DemoLiveMetricRequest(
        home_id="00000000-0000-0000-0000-000000000001",
        device_id="00000000-0000-0000-0000-000000000002",
        active_power_w=920,
        voltage_v=230,
        power_factor=0.92,
        interval_minutes=15,
        scenario="manual",
    )

    payload = build_live_metric_payload(request, device)

    assert payload.device_external_id == "demo-main-meter"
    assert payload.active_power_w == 920
    assert payload.current_a == pytest.approx(4.348)
    assert payload.energy_wh_delta == 230
    assert payload.raw_payload == {
        "source": "live_mqtt_simulator",
        "scenario": "manual",
        "device_external_id": "demo-main-meter",
    }
