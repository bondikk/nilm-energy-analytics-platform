from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from app.ml.datasets.schema import read_unified_nilm_csv
from app.ml.evaluation.reports import NILMEvaluationReport, build_evaluation_report
from app.ml.models.baseline_threshold import (
    predict_appliance_power_threshold,
    prediction_series_for_appliance,
)
from app.ml.preprocessing.labeling import DEFAULT_ON_THRESHOLDS_W


def evaluate_threshold_baseline(path: Path, appliance: str) -> NILMEvaluationReport:
    dataset = read_unified_nilm_csv(path)
    predictions = predict_appliance_power_threshold(dataset.rows)
    predicted_power_w = prediction_series_for_appliance(predictions, appliance)
    actual_power_w = tuple(row.appliance_power_w.get(appliance, 0.0) for row in dataset.rows)

    return build_evaluation_report(
        appliance=appliance,
        actual_power_w=actual_power_w,
        predicted_power_w=predicted_power_w,
        on_threshold_w=DEFAULT_ON_THRESHOLDS_W.get(appliance, 10.0),
        generated_at=datetime.now(UTC),
    )
