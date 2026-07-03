from __future__ import annotations

from pathlib import Path

from app.ml.datasets.schema import read_unified_nilm_csv
from app.ml.models.baseline_threshold import predict_appliance_power_threshold


def train_baseline_from_unified_csv(path: Path) -> dict[str, int]:
    dataset = read_unified_nilm_csv(path)
    predictions = predict_appliance_power_threshold(dataset.rows)
    return {appliance: len(series) for appliance, series in predictions.items()}
