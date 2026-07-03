import asyncio
import contextlib

from app.core.config import settings
from app.services.mqtt_consumer import build_connect_packet, encode_remaining_length, encode_utf8, read_connack


MQTT_PUBLISH = 0x30
MQTT_DISCONNECT = 0xE0


class MQTTMetricPublisher:
    def __init__(
        self,
        host: str = settings.mqtt_host,
        port: int = settings.mqtt_port,
        username: str = settings.mqtt_username,
        password: str = settings.mqtt_password.get_secret_value(),
        client_id: str = "voltpulse-live-simulator",
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.client_id = client_id

    async def publish_metric(self, topic: str, payload: bytes | str) -> None:
        raw_payload = payload.encode("utf-8") if isinstance(payload, str) else payload
        reader, writer = await asyncio.open_connection(self.host, self.port)
        try:
            writer.write(build_connect_packet(self.client_id, self.username, self.password))
            await writer.drain()
            await read_connack(reader)

            writer.write(build_publish_packet(topic, raw_payload))
            writer.write(build_disconnect_packet())
            await writer.drain()
        finally:
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()


def build_metric_topic(device_external_id: str) -> str:
    normalized_external_id = device_external_id.strip()
    if not normalized_external_id:
        raise ValueError("device_external_id must not be blank")
    if "+" in normalized_external_id or "#" in normalized_external_id:
        raise ValueError("device_external_id must not contain MQTT wildcards")
    return f"voltpulse/demo/devices/{normalized_external_id}/metrics"


def build_publish_packet(topic: str, payload: bytes) -> bytes:
    variable_header = encode_utf8(topic)
    remaining = variable_header + payload
    return bytes([MQTT_PUBLISH]) + encode_remaining_length(len(remaining)) + remaining


def build_disconnect_packet() -> bytes:
    return bytes([MQTT_DISCONNECT, 0])
