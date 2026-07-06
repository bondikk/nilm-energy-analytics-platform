# Supervisor Demo Flow

This flow shows VoltPulse as an Energy Telemetry and NILM Research Platform with two clear modes: live monitoring and dataset-backed research.

## 1. Start the stack

```bash
docker compose up --build
```

For frontend-only iteration:

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://127.0.0.1:5173`.

## 2. Seed a demo workspace

Open **Simulator** and use **Generate demo workspace**.

This creates reproducible homes, devices, historical telemetry, and event/anomaly examples for the local demo. No user-facing email or password is required on the simulator page.

## 3. Open Dashboard

Use **Dashboard** for the live monitoring overview:

- backend, MQTT, and device status context
- current power, RMS current, RMS voltage, energy, peak power, detected loads
- main signal chart with time range and signal toggles
- current load estimate from the live NILM baseline
- recent events and latest telemetry rows

When active power is missing, the UI labels the value as apparent power instead of active power.

## 4. Inspect the live signal

Open **Live NILM**.

Review:

- smoothed recent signal
- detected step events
- likely appliance estimates
- confidence values
- source signal and quality flags
- limitations of the baseline method

This is a practical online baseline, not a production NILM accuracy claim.

## 5. Review detected events

Open **Events**.

Use the event detail panel to inspect:

- anomaly alerts
- live NILM step events
- signal window around an event
- before/after power
- likely appliance
- explanation and recommended review action

## 6. Open Datasets

Use **Datasets** for the research dataset library:

- UK-DALE, REDD, and REFIT metadata
- local raw, processed, and sample paths
- file inventory
- file profile
- signal quality panel
- import guide and conversion command

Raw public datasets stay outside git. The repository only includes small samples.

## 7. Run NILM Lab analysis

Open **NILM Lab**.

Select:

- dataset
- house
- appliance
- baseline method

Press **Run analysis**.

The result includes:

- experiment summary
- aggregate vs ground truth vs prediction chart
- metrics
- detected events
- explanation and limitations
- JSON export
- markdown report export

## 8. Optional AI-assisted explanation

Use **Generate explanation** in the NILM Lab run result.

By default this returns a local fallback explanation because AI analysis is disabled. If enabled later, only compact structured summaries should be sent to a provider, never raw CSV/HDF5 data.

Environment variables:

```bash
AI_ANALYSIS_ENABLED=false
AI_PROVIDER=openai_compatible
AI_API_KEY=
AI_MODEL=
AI_BASE_URL=https://api.openai.com/v1
AI_REQUEST_TIMEOUT_SECONDS=12
```

To enable the real provider call, set `AI_ANALYSIS_ENABLED=true`, provide
`AI_API_KEY`, and choose an OpenAI-compatible chat model in `AI_MODEL`. The
backend sends only metrics, event counts, selected event examples, and
limitations; raw dataset rows are filtered out before the request.

## 9. Optional ESP32 telemetry

Connect ESP32 firmware from the hardware reference project and publish normalized MQTT telemetry to:

```text
voltpulse/demo/devices/{device_external_id}/metrics
```

The backend ingestion path is:

```text
Mosquitto -> Redis Streams -> metrics writer -> PostgreSQL/TimescaleDB -> API/WebSocket
```
