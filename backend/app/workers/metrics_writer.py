import asyncio
import socket
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import AsyncSessionLocal
from app.schemas.ingestion import IngestionMetricPayload
from app.services.nilm_anomaly_detection import NILMAnomalyConfig, create_nilm_anomalies_for_metric
from app.services.realtime_metrics import RedisMetricEventBus
from app.services.redis_streams import RedisMetricStream, build_redis_url


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
            except (IngestionDeviceAmbiguousError, IngestionDeviceNotFoundError):
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
        raise IngestionDeviceNotFoundError("ingestion device not found")
    if len(rows) > 1:
        raise IngestionDeviceAmbiguousError("device_external_id matched multiple homes")

    row = rows[0]
    return ResolvedIngestionDevice(
        device_id=row.device_id,
        home_id=row.home_id,
        user_id=row.user_id,
    )


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
