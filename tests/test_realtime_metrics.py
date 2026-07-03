import uuid
from datetime import UTC, datetime

import pytest

from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.schemas.realtime import RealtimeMetricEvent
from app.services.realtime_metrics import (
    METRIC_EVENTS_CHANNEL,
    RedisMetricEventBus,
    metric_event_matches_filter,
    parse_metric_event_message,
)


class FakeRedisPublisher:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    async def publish(self, channel: str, message: str) -> int:
        self.messages.append((channel, message))
        return 1


def build_metric() -> EnergyMetric:
    return EnergyMetric(
        device_id=uuid.uuid4(),
        home_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        ts=datetime(2026, 7, 2, 18, 45, tzinfo=UTC),
        voltage_v=230.0,
        current_a=3.1,
        active_power_w=713.0,
        power_factor=0.94,
        energy_wh_delta=178.25,
    )


@pytest.mark.asyncio
async def test_metric_event_bus_publishes_realtime_metric_event() -> None:
    redis = FakeRedisPublisher()
    metric = build_metric()
    bus = RedisMetricEventBus(redis)

    subscriber_count = await bus.publish_metric(metric)

    assert subscriber_count == 1
    assert redis.messages[0][0] == METRIC_EVENTS_CHANNEL

    event = parse_metric_event_message(redis.messages[0][1])
    assert event.event_type == "metric.created"
    assert event.home_id == metric.home_id
    assert event.device_id == metric.device_id
    assert event.active_power_w == 713.0


def test_realtime_metric_event_parses_bytes_payload() -> None:
    metric = build_metric()
    event = RealtimeMetricEvent.from_metric(metric)

    parsed = parse_metric_event_message(event.model_dump_json().encode("utf-8"))

    assert parsed == event


def test_metric_event_filter_matches_home_and_optional_device() -> None:
    metric = build_metric()
    event = RealtimeMetricEvent.from_metric(metric)

    assert metric_event_matches_filter(event, home_id=metric.home_id, device_id=None)
    assert metric_event_matches_filter(event, home_id=metric.home_id, device_id=metric.device_id)
    assert not metric_event_matches_filter(event, home_id=uuid.uuid4(), device_id=None)
    assert not metric_event_matches_filter(event, home_id=metric.home_id, device_id=uuid.uuid4())
