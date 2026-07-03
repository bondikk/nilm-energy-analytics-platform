# Diploma And Commercialization Path

VoltPulse can be framed as both a diploma-grade engineering project and a future
commercial NILM platform.

## Diploma Direction

Suggested thesis title:

```text
Cloud-Native Platform for Non-Intrusive Load Monitoring Based on Public Energy Datasets
```

Core research question:

```text
How can aggregate household power be converted into appliance-level consumption estimates using a reproducible cloud-native NILM pipeline?
```

Minimum thesis evidence:

- dataset conversion into a unified schema
- dataset-backed NILM Lab sample
- baseline NILM model
- reproducible experiment reports
- evaluation against appliance-level ground truth
- dashboard visualization of aggregate, real appliance, and predicted appliance power

## Commercial Direction

Commercially, VoltPulse should become a platform that explains energy usage at
appliance level without requiring per-appliance sensors.

Potential product modules:

- smart-meter telemetry ingestion
- appliance-level disaggregation
- anomaly detection
- user recommendations
- model audit reports
- energy-saving planner

## Product Guardrails

- Keep baseline and ML model metrics visible.
- Never present demo NILM as production-grade inference.
- Store model metadata and limitations with every report.
- Separate public dataset experiments from real customer telemetry.
- Make every recommendation traceable to a signal, model, and metric.

## Next Engineering Milestones

1. Add persisted experiment run records.
2. Add train/test split support.
3. Add Random Forest on/off classifier.
4. Add Seq2Point CNN prototype.
5. Add user-facing recommendations based on predicted appliance consumption.
