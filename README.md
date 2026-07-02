# ⚡ VoltPulse Analytics: Cloud-Native NILM & Energy Analytics Platform

VoltPulse Analytics is a FastAPI-based NILM and energy analytics backend with
PostgreSQL/TimescaleDB, Redis, Mosquitto, authentication, homes, devices,
energy metrics, anomalies, demo data seeding, and analytics summary endpoints.

## Run Locally

Start the full local stack:

```bash
docker compose up --build
```

Open the API docs:

```text
http://127.0.0.1:8000/docs
```

Start the static dashboard in another terminal:

```bash
.venv/bin/python -m http.server 5173 --bind 127.0.0.1 --directory frontend
```

Open the dashboard:

```text
http://127.0.0.1:5173
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

The dashboard also includes a `Simulator` view that calls `POST /demo/seed`
from the browser in local environments.

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
- `demo`: local demo data seeding

## Dashboard

The static dashboard in `frontend/` connects to the local backend at
`http://127.0.0.1:8000`.

Dashboard views:

- `Overview`: KPI tiles, active power chart, and operational status
- `Homes`: home creation and portfolio table
- `Devices`: device creation and device table
- `Analytics`: larger load profile chart, latest readings, and CSV export
- `Anomalies`: filtering and acknowledge/resolve actions
- `Simulator`: browser-triggered demo data generation
- `Settings`: runtime details and local commands
