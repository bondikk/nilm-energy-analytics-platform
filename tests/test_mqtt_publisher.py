import pytest

from app.services.mqtt_publisher import build_disconnect_packet, build_metric_topic, build_publish_packet


def test_build_metric_topic_uses_demo_device_path() -> None:
    assert (
        build_metric_topic("demo-main-meter")
        == "voltpulse/demo/devices/demo-main-meter/metrics"
    )


def test_build_metric_topic_rejects_mqtt_wildcards() -> None:
    with pytest.raises(ValueError):
        build_metric_topic("bad/#")


def test_build_publish_packet_contains_topic_and_payload() -> None:
    packet = build_publish_packet(
        topic="voltpulse/demo/devices/demo-main-meter/metrics",
        payload=b'{"active_power_w":713}',
    )

    assert packet[0] == 0x30
    assert b"voltpulse/demo/devices/demo-main-meter/metrics" in packet
    assert packet.endswith(b'{"active_power_w":713}')


def test_build_disconnect_packet_is_mqtt_disconnect() -> None:
    assert build_disconnect_packet() == b"\xe0\x00"
