import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.nilm import get_nilm_analysis, get_nilm_lab_catalog, get_nilm_lab_demo
from app.main import app
from app.services.nilm_analysis import (
    NILMDetectionConfig,
    NILMEventType,
    NILMReading,
    NILMSignature,
    analyze_load_profile,
)


def build_readings(values: list[float]) -> list[NILMReading]:
    start = datetime(2026, 7, 2, 18, 0, tzinfo=UTC)
    return [
        NILMReading(ts=start + timedelta(minutes=index), active_power_w=value)
        for index, value in enumerate(values)
    ]


def test_nilm_analysis_route_is_registered() -> None:
    home_id = uuid.uuid4()

    assert (
        str(app.url_path_for("get_nilm_analysis", home_id=home_id))
        == f"/homes/{home_id}/nilm/analysis"
    )
    assert str(app.url_path_for("get_nilm_lab_demo")) == "/nilm/lab/demo"
    assert str(app.url_path_for("get_nilm_lab_catalog")) == "/nilm/lab/catalog"


def test_nilm_analysis_detects_power_step_events() -> None:
    readings = build_readings([200, 205, 210, 850, 855, 220, 230, 1550, 1560, 240])

    analysis = analyze_load_profile(
        readings,
        config=NILMDetectionConfig(min_step_w=250, smoothing_window=1),
    )

    assert analysis.summary.sample_count == 10
    assert analysis.summary.event_count == 4
    assert analysis.summary.detected_load_w == 1960
    assert analysis.summary.largest_step_w == 1320

    first_event = analysis.events[0]
    assert first_event.event_type == NILMEventType.TURN_ON
    assert first_event.signature == NILMSignature.FLEXIBLE_APPLIANCE
    assert first_event.delta_w == 640
    assert first_event.duration_seconds == 120
    assert first_event.estimated_energy_wh == pytest.approx(21.333)

    largest_event = analysis.events[2]
    assert largest_event.event_type == NILMEventType.TURN_ON
    assert largest_event.signature == NILMSignature.HVAC_OR_HEATER
    assert largest_event.duration_seconds == 120


def test_nilm_analysis_ignores_small_noise() -> None:
    readings = build_readings([300, 326, 289, 318, 304])

    analysis = analyze_load_profile(
        readings,
        config=NILMDetectionConfig(min_step_w=80, smoothing_window=1),
    )

    assert analysis.summary.event_count == 0
    assert analysis.events == []
    assert analysis.summary.baseload_w == pytest.approx(293.4)


def test_nilm_analysis_handles_empty_readings() -> None:
    analysis = analyze_load_profile([])

    assert analysis.summary.sample_count == 0
    assert analysis.summary.baseload_w is None
    assert analysis.events == []


@pytest.mark.asyncio
async def test_nilm_analysis_rejects_inverted_time_range() -> None:
    home = SimpleNamespace(id=uuid.uuid4())
    start = datetime(2026, 7, 2, 13, 0, tzinfo=UTC)
    end = datetime(2026, 7, 2, 12, 0, tzinfo=UTC)

    with pytest.raises(HTTPException) as exc_info:
        await get_nilm_analysis(
            home=home,
            session=SimpleNamespace(),
            start=start,
            end=end,
            device_id=None,
            limit=1000,
            min_step_w=80,
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_nilm_lab_demo_returns_dataset_overlay() -> None:
    response = await get_nilm_lab_demo(
        dataset="uk-dale",
        house_id="house-1",
        appliance="kettle",
    )

    assert response.dataset == "uk-dale"
    assert response.dataset_label == "UK-DALE"
    assert response.house_id == "house-1"
    assert response.appliance == "kettle"
    assert response.appliance_label == "Kettle"
    assert response.on_threshold_w == 1000
    assert response.model_name == "threshold_step_baseline"
    assert response.sample_period_seconds == 8
    assert len(response.points) == 16
    assert response.points[4].aggregate_power_w == 2350
    assert response.points[4].actual_power_w == 2180
    assert response.points[4].predicted_power_w == 2200
    assert response.metrics.mae_w > 0
    assert response.metrics.f1_score == 1


@pytest.mark.asyncio
async def test_nilm_lab_catalog_describes_available_experiments() -> None:
    catalog = await get_nilm_lab_catalog()

    assert catalog.default_dataset == "uk-dale"
    assert catalog.default_house_id == "house-1"
    assert catalog.default_appliance == "kettle"
    assert [dataset.id for dataset in catalog.datasets] == ["uk-dale", "redd", "refit"]
    assert catalog.datasets[0].label == "UK-DALE"
    assert catalog.appliances[0].id == "kettle"
    assert catalog.appliances[0].on_threshold_w == 1000
    assert catalog.appliances[0].nominal_power_w == 2200
    assert catalog.models[0].id == "threshold_step_baseline"
    assert catalog.models[0].task == "single-appliance disaggregation"


@pytest.mark.asyncio
async def test_nilm_lab_demo_rejects_unknown_appliance() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await get_nilm_lab_demo(
            dataset="uk-dale",
            house_id="house-1",
            appliance="toaster",
        )

    assert exc_info.value.status_code == 400
