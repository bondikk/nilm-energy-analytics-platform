import asyncio
import socket
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
import structlog

from app.core.config import settings
from app.core.security import get_password_hash
from app.infrastructure.database.models.device import Device, DeviceStatus, DeviceType
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.models.user import User
from app.infrastructure.database.session import AsyncSessionLocal
from app.schemas.ingestion import IngestionMetricPayload
from app.services.nilm_anomaly_detection import NILMAnomalyConfig, create_nilm_anomalies_for_metric
from app.services.realtime_metrics import RedisMetricEventBus
from app.services.redis_streams import RedisMetricStream, build_redis_url


logger = structlog.get_logger(__name__)


class IngestionDeviceNotFoundError(Exception):
    pass


class IngestionDeviceAmbiguousError(Exception):
    pass


@dataclass(frozen=True)
class ResolvedIngestionDevice:
    device_id: uuid.UUID
    home_id: uuid.UUID
    user_id: uuid.UUID


@dataclass(frozen=True)
class MetricsWriterResult:
    processed: int
    acknowledged: int
    failed: int


class MetricsWriter:
    def __init__(
        self,
        stream: RedisMetricStream,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: RedisMetricEventBus | None = None,
        consumer_name: str | None = None,
    ) -> None:
        self.stream = stream
        self.session_factory = session_factory
        self.event_bus = event_bus
        self.consumer_name = consumer_name or f"metrics-writer-{socket.gethostname()}"

    async def process_once(self, count: int = 100, block_ms: int = 1_000) -> MetricsWriterResult:
        await self.stream.ensure_group()
        messages = await self.stream.read_metric_batch(
            consumer_name=self.consumer_name,
            count=count,
            block_ms=block_ms,
        )

        processed = 0
        acknowledged = 0
        failed = 0

        for message in messages:
            try:
                async with self.session_factory() as session:
                    await write_metric_payload(session, message.payload, event_bus=self.event_bus)
                processed += 1
                acknowledged += await self.stream.acknowledge(message.stream_id)
            except (IngestionDeviceAmbiguousError, IngestionDeviceNotFoundError) as exc:
                logger.warning(
                    "metric_ingestion_device_resolution_failed",
                    error=str(exc),
                    stream_id=message.stream_id,
                    consumer_name=self.consumer_name,
                )
                failed += 1

        return MetricsWriterResult(
            processed=processed,
            acknowledged=acknowledged,
            failed=failed,
        )

    async def run_forever(self, count: int = 100, block_ms: int = 1_000) -> None:
        while True:
            await self.process_once(count=count, block_ms=block_ms)


async def write_metric_payload(
    session: AsyncSession,
    payload: IngestionMetricPayload,
    event_bus: RedisMetricEventBus | None = None,
) -> EnergyMetric:
    resolved = await resolve_ingestion_device(session, payload)
    metric = build_energy_metric(payload, resolved)
    merged = await session.merge(metric)

    device = await session.get(Device, resolved.device_id)
    if device is not None:
        device.last_seen_at = payload.ts

    await create_nilm_anomalies_for_metric(
        session=session,
        resolved=resolved,
        metric_ts=payload.ts,
        config=build_nilm_anomaly_config(),
    )

    await session.commit()
    if event_bus is not None:
        await event_bus.publish_metric(merged)
    return merged


def build_nilm_anomaly_config() -> NILMAnomalyConfig:
    return NILMAnomalyConfig(
        enabled=settings.nilm_anomaly_detection_enabled,
        min_step_w=settings.nilm_anomaly_min_step_w,
        lookback_samples=settings.nilm_anomaly_lookback_samples,
        freshness_seconds=settings.nilm_anomaly_freshness_seconds,
        duplicate_window_seconds=settings.nilm_anomaly_duplicate_window_seconds,
    )


async def resolve_ingestion_device(
    session: AsyncSession,
    payload: IngestionMetricPayload,
) -> ResolvedIngestionDevice:
    statement = (
        select(
            Device.id.label("device_id"),
            Device.home_id.label("home_id"),
            Home.owner_id.label("user_id"),
        )
        .join(Home, Device.home_id == Home.id)
        .where(Device.status == "active")
    )

    if payload.device_id is not None:
        statement = statement.where(Device.id == payload.device_id)
    elif payload.home_id is not None and payload.device_external_id is not None:
        statement = statement.where(
            Device.home_id == payload.home_id,
            Device.external_id == payload.device_external_id,
        )
    elif payload.device_external_id is not None:
        statement = statement.where(Device.external_id == payload.device_external_id)

    result = await session.execute(statement)
    rows = list(result.all())
    if not rows:
        if _should_auto_create_ingestion_device(payload):
            return await get_or_create_demo_ingestion_device(session, payload)
        raise IngestionDeviceNotFoundError("ingestion device not found")
    if len(rows) > 1:
        raise IngestionDeviceAmbiguousError("device_external_id matched multiple homes")

    row = rows[0]
    return ResolvedIngestionDevice(
        device_id=row.device_id,
        home_id=row.home_id,
        user_id=row.user_id,
    )


async def get_or_create_demo_ingestion_device(
    session: AsyncSession,
    payload: IngestionMetricPayload,
) -> ResolvedIngestionDevice:
    if payload.device_external_id is None:
        raise IngestionDeviceNotFoundError("auto-create requires device_external_id")

    home = await _resolve_auto_create_home(session, payload)
    device = await session.scalar(
        select(Device).where(
            Device.home_id == home.id,
            Device.external_id == payload.device_external_id,
        )
    )
    firmware_version = _raw_payload_text(payload, "firmware_version")
    sample_rate = _raw_payload_float(payload, "sample_rate")

    if device is None:
        device = Device(
            home_id=home.id,
            external_id=payload.device_external_id,
            name=f"ESP32 monitor {payload.device_external_id}",
            device_type=DeviceType.SMART_METER,
            status=DeviceStatus.ACTIVE,
            firmware_version=firmware_version,
            sampling_rate_hz=sample_rate,
            last_seen_at=payload.ts,
        )
        session.add(device)
        await session.flush()
        logger.info(
            "auto_created_demo_ingestion_device",
            home_id=str(home.id),
            device_id=str(device.id),
            device_external_id=payload.device_external_id,
        )
    else:
        device.status = DeviceStatus.ACTIVE
        device.last_seen_at = payload.ts
        if firmware_version:
            device.firmware_version = firmware_version
        if sample_rate is not None:
            device.sampling_rate_hz = sample_rate
        await session.flush()

    return ResolvedIngestionDevice(
        device_id=device.id,
        home_id=home.id,
        user_id=home.owner_id,
    )


async def _resolve_auto_create_home(
    session: AsyncSession,
    payload: IngestionMetricPayload,
) -> Home:
    if payload.home_id is not None:
        home = await session.get(Home, payload.home_id)
        if home is None:
            raise IngestionDeviceNotFoundError("home_id for auto-created device was not found")
        return home

    user = await session.scalar(
        select(User).where(User.email == settings.ingestion_demo_user_email.strip().lower())
    )
    if user is None:
        user = User(
            email=settings.ingestion_demo_user_email.strip().lower(),
            hashed_password=get_password_hash("demo-password"),
            full_name="Demo Owner",
        )
        session.add(user)
        await session.flush()

    home = await session.scalar(
        select(Home).where(
            Home.owner_id == user.id,
            Home.name == settings.ingestion_demo_home_name,
        )
    )
    if home is None:
        home = Home(
            owner_id=user.id,
            name=settings.ingestion_demo_home_name,
            timezone="Europe/Bratislava",
            location_label="Local lab",
        )
        session.add(home)
        await session.flush()
    return home


def _should_auto_create_ingestion_device(payload: IngestionMetricPayload) -> bool:
    return (
        settings.ingestion_auto_create_demo_devices
        and settings.environment in {"local", "development", "dev", "demo", "test"}
        and payload.device_id is None
        and payload.device_external_id is not None
    )


def _raw_payload_text(payload: IngestionMetricPayload, key: str) -> str | None:
    value = (payload.raw_payload or {}).get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    nested = (payload.raw_payload or {}).get("raw_payload")
    if isinstance(nested, dict):
        nested_value = nested.get(key)
        if isinstance(nested_value, str) and nested_value.strip():
            return nested_value.strip()
    return None


def _raw_payload_float(payload: IngestionMetricPayload, key: str) -> float | None:
    value = (payload.raw_payload or {}).get(key)
    if isinstance(value, (int, float)):
        return float(value)
    nested = (payload.raw_payload or {}).get("raw_payload")
    if isinstance(nested, dict):
        nested_value = nested.get(key)
        if isinstance(nested_value, (int, float)):
            return float(nested_value)
    return None


def build_energy_metric(
    payload: IngestionMetricPayload,
    resolved: ResolvedIngestionDevice,
) -> EnergyMetric:
    return EnergyMetric(
        device_id=resolved.device_id,
        ts=payload.ts,
        user_id=resolved.user_id,
        home_id=resolved.home_id,
        voltage_v=payload.voltage_v,
        current_a=payload.current_a,
        active_power_w=payload.active_power_w,
        reactive_power_var=payload.reactive_power_var,
        apparent_power_va=payload.apparent_power_va,
        power_factor=payload.power_factor,
        frequency_hz=payload.frequency_hz,
        energy_wh_delta=payload.energy_wh_delta,
        raw_payload=payload.raw_payload,
    )


async def main() -> None:
    redis = Redis.from_url(build_redis_url(), decode_responses=False)
    stream = RedisMetricStream(redis)
    event_bus = RedisMetricEventBus(redis)
    worker = MetricsWriter(stream=stream, session_factory=AsyncSessionLocal, event_bus=event_bus)
    await worker.run_forever()


if __name__ == "__main__":
    asyncio.run(main())
