from collections.abc import Mapping, Sequence
from typing import Protocol, cast

from redis.exceptions import ResponseError

from app.core.config import settings
from app.schemas.ingestion import IngestionMetricPayload, IngestionStreamMessage


METRICS_STREAM = "voltpulse.metrics.ingest"
METRICS_CONSUMER_GROUP = "metrics-writers"


class RedisStreamConnection(Protocol):
    async def xadd(
        self,
        name: str,
        fields: Mapping[str, str],
        maxlen: int | None = None,
        approximate: bool = True,
    ) -> bytes | str: ...

    async def xgroup_create(
        self,
        name: str,
        groupname: str,
        id: str = "$",
        mkstream: bool = False,
    ) -> object: ...

    async def xreadgroup(
        self,
        groupname: str,
        consumername: str,
        streams: Mapping[str, str],
        count: int | None = None,
        block: int | None = None,
    ) -> object: ...

    async def xack(self, name: str, groupname: str, *ids: str) -> int: ...


class RedisMetricStream:
    def __init__(
        self,
        redis: RedisStreamConnection,
        stream_name: str = METRICS_STREAM,
        group_name: str = METRICS_CONSUMER_GROUP,
    ) -> None:
        self.redis = redis
        self.stream_name = stream_name
        self.group_name = group_name

    async def ensure_group(self) -> None:
        try:
            await self.redis.xgroup_create(
                name=self.stream_name,
                groupname=self.group_name,
                id="0",
                mkstream=True,
            )
        except ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    async def publish_metric(
        self,
        payload: IngestionMetricPayload,
        maxlen: int | None = 100_000,
    ) -> str:
        message_id = await self.redis.xadd(
            self.stream_name,
            payload.to_stream_fields(),
            maxlen=maxlen,
            approximate=True,
        )
        return _to_text(message_id)

    async def read_metric_batch(
        self,
        consumer_name: str,
        count: int = 100,
        block_ms: int = 1_000,
    ) -> list[IngestionStreamMessage]:
        raw_response = await self.redis.xreadgroup(
            groupname=self.group_name,
            consumername=consumer_name,
            streams={self.stream_name: ">"},
            count=count,
            block=block_ms,
        )
        return parse_stream_response(raw_response)

    async def acknowledge(self, *message_ids: str) -> int:
        if not message_ids:
            return 0
        return await self.redis.xack(self.stream_name, self.group_name, *message_ids)


def parse_stream_response(raw_response: object) -> list[IngestionStreamMessage]:
    messages: list[IngestionStreamMessage] = []
    streams = cast(Sequence[tuple[bytes | str, Sequence[tuple[bytes | str, dict[bytes | str, bytes | str]]]]], raw_response)

    for _stream_name, stream_messages in streams:
        for message_id, fields in stream_messages:
            messages.append(
                IngestionStreamMessage(
                    stream_id=_to_text(message_id),
                    payload=IngestionMetricPayload.from_stream_fields(_normalize_fields(fields)),
                )
            )

    return messages


def build_redis_url() -> str:
    return settings.redis_url


def _to_text(value: bytes | str) -> str:
    return value.decode("utf-8") if isinstance(value, bytes) else value


def _normalize_fields(fields: dict[bytes | str, bytes | str]) -> dict[str, bytes | str]:
    return {_to_text(key): value for key, value in fields.items()}
