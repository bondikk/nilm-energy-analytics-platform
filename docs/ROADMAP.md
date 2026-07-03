# VoltPulse NILM Platform Roadmap

VoltPulse is evolving from a smart-meter telemetry dashboard into a dataset-based
NILM platform.

## Layer 1: Dataset Layer

Implemented:

- unified NILM row schema
- unified CSV read/write helpers
- UK-DALE low-frequency channel loader
- REDD low-frequency loader scaffold
- REFIT CSV loader scaffold
- `data/raw`, `data/processed`, and `data/samples` directories

Next:

- add full UK-DALE house/channel maps
- add conversion CLI commands
- add processed sample files for demos
- store conversion metadata

## Layer 2: NILM ML Layer

Implemented:

- sequence-to-point window builder
- standard normalization helper
- appliance on/off labels
- threshold step-change baseline
- ML feature extraction helper
- regression and classification metrics
- Markdown evaluation reports

Next:

- Random Forest on/off classifier
- logistic regression baseline
- XGBoost experiment
- Seq2Point CNN prototype
- train/evaluate CLI commands

## Layer 3: Platform Layer

Implemented before this roadmap:

- FastAPI backend
- TimescaleDB-backed energy metrics
- MQTT/Redis ingestion
- NILM signal analysis endpoint
- anomaly workflow
- static dashboard

Next:

- `NILM Lab` dashboard view
- API endpoints for processed dataset metadata
- API endpoint for baseline evaluation reports
- prediction overlay chart
- model artifact registry

## Non-Goals For The MVP

- production real-time NILM guarantees
- commercial billing
- five dataset integrations at once
- complex LSTM/CNN models before a baseline is measurable
- frontend framework rewrite
