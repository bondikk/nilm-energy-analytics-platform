import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.nilm import (
    get_nilm_analysis,
    get_nilm_lab_catalog,
    get_nilm_lab_dataset,
    get_nilm_lab_dataset_download_guide,
    get_nilm_lab_dataset_files,
    get_nilm_lab_datasets,
    convert_nilm_lab_dataset,
    get_nilm_lab_demo,
    get_nilm_lab_report,
)
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
    assert str(app.url_path_for("get_nilm_lab_datasets")) == "/nilm/lab/datasets"
    assert (
        str(app.url_path_for("get_nilm_lab_dataset", dataset="uk-dale"))
        == "/nilm/lab/datasets/uk-dale"
    )
    assert (
        str(app.url_path_for("get_nilm_lab_dataset_files", dataset="uk-dale"))
        == "/nilm/lab/datasets/uk-dale/files"
    )
    assert (
        str(app.url_path_for("get_nilm_lab_dataset_profile", dataset="refit"))
        == "/nilm/lab/datasets/refit/profile"
    )
    assert (
        str(app.url_path_for("get_nilm_lab_dataset_download_guide", dataset="refit"))
        == "/nilm/lab/datasets/refit/download-guide"
    )
    assert (
        str(app.url_path_for("convert_nilm_lab_dataset", dataset="refit"))
        == "/nilm/lab/datasets/refit/convert"
    )
    assert str(app.url_path_for("get_nilm_lab_report")) == "/nilm/lab/report"


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
    assert response.source_file == "data/samples/uk_dale_house_1_sample.csv"
    assert response.sample_count == 16
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
async def test_nilm_lab_datasets_describes_scale_and_local_availability() -> None:
    inventory = await get_nilm_lab_datasets()

    assert "not committed to git" in inventory.storage_note
    assert "unified CSV schema" in inventory.ingestion_note
    assert [dataset.id for dataset in inventory.datasets] == ["uk-dale", "redd", "refit"]

    uk_dale = inventory.datasets[0]
    assert uk_dale.label == "UK-DALE"
    assert uk_dale.name == "UK-DALE"
    assert uk_dale.houses == 5
    assert uk_dale.supported_houses[0] == "house-1"
    assert "kettle" in uk_dale.appliances
    assert "jack-kelly.com" in uk_dale.official_url
    assert "redistributing raw files" in uk_dale.license_access_notes
    assert uk_dale.sample_path == "data/samples/uk_dale_house_1_sample.csv"
    assert uk_dale.sample_available is True
    assert uk_dale.raw_path == "data/raw/uk-dale/"
    assert uk_dale.processed_path == "data/processed/uk_dale_house_1.csv"
    assert uk_dale.status == "first-class target"
    assert isinstance(uk_dale.raw_file_count, int)
    assert uk_dale.raw_total_bytes is None or uk_dale.raw_total_bytes >= 0
    assert isinstance(uk_dale.raw_files, list)
    assert isinstance(uk_dale.processed_files, list)
    assert "convert_uk_dale" in uk_dale.import_command
    assert uk_dale.limitations
    assert uk_dale.safe_to_convert_locally is True

    refit = inventory.datasets[2]
    assert refit.houses == 20
    assert refit.status == "loader scaffold"
    assert refit.safe_to_convert_locally is False


@pytest.mark.asyncio
async def test_nilm_lab_dataset_detail_files_guide_and_convert() -> None:
    dataset = await get_nilm_lab_dataset("uk-dale")
    files = await get_nilm_lab_dataset_files("uk-dale")
    guide = await get_nilm_lab_dataset_download_guide("uk-dale")
    conversion = await convert_nilm_lab_dataset("redd")

    assert dataset.id == "uk-dale"
    assert files.dataset == "uk-dale"
    assert files.file_count >= 1
    assert any(file.storage_area == "sample" for file in files.files)
    assert guide.dataset == "uk-dale"
    assert guide.instructions
    assert "data/raw/uk-dale/" in guide.raw_path
    assert conversion.dataset == "redd"
    assert conversion.executed is False
    assert conversion.status == "manual_only"


@pytest.mark.asyncio
async def test_nilm_lab_report_returns_reproducible_markdown() -> None:
    report = await get_nilm_lab_report(
        dataset="uk-dale",
        house_id="house-1",
        appliance="kettle",
    )

    assert report.dataset == "uk-dale"
    assert report.house_id == "house-1"
    assert report.appliance == "kettle"
    assert report.model_name == "threshold_step_baseline"
    assert "# NILM Experiment Report" in report.markdown
    assert "- Dataset: UK-DALE" in report.markdown
    assert "- Appliance: Kettle" in report.markdown
    assert "- Source file: `data/samples/uk_dale_house_1_sample.csv`" in report.markdown
    assert "- Samples: 16" in report.markdown
    assert "## Limitations" in report.markdown


@pytest.mark.asyncio
async def test_nilm_lab_demo_rejects_unknown_appliance() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await get_nilm_lab_demo(
            dataset="uk-dale",
            house_id="house-1",
            appliance="toaster",
        )

    assert exc_info.value.status_code == 400
