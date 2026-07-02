from app.services.mqtt_consumer import build_connect_packet, build_subscribe_packet, encode_remaining_length


def test_encode_remaining_length_uses_mqtt_variable_length_format() -> None:
    assert encode_remaining_length(127) == b"\x7f"
    assert encode_remaining_length(128) == b"\x80\x01"


def test_build_connect_packet_contains_client_and_credentials() -> None:
    packet = build_connect_packet(
        client_id="client-1",
        username="user",
        password="password",
    )

    assert packet[0] == 0x10
    assert b"MQTT" in packet
    assert b"client-1" in packet
    assert b"user" in packet
    assert b"password" in packet


def test_build_subscribe_packet_contains_topic_filter() -> None:
    packet = build_subscribe_packet(
        packet_id=7,
        topic="voltpulse/+/devices/+/metrics",
    )

    assert packet[0] == 0x82
    assert b"voltpulse/+/devices/+/metrics" in packet
    assert packet.endswith(b"\x00")
