import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.infrastructure.database.models.anomaly import AnomalySeverity, AnomalyStatus, AnomalyType
from app.services.nilm_analysis import NILMEvent, NILMEventType, NILMSignature
from app.services.nilm_anomaly_detection import (
    NILMAnomalyConfig,
    build_nilm_anomaly,
    select_fresh_anomaly_events,
    severity_for_nilm_event,
    title_for_nilm_event,
)


def build_event(
    *,
    ts: datetime,
    delta_w: float,
    signature: NILMSignature,
    confidence: float = 0.8,
    event_type: NILMEventType = NILMEventType.TURN_ON,
) -> NILMEvent:
    return NILMEvent(
        ts=ts,
        event_type=event_type,
        signature=signature,
        delta_w=delta_w,
        before_w=300.0,
        after_w=300.0 + delta_w,
        confidence=confidence,
        score=0.7,
        description="Detected from load profile.",
    )


def test_select_fresh_anomaly_events_keeps_actionable_turn_on_events() -> None:
    metric_ts = datetime(2026, 7, 2, 18, 15, tzinfo=UTC)
    fresh_hvac = build_event(
        ts=metric_ts - timedelta(seconds=30),
        delta_w=1_250,
        signature=NILMSignature.HVAC_OR_HEATER,
    )
    old_hvac = build_event(
        ts=metric_ts - timedelta(minutes=20),
        delta_w=1_250,
        signature=NILMSignature.HVAC_OR_HEATER,
    )
    turn_off = build_event(
        ts=metric_ts,
        delta_w=-1_250,
        signature=NILMSignature.DEVICE_OFF,
        event_type=NILMEventType.TURN_OFF,
    )
    compressor = build_event(
        ts=metric_ts,
        delta_w=140,
        signature=NILMSignature.FRIDGE_COMPRESSOR,
    )
    low_confidence = build_event(
        ts=metric_ts,
        delta_w=700,
        signature=NILMSignature.FLEXIBLE_APPLIANCE,
        confidence=0.4,
    )

    events = select_fresh_anomaly_events(
        events=[old_hvac, turn_off, compressor, low_confidence, fresh_hvac],
        metric_ts=metric_ts,
        config=NILMAnomalyConfig(freshness_seconds=300),
    )

    assert events == [fresh_hvac]


def test_build_nilm_anomaly_maps_event_to_open_power_spike() -> None:
    resolved = SimpleNamespace(
        device_id=uuid.uuid4(),
        home_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    event = build_event(
        ts=datetime(2026, 7, 2, 18, 15, tzinfo=UTC),
        delta_w=1_250,
        signature=NILMSignature.HVAC_OR_HEATER,
    )

    anomaly = build_nilm_anomaly(event=event, resolved=resolved)

    assert anomaly.user_id == resolved.user_id
    assert anomaly.home_id == resolved.home_id
    assert anomaly.device_id == resolved.device_id
    assert anomaly.anomaly_type is AnomalyType.POWER_SPIKE
    assert anomaly.severity is AnomalySeverity.HIGH
    assert anomaly.status is AnomalyStatus.OPEN
    assert anomaly.detected_at == event.ts
    assert anomaly.score == 0.8
    assert anomaly.metadata_json == {
        "source": "nilm_signal_analysis",
        "event_type": "turn_on",
        "signature": "hvac_or_heater",
        "delta_w": 1250,
        "before_w": 300.0,
        "after_w": 1550.0,
        "confidence": 0.8,
        "duration_seconds": None,
        "estimated_energy_wh": None,
    }


def test_nilm_anomaly_severity_uses_step_magnitude() -> None:
    low = build_event(
        ts=datetime(2026, 7, 2, 18, 0, tzinfo=UTC),
        delta_w=250,
        signature=NILMSignature.FLEXIBLE_APPLIANCE,
    )
    medium = build_event(
        ts=datetime(2026, 7, 2, 18, 1, tzinfo=UTC),
        delta_w=550,
        signature=NILMSignature.FLEXIBLE_APPLIANCE,
    )
    critical = build_event(
        ts=datetime(2026, 7, 2, 18, 2, tzinfo=UTC),
        delta_w=2_200,
        signature=NILMSignature.LARGE_RESISTIVE_LOAD,
    )

    assert severity_for_nilm_event(low) is AnomalySeverity.LOW
    assert severity_for_nilm_event(medium) is AnomalySeverity.MEDIUM
    assert severity_for_nilm_event(critical) is AnomalySeverity.CRITICAL


def test_nilm_anomaly_title_uses_signature_label() -> None:
    event = build_event(
        ts=datetime(2026, 7, 2, 18, 0, tzinfo=UTC),
        delta_w=2_200,
        signature=NILMSignature.LARGE_RESISTIVE_LOAD,
    )

    assert title_for_nilm_event(event) == "NILM detected: Large resistive load event"
