import uuid
from datetime import UTC, datetime

from app.schemas.ingestion import IngestionMetricPayload
from app.services.nilm_anomaly_detection import NILMAnomalyConfig
from app.workers.metrics_writer import ResolvedIngestionDevice, build_energy_metric, build_nilm_anomaly_config


def test_build_energy_metric_maps_ingestion_payload_to_database_model() -> None:
    resolved = ResolvedIngestionDevice(
        device_id=uuid.uuid4(),
        home_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
    )
    payload = IngestionMetricPayload(
        ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        device_external_id="demo-main-meter",
        voltage_v=230.0,
        current_a=2.4,
        active_power_w=552.0,
        power_factor=0.95,
        energy_wh_delta=138.0,
        raw_payload={"source": "mqtt"},
    )

    metric = build_energy_metric(payload, resolved)

    assert metric.device_id == resolved.device_id
    assert metric.home_id == resolved.home_id
    assert metric.user_id == resolved.user_id
    assert metric.ts == payload.ts
    assert metric.active_power_w == 552.0
    assert metric.raw_payload == {"source": "mqtt"}


def test_build_nilm_anomaly_config_reads_settings() -> None:
    config = build_nilm_anomaly_config()

    assert isinstance(config, NILMAnomalyConfig)
    assert config.min_step_w > 0
    assert config.lookback_samples > 0
