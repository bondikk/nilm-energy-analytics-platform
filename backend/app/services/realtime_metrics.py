import asyncio
import inspect
import uuid
from collections.abc import AsyncIterator, Mapping
from typing import Any, Protocol, cast

from app.core.config import settings
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.schemas.realtime import RealtimeMetricEvent


METRIC_EVENTS_CHANNEL = "voltpulse.metrics.live"


class RedisRealtimeConnection(Protocol):
    async def publish(self, channel: str, message: str) -> int: ...

    def pubsub(self) -> Any: ...


class RedisMetricEventBus:
    def __init__(
        self,
        redis: RedisRealtimeConnection,
        channel_name: str = METRIC_EVENTS_CHANNEL,
    ) -> None:
        self.redis = redis
        self.channel_name = channel_name

    async def publish_metric(self, metric: EnergyMetric) -> int:
        event = RealtimeMetricEvent.from_metric(metric)
        return int(await self.redis.publish(self.channel_name, event.model_dump_json()))

    async def iter_metric_events(self) -> AsyncIterator[RealtimeMetricEvent]:
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(self.channel_name)

        try:
            while True:
                raw_message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
                if raw_message is None:
                    await asyncio.sleep(0.05)
                    continue

                message = cast(Mapping[str, object], raw_message)
                raw_data = message.get("data")
                if not isinstance(raw_data, bytes | str):
                    continue

                yield parse_metric_event_message(raw_data)
        finally:
            await pubsub.unsubscribe(self.channel_name)
            close_result = pubsub.aclose()
            if inspect.isawaitable(close_result):
                await close_result


def parse_metric_event_message(raw_data: bytes | str) -> RealtimeMetricEvent:
    raw_text = raw_data.decode("utf-8") if isinstance(raw_data, bytes) else raw_data
    return RealtimeMetricEvent.model_validate_json(raw_text)


def metric_event_matches_filter(
    event: RealtimeMetricEvent,
    home_id: uuid.UUID,
    device_id: uuid.UUID | None,
) -> bool:
    if event.home_id != home_id:
        return False
    if device_id is not None and event.device_id != device_id:
        return False
    return True


def build_redis_url() -> str:
    return settings.redis_url
