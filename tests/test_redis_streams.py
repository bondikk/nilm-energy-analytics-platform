from datetime import UTC, datetime

import pytest

from app.schemas.ingestion import IngestionMetricPayload
from app.services.redis_streams import RedisMetricStream, parse_stream_response


class FakeRedisStreamConnection:
    def __init__(self) -> None:
        self.fields: dict[str, str] | None = None
        self.acked: tuple[str, ...] = ()
        self.group_created = False

    async def xadd(
        self,
        name: str,
        fields: dict[str, str],
        maxlen: int | None = None,
        approximate: bool = True,
    ) -> bytes:
        self.fields = fields
        return b"1-0"

    async def xgroup_create(
        self,
        name: str,
        groupname: str,
        id: str = "$",
        mkstream: bool = False,
    ) -> object:
        self.group_created = True
        return True

    async def xreadgroup(
        self,
        groupname: str,
        consumername: str,
        streams: dict[str, str],
        count: int | None = None,
        block: int | None = None,
    ) -> object:
        assert self.fields is not None
        return [(b"voltpulse.metrics.ingest", [(b"1-0", self.fields)])]

    async def xack(self, name: str, groupname: str, *ids: str) -> int:
        self.acked = ids
        return len(ids)


@pytest.mark.asyncio
async def test_redis_metric_stream_publishes_reads_and_acks_payload() -> None:
    redis = FakeRedisStreamConnection()
    stream = RedisMetricStream(redis)
    payload = IngestionMetricPayload(
        ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        device_external_id="demo-main-meter",
        active_power_w=540.0,
    )

    message_id = await stream.publish_metric(payload)
    messages = await stream.read_metric_batch("writer-1")
    acked = await stream.acknowledge(message_id)

    assert message_id == "1-0"
    assert messages[0].payload.active_power_w == 540.0
    assert acked == 1
    assert redis.acked == ("1-0",)


def test_parse_stream_response_handles_bytes_payload() -> None:
    payload = IngestionMetricPayload(
        ts=datetime(2026, 7, 2, 12, 0, tzinfo=UTC),
        device_external_id="demo-main-meter",
    )
    fields = {key: value.encode("utf-8") for key, value in payload.to_stream_fields().items()}

    messages = parse_stream_response([(b"stream", [(b"2-0", fields)])])

    assert messages[0].stream_id == "2-0"
    assert messages[0].payload.device_external_id == "demo-main-meter"
