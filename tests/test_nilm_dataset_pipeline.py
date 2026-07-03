from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.ml.datasets.schema import UnifiedNILMRow, read_unified_nilm_csv, write_unified_nilm_csv
from app.ml.datasets.uk_dale_loader import UKDaleHouseConfig, load_uk_dale_house
from app.ml.evaluation.metrics import classification_metrics, regression_metrics
from app.ml.evaluation.reports import build_evaluation_report
from app.ml.models.baseline_threshold import (
    extract_window_features,
    predict_appliance_power_threshold,
    prediction_series_for_appliance,
)
from app.ml.preprocessing.windowing import build_seq2point_windows


def build_rows() -> tuple[UnifiedNILMRow, ...]:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    aggregate_values = (145.0, 265.0, 2_465.0, 265.0, 145.0)
    kettle_values = (0.0, 0.0, 2_200.0, 0.0, 0.0)
    fridge_values = (0.0, 120.0, 120.0, 120.0, 0.0)

    return tuple(
        UnifiedNILMRow(
            timestamp=start + timedelta(seconds=index * 8),
            aggregate_power_w=aggregate,
            appliance_power_w={
                "fridge": fridge_values[index],
                "kettle": kettle_values[index],
                "washing_machine": 0.0,
            },
        )
        for index, aggregate in enumerate(aggregate_values)
    )


def test_unified_nilm_csv_roundtrip(tmp_path: Path) -> None:
    output_path = tmp_path / "sample.csv"

    written = write_unified_nilm_csv(
        build_rows(),
        output_path,
        appliances=("fridge", "kettle", "washing_machine"),
    )
    dataset = read_unified_nilm_csv(output_path)

    assert written == 5
    assert dataset.sample_count == 5
    assert dataset.appliances == ("fridge", "kettle", "washing_machine")
    assert dataset.rows[1].appliance_power_w["fridge"] == 120
    assert dataset.rows[2].appliance_power_w["kettle"] == 2_200


def test_uk_dale_loader_aligns_channels_by_timestamp(tmp_path: Path) -> None:
    house_dir = tmp_path / "house_1"
    house_dir.mkdir()
    (house_dir / "mains.dat").write_text(
        "1704110400 150\n1704110406 2300\n1704110412 160\n",
        encoding="utf-8",
    )
    (house_dir / "channel_10.dat").write_text(
        "1704110406 2150\n",
        encoding="utf-8",
    )
    (house_dir / "channel_12.dat").write_text(
        "1704110400 120\n1704110406 120\n1704110412 0\n",
        encoding="utf-8",
    )

    dataset = load_uk_dale_house(
        house_dir,
        config=UKDaleHouseConfig(
            house_id=1,
            aggregate_channel=None,
            appliance_channels={"kettle": 10, "fridge": 12},
        ),
    )

    assert dataset.source == "UK-DALE"
    assert dataset.appliances == ("kettle", "fridge")
    assert dataset.rows[0].aggregate_power_w == 150
    assert dataset.rows[1].appliance_power_w["kettle"] == 2_150
    assert dataset.rows[2].appliance_power_w["fridge"] == 0


def test_seq2point_window_uses_center_appliance_power() -> None:
    windows = build_seq2point_windows(build_rows(), appliance="kettle", radius=1)

    assert len(windows) == 3
    assert windows[1].aggregate_window_w == (265.0, 2_465.0, 265.0)
    assert windows[1].target_power_w == 2_200
    assert windows[1].center_timestamp == build_rows()[2].timestamp


def test_threshold_baseline_predicts_kettle_series() -> None:
    predictions = predict_appliance_power_threshold(build_rows())
    kettle = prediction_series_for_appliance(predictions, "kettle")

    assert kettle == (0.0, 0.0, 2_200.0, 0.0, 0.0)
    assert predictions["kettle"][2].is_on is True
    assert predictions["kettle"][2].reason == "turn-on step matched kettle power range"


def test_window_feature_extraction_supports_ml_baselines() -> None:
    features = extract_window_features((100.0, 140.0, 220.0))

    assert features["mean_power"] == pytest.approx(153.333333)
    assert features["max_power"] == 220
    assert features["min_power"] == 100
    assert features["delta_power"] == 120


def test_nilm_metrics_and_report() -> None:
    actual = (0.0, 120.0, 2_200.0, 0.0)
    predicted = (0.0, 100.0, 2_200.0, 0.0)

    regression = regression_metrics(actual, predicted)
    classification = classification_metrics((0, 1, 1, 0), (0, 1, 1, 0))
    report = build_evaluation_report(
        appliance="kettle",
        actual_power_w=actual,
        predicted_power_w=predicted,
        on_threshold_w=1_000,
        generated_at=datetime(2026, 1, 1, 12, 0, tzinfo=UTC),
    )

    assert regression.mae_w == 5
    assert classification.f1_score == 1
    assert report.regression.mae_w == 5
    assert "- F1-score: 1.0" in report.to_markdown()
