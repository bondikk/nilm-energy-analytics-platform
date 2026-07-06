# ESP32 ADS1256 Hardware Prototype

VoltPulse includes lab firmware for an ESP32 + ADS1256 measurement node. It is
intended for engineering experiments with local MQTT ingestion, not billing or
certified mains metering.

## Measurement Node

Target folder:

```text
firmware/esp32_ads1256_monitor/
```

Main components:

- ESP32 development board
- ADS1256 ADC module
- SCT-013-000 current transformer
- Burden resistor, default `10 ohm`
- Optional isolated voltage sensing circuit

Voltage measurement is currently a fallback/stub unless a real isolated voltage
front end is added and calibrated. With only current RMS and nominal voltage,
the firmware publishes apparent power, not active power.

## ADS1256 Pin Mapping

| ADS1256 | ESP32 |
| --- | --- |
| SCK | GPIO 18 |
| DIN/MOSI | GPIO 23 |
| DOUT/MISO | GPIO 19 |
| CS | GPIO 5 |
| DRDY | GPIO 34 |
| PDWN | GPIO 27 |

Current input uses differential `AIN0-AIN1` by default. Hardware constants and
calibration values live in `firmware/esp32_ads1256_monitor/config.h`.

## MQTT Topic

Preferred integrated topic:

```text
voltpulse/homes/demo/devices/esp32-ads1256-01/metrics
```

The backend subscribes to:

```text
voltpulse/+/devices/+/metrics
```

The topic can be changed in `secrets.h` for firmware and `MQTT_METRICS_TOPIC`
for the backend.

## JSON Telemetry Schema

Normalized payload:

```json
{
  "ts": "2026-07-06T10:00:00Z",
  "device_external_id": "esp32-ads1256-01",
  "current_a": 0.42,
  "voltage_v": 230.0,
  "apparent_power_va": 96.6,
  "active_power_w": null,
  "power_factor": null,
  "frequency_hz": 50.0,
  "raw_payload": {
    "source": "esp32_ads1256",
    "sample_rate": 1000,
    "firmware_version": "0.1.0",
    "voltage_fallback": true
  }
}
```

The backend also accepts the legacy reference firmware shape:

```json
{
  "device_id": "esp32-01",
  "timestamp": "2026-07-06T10:00:00Z",
  "i_rms": 0.42,
  "v_rms": 230.0,
  "s_est_va": 96.6,
  "sample_rate": 1000,
  "source": "esp32_ads1256"
}
```

Legacy fields are normalized before strict validation and the original payload
is preserved in `raw_payload`.

## Local Network Setup

1. Start the local platform:

```bash
docker compose up --build
```

2. Copy firmware secrets:

```bash
cd firmware/esp32_ads1256_monitor
cp secrets.example.h secrets.h
```

3. Set `MQTT_HOST` to the machine or Docker host reachable from the ESP32.
4. Keep `MQTT_USERNAME` and `MQTT_PASSWORD` aligned with `.env`.
5. Flash through Arduino IDE or PlatformIO.

PlatformIO build command:

```bash
cd firmware/esp32_ads1256_monitor
pio run
```

This repository does not claim firmware flashing was tested on physical
hardware during automated checks.

## Backend Ingestion Path

ESP32 MQTT messages flow through:

```text
MQTT -> MQTT consumer -> Redis Stream -> metrics writer -> PostgreSQL/TimescaleDB -> API -> WebSocket -> React dashboard
```

In local/demo mode the metrics writer can auto-create an unknown
`device_external_id` under the configured demo home so valid lab messages are
not silently dropped. Disable this with:

```text
INGESTION_AUTO_CREATE_DEMO_DEVICES=false
```

## Safety Limits

- This is a lab prototype, not a certified mains-energy meter.
- Do not connect mains voltage directly to the ESP32 or ADS1256.
- Use properly rated current transformers and isolated voltage sensing.
- Apparent power from nominal voltage is not active power and is not suitable
  for billing.
- Calibration constants must be validated with known loads before any research
  conclusions are drawn.
