# ⚡ VoltPulse Analytics: Cloud-Native NILM & Energy Analytics Platform

VoltPulse Analytics is a FastAPI-based NILM and energy analytics backend with
PostgreSQL/TimescaleDB, Redis, Mosquitto, authentication, homes, devices,
energy metrics, anomalies, and basic analytics summary endpoints.

## Run Locally

Start the full local stack:

```bash
docker compose up --build
```

Open the API docs:

```text
http://127.0.0.1:8000/docs
```

## Seed Demo Data

After the containers are running and migrations have completed, seed a demo
account, home, smart meter, energy metrics, and one anomaly:

```bash
docker compose exec backend python -m app.tools.seed_demo_data
```

Default demo credentials:

```text
email: demo@voltpulse.local
password: demo-password
```

You can customize the generated series:

```bash
docker compose exec backend python -m app.tools.seed_demo_data \
  --sample-count 192 \
  --interval-minutes 15
```

## Local Checks

Run tests:

```bash
PYTHONPATH=backend .venv/bin/python -m pytest -q
```

Run linting:

```bash
PYTHONPATH=backend .venv/bin/python -m ruff check backend tests
```

Run type checks:

```bash
cd backend
../.venv/bin/python -m mypy app
```

## API Areas

- `auth`: registration and login
- `users`: current user profile
- `homes`: home management
- `devices`: devices per home
- `energy-metrics`: readings per device
- `anomalies`: anomaly management per home
- `analytics`: energy summary per home
