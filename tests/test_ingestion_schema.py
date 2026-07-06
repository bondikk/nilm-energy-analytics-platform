import json
import uuid
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.schemas.ingestion import IngestionMetricPayload, parse_ingestion_payload


def test_ingestion_payload_round_trips_stream_fields() -> None:
    payload = IngestionMetricPayload(
        ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        home_id=uuid.uuid4(),
        device_external_id="  demo-main-meter  ",
        voltage_v=230.0,
        current_a=2.3,
        active_power_w=529.0,
        power_factor=0.94,
    )

    restored = IngestionMetricPayload.from_stream_fields(payload.to_stream_fields())

    assert restored.device_external_id == "demo-main-meter"
    assert restored.active_power_w == 529.0
    assert restored.ts == payload.ts


def test_parse_ingestion_payload_preserves_raw_payload() -> None:
    raw_payload = {
        "ts": "2026-07-02T12:00:00",
        "device_external_id": "demo-main-meter",
        "active_power_w": 529.0,
    }

    parsed = parse_ingestion_payload(json.dumps(raw_payload))

    assert parsed.ts == datetime(2026, 7, 2, 12, 0, tzinfo=UTC)
    assert parsed.raw_payload == raw_payload


def test_parse_ingestion_payload_normalizes_legacy_esp32_payload() -> None:
    raw_payload = {
        "device_id": "esp32-01",
        "timestamp": "2026-07-06T10:00:00Z",
        "i_rms": 0.42,
        "v_rms": 230.0,
        "s_est_va": 96.6,
        "sample_rate": 1000,
        "source": "esp32_ads1256",
    }

    parsed = parse_ingestion_payload(json.dumps(raw_payload))

    assert parsed.ts == datetime(2026, 7, 6, 10, 0, tzinfo=UTC)
    assert parsed.device_id is None
    assert parsed.device_external_id == "esp32-01"
    assert parsed.current_a == 0.42
    assert parsed.voltage_v == 230.0
    assert parsed.apparent_power_va == 96.6
    assert parsed.active_power_w is None
    assert parsed.raw_payload == raw_payload


def test_ingestion_payload_requires_device_identifier() -> None:
    with pytest.raises(ValidationError):
        IngestionMetricPayload(ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC))
