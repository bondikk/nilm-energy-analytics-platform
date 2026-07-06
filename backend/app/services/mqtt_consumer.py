import asyncio
import contextlib
from dataclasses import dataclass

from redis.asyncio import Redis
import structlog

from app.core.config import settings
from app.schemas.ingestion import parse_ingestion_payload
from app.services.redis_streams import RedisMetricStream, build_redis_url


MQTT_CONNECT = 0x10
MQTT_CONNACK = 0x20
MQTT_PUBLISH = 0x30
MQTT_SUBSCRIBE = 0x82

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class MQTTPublishPacket:
    topic: str
    payload: bytes


class MQTTMetricConsumer:
    def __init__(
        self,
        stream: RedisMetricStream,
        host: str = settings.mqtt_host,
        port: int = settings.mqtt_port,
        topic: str = settings.mqtt_metrics_topic,
        username: str = settings.mqtt_username,
        password: str = settings.mqtt_password.get_secret_value(),
        client_id: str = "voltpulse-mqtt-consumer",
    ) -> None:
        self.stream = stream
        self.host = host
        self.port = port
        self.topic = topic
        self.username = username
        self.password = password
        self.client_id = client_id

    async def run_forever(self, reconnect_delay_seconds: float = 2.0) -> None:
        await self.stream.ensure_group()
        while True:
            try:
                await self.consume_once()
            except asyncio.CancelledError:
                raise
            except OSError:
                await asyncio.sleep(reconnect_delay_seconds)

    async def consume_once(self) -> None:
        reader, writer = await asyncio.open_connection(self.host, self.port)
        try:
            writer.write(build_connect_packet(self.client_id, self.username, self.password))
            await writer.drain()
            await read_connack(reader)

            writer.write(build_subscribe_packet(packet_id=1, topic=self.topic))
            await writer.drain()

            while True:
                packet = await read_publish_packet(reader)
                try:
                    payload = parse_ingestion_payload(packet.payload)
                except ValueError as exc:
                    logger.warning(
                        "mqtt_ingestion_payload_rejected",
                        topic=packet.topic,
                        error=str(exc),
                    )
                    continue
                await self.stream.publish_metric(payload)
        finally:
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()


def build_connect_packet(client_id: str, username: str, password: str, keepalive: int = 60) -> bytes:
    flags = 0b0000_0010
    payload = encode_utf8(client_id)
    if username:
        flags |= 0b1000_0000
        payload += encode_utf8(username)
    if password:
        flags |= 0b0100_0000
        payload += encode_utf8(password)

    variable_header = encode_utf8("MQTT") + bytes([4, flags]) + keepalive.to_bytes(2, "big")
    remaining = variable_header + payload
    return bytes([MQTT_CONNECT]) + encode_remaining_length(len(remaining)) + remaining


def build_subscribe_packet(packet_id: int, topic: str) -> bytes:
    variable_header = packet_id.to_bytes(2, "big")
    payload = encode_utf8(topic) + b"\x00"
    remaining = variable_header + payload
    return bytes([MQTT_SUBSCRIBE]) + encode_remaining_length(len(remaining)) + remaining


async def read_connack(reader: asyncio.StreamReader) -> None:
    packet_type, payload = await read_mqtt_packet(reader)
    if packet_type != MQTT_CONNACK or len(payload) != 2 or payload[1] != 0:
        raise ConnectionError("MQTT broker rejected connection")


async def read_publish_packet(reader: asyncio.StreamReader) -> MQTTPublishPacket:
    while True:
        packet_type, payload = await read_mqtt_packet(reader)
        if packet_type & 0xF0 != MQTT_PUBLISH:
            continue

        topic_length = int.from_bytes(payload[:2], "big")
        topic_start = 2
        topic_end = topic_start + topic_length
        topic = payload[topic_start:topic_end].decode("utf-8")
        qos = (packet_type & 0b0000_0110) >> 1
        payload_start = topic_end + (2 if qos else 0)
        return MQTTPublishPacket(topic=topic, payload=payload[payload_start:])


async def read_mqtt_packet(reader: asyncio.StreamReader) -> tuple[int, bytes]:
    fixed_header = await reader.readexactly(1)
    packet_type = fixed_header[0]
    remaining_length = await read_remaining_length(reader)
    payload = await reader.readexactly(remaining_length)
    return packet_type, payload


async def read_remaining_length(reader: asyncio.StreamReader) -> int:
    multiplier = 1
    value = 0
    while True:
        encoded_byte = (await reader.readexactly(1))[0]
        value += (encoded_byte & 127) * multiplier
        if encoded_byte & 128 == 0:
            return value
        multiplier *= 128
        if multiplier > 128**3:
            raise ValueError("malformed MQTT remaining length")


def encode_utf8(value: str) -> bytes:
    encoded = value.encode("utf-8")
    return len(encoded).to_bytes(2, "big") + encoded


def encode_remaining_length(length: int) -> bytes:
    encoded = bytearray()
    while True:
        digit = length % 128
        length //= 128
        if length > 0:
            digit |= 128
        encoded.append(digit)
        if length == 0:
            return bytes(encoded)


async def main() -> None:
    redis = Redis.from_url(build_redis_url(), decode_responses=False)
    stream = RedisMetricStream(redis)
    consumer = MQTTMetricConsumer(stream)
    await consumer.run_forever()


if __name__ == "__main__":
    asyncio.run(main())
