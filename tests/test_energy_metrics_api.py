import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.main import app
from app.schemas.energy_metric import EnergyMetricCreate


def test_energy_metric_routes_are_registered() -> None:
    home_id = uuid.uuid4()
    device_id = uuid.uuid4()

    expected_path = f"/homes/{home_id}/devices/{device_id}/metrics"

    assert (
        str(app.url_path_for("create_energy_metric", home_id=home_id, device_id=device_id))
        == expected_path
    )
    assert (
        str(app.url_path_for("list_energy_metrics", home_id=home_id, device_id=device_id))
        == expected_path
    )


def test_energy_metric_create_accepts_valid_payload() -> None:
    payload = EnergyMetricCreate(
        ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        voltage_v=230.0,
        current_a=4.2,
        active_power_w=966.0,
        power_factor=0.95,
        raw_payload={"source": "simulator"},
    )

    assert payload.voltage_v == 230.0
    assert payload.current_a == 4.2
    assert payload.power_factor == 0.95


def test_energy_metric_create_rejects_negative_voltage() -> None:
    with pytest.raises(ValidationError):
        EnergyMetricCreate(
            ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
            voltage_v=-1,
        )


def test_energy_metric_create_rejects_invalid_power_factor() -> None:
    with pytest.raises(ValidationError):
        EnergyMetricCreate(
            ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
            power_factor=1.5,
        )
