from datetime import UTC, datetime, timedelta

import pytest

from app.services.demo_data import build_demo_metric_samples
from app.tools.seed_demo_data import parse_start_at


def test_build_demo_metric_samples_creates_expected_interval_series() -> None:
    start_at = datetime(2026, 7, 2, 0, 0, tzinfo=UTC)

    samples = build_demo_metric_samples(
        start_at=start_at,
        sample_count=4,
        interval_minutes=15,
    )

    assert len(samples) == 4
    assert samples[0].ts == start_at
    assert samples[1].ts == start_at + timedelta(minutes=15)
    assert all(sample.voltage_v >= 0 for sample in samples)
    assert all(sample.current_a >= 0 for sample in samples)
    assert all(-1 <= sample.power_factor <= 1 for sample in samples)
    assert all(sample.energy_wh_delta > 0 for sample in samples)


def test_build_demo_metric_samples_rejects_naive_start() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        build_demo_metric_samples(
            start_at=datetime(2026, 7, 2, 0, 0),
            sample_count=4,
        )


def test_build_demo_metric_samples_rejects_empty_count() -> None:
    with pytest.raises(ValueError, match="sample_count"):
        build_demo_metric_samples(
            start_at=datetime(2026, 7, 2, 0, 0, tzinfo=UTC),
            sample_count=0,
        )


def test_parse_start_at_accepts_z_suffix() -> None:
    assert parse_start_at("2026-07-02T12:00:00Z") == datetime(
        2026,
        7,
        2,
        12,
        0,
        tzinfo=UTC,
    )


def test_parse_start_at_assumes_utc_for_naive_values() -> None:
    assert parse_start_at("2026-07-02T12:00:00") == datetime(
        2026,
        7,
        2,
        12,
        0,
        tzinfo=UTC,
    )
