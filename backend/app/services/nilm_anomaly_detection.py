import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.anomaly import (
    Anomaly,
    AnomalySeverity,
    AnomalyStatus,
    AnomalyType,
)
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.services.nilm_analysis import (
    NILMDetectionConfig,
    NILMEvent,
    NILMEventType,
    NILMReading,
    NILMSignature,
    analyze_load_profile,
)


@dataclass(frozen=True)
class NILMAnomalyConfig:
    enabled: bool = True
    lookback_samples: int = 96
    min_step_w: float = 500.0
    freshness_seconds: int = 300
    duplicate_window_seconds: int = 600
    min_confidence: float = 0.55
    max_created_per_metric: int = 3


@dataclass(frozen=True)
class NILMAnomalyDetectionResult:
    candidate_count: int
    created: list[Anomaly]


class ResolvedAnomalyDevice(Protocol):
    @property
    def device_id(self) -> uuid.UUID: ...

    @property
    def home_id(self) -> uuid.UUID: ...

    @property
    def user_id(self) -> uuid.UUID: ...


async def create_nilm_anomalies_for_metric(
    session: AsyncSession,
    resolved: ResolvedAnomalyDevice,
    metric_ts: datetime,
    config: NILMAnomalyConfig | None = None,
) -> NILMAnomalyDetectionResult:
    active_config = config or NILMAnomalyConfig()
    if not active_config.enabled:
        return NILMAnomalyDetectionResult(candidate_count=0, created=[])

    readings = await load_recent_nilm_readings(
        session=session,
        device_id=resolved.device_id,
        metric_ts=metric_ts,
        limit=active_config.lookback_samples,
    )
    analysis = analyze_load_profile(
        readings,
        config=NILMDetectionConfig(
            min_step_w=active_config.min_step_w,
            smoothing_window=1,
        ),
    )
    candidates = select_fresh_anomaly_events(
        events=analysis.events,
        metric_ts=metric_ts,
        config=active_config,
    )

    created: list[Anomaly] = []
    for event in candidates[: active_config.max_created_per_metric]:
        if await has_recent_nilm_duplicate(
            session=session,
            resolved=resolved,
            event=event,
            config=active_config,
        ):
            continue

        anomaly = build_nilm_anomaly(event=event, resolved=resolved)
        session.add(anomaly)
        created.append(anomaly)

    return NILMAnomalyDetectionResult(
        candidate_count=len(candidates),
        created=created,
    )


async def load_recent_nilm_readings(
    session: AsyncSession,
    device_id: uuid.UUID,
    metric_ts: datetime,
    limit: int,
) -> list[NILMReading]:
    result = await session.scalars(
        select(EnergyMetric)
        .where(
            EnergyMetric.device_id == device_id,
            EnergyMetric.ts <= metric_ts,
            EnergyMetric.active_power_w.is_not(None),
        )
        .order_by(EnergyMetric.ts.desc())
        .limit(limit)
    )
    readings = [
        NILMReading(ts=metric.ts, active_power_w=float(metric.active_power_w))
        for metric in result
        if metric.active_power_w is not None
    ]
    return sorted(readings, key=lambda reading: reading.ts)


def select_fresh_anomaly_events(
    events: list[NILMEvent],
    metric_ts: datetime,
    config: NILMAnomalyConfig,
) -> list[NILMEvent]:
    fresh_events: list[NILMEvent] = []
    for event in events:
        if event.event_type != NILMEventType.TURN_ON:
            continue
        if event.confidence < config.min_confidence:
            continue
        if abs((metric_ts - event.ts).total_seconds()) > config.freshness_seconds:
            continue
        if event.signature not in {
            NILMSignature.FLEXIBLE_APPLIANCE,
            NILMSignature.HVAC_OR_HEATER,
            NILMSignature.LARGE_RESISTIVE_LOAD,
        }:
            continue
        fresh_events.append(event)

    fresh_events.sort(key=lambda event: (event.ts, abs(event.delta_w)), reverse=True)
    return fresh_events


async def has_recent_nilm_duplicate(
    session: AsyncSession,
    resolved: ResolvedAnomalyDevice,
    event: NILMEvent,
    config: NILMAnomalyConfig,
) -> bool:
    duplicate_start = event.ts - timedelta(seconds=config.duplicate_window_seconds)
    duplicate_end = event.ts + timedelta(seconds=config.duplicate_window_seconds)

    existing_id = await session.scalar(
        select(Anomaly.id)
        .where(
            Anomaly.home_id == resolved.home_id,
            Anomaly.device_id == resolved.device_id,
            Anomaly.anomaly_type == AnomalyType.POWER_SPIKE,
            Anomaly.detected_at >= duplicate_start,
            Anomaly.detected_at <= duplicate_end,
        )
        .limit(1)
    )
    return existing_id is not None


def build_nilm_anomaly(
    event: NILMEvent,
    resolved: ResolvedAnomalyDevice,
) -> Anomaly:
    return Anomaly(
        user_id=resolved.user_id,
        home_id=resolved.home_id,
        device_id=resolved.device_id,
        anomaly_type=AnomalyType.POWER_SPIKE,
        severity=severity_for_nilm_event(event),
        status=AnomalyStatus.OPEN,
        detected_at=event.ts,
        title=title_for_nilm_event(event),
        description=event.description,
        score=max(event.confidence, event.score),
        metadata_json={
            "source": "nilm_signal_analysis",
            "event_type": event.event_type.value,
            "signature": event.signature.value,
            "delta_w": event.delta_w,
            "before_w": event.before_w,
            "after_w": event.after_w,
            "confidence": event.confidence,
            "duration_seconds": event.duration_seconds,
            "estimated_energy_wh": event.estimated_energy_wh,
        },
    )


def severity_for_nilm_event(event: NILMEvent) -> AnomalySeverity:
    magnitude = abs(event.delta_w)
    if magnitude >= 1_800:
        return AnomalySeverity.CRITICAL
    if magnitude >= 1_000:
        return AnomalySeverity.HIGH
    if magnitude >= 500:
        return AnomalySeverity.MEDIUM
    return AnomalySeverity.LOW


def title_for_nilm_event(event: NILMEvent) -> str:
    labels = {
        NILMSignature.FLEXIBLE_APPLIANCE: "Flexible appliance load event",
        NILMSignature.HVAC_OR_HEATER: "HVAC or heater load event",
        NILMSignature.LARGE_RESISTIVE_LOAD: "Large resistive load event",
        NILMSignature.FRIDGE_COMPRESSOR: "Compressor load event",
        NILMSignature.UNKNOWN_LOAD: "Unknown load event",
        NILMSignature.DEVICE_OFF: "Load switched off",
    }
    return f"NILM detected: {labels[event.signature]}"
