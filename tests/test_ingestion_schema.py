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


def test_ingestion_payload_requires_device_identifier() -> None:
    with pytest.raises(ValidationError):
        IngestionMetricPayload(ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC))
