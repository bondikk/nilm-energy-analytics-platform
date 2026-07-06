# ESP32 ADS1256 Monitor Firmware

Lab firmware for publishing ESP32 + ADS1256 + SCT-013-000 RMS current telemetry
to the VoltPulse MQTT ingestion pipeline.

## Hardware

- ESP32 development board
- ADS1256 ADC module
- SCT-013-000 current transformer
- Burden resistor, default `10 ohm`
- Optional isolated voltage sensing circuit

Default ADS1256 wiring:

| ADS1256 | ESP32 |
| --- | --- |
| SCK | GPIO 18 |
| DIN/MOSI | GPIO 23 |
| DOUT/MISO | GPIO 19 |
| CS | GPIO 5 |
| DRDY | GPIO 34 |
| PDWN | GPIO 27 |

Current input uses ADS1256 differential `AIN0-AIN1`. Voltage measurement is
disabled by default. The firmware uses nominal voltage from `config.h` and
publishes apparent power only.

## Configuration

Copy `secrets.example.h` to `secrets.h` and fill in local Wi-Fi and MQTT values.
Do not commit `secrets.h`.

The default topic is:

```text
voltpulse/homes/demo/devices/esp32-ads1256-01/metrics
```

Payload shape:

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

## Build

Arduino IDE:

1. Open `esp32_ads1256_monitor.ino`.
2. Install `ArduinoJson` and `PubSubClient`.
3. Copy `secrets.example.h` to `secrets.h`.
4. Select an ESP32 board and upload.

PlatformIO:

```bash
cd firmware/esp32_ads1256_monitor
cp secrets.example.h secrets.h
pio run
```

## Safety

This is a lab prototype, not a certified mains-energy meter. Use a proper
current transformer and isolated voltage sensing if voltage is measured. Do not
connect mains voltage directly to the ADS1256 or ESP32.
