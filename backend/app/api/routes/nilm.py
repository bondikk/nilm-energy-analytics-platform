import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.homes import get_current_user_home
from app.infrastructure.database.models.device import Device
from app.infrastructure.database.models.energy_metric import EnergyMetric
from app.infrastructure.database.models.home import Home
from app.infrastructure.database.session import get_db_session
from app.ml.datasets.lab_demo import (
    LAB_APPLIANCE_LABELS,
    LAB_APPLIANCE_NOMINAL_POWER_W,
    LAB_DATASET_DESCRIPTIONS,
    LAB_DATASET_LABELS,
    LAB_DATASET_METADATA,
    PROJECT_LAB_SAMPLE_PATH,
    SUPPORTED_LAB_APPLIANCES,
    SUPPORTED_LAB_DATASETS,
    SUPPORTED_LAB_HOUSES,
    build_lab_demo_rows,
    project_path_has_data,
    project_path_exists,
)
from app.ml.evaluation.reports import build_evaluation_report
from app.ml.models.baseline_threshold import (
    predict_appliance_power_threshold,
    prediction_series_for_appliance,
)
from app.ml.preprocessing.labeling import DEFAULT_ON_THRESHOLDS_W
from app.schemas.nilm import (
    NILMAnalysisRead,
    NILMLabApplianceRead,
    NILMLabCatalogRead,
    NILMLabDatasetInventoryItemRead,
    NILMLabDatasetRead,
    NILMLabDatasetsRead,
    NILMLabDemoRead,
    NILMLabHouseRead,
    NILMLabMetricsRead,
    NILMLabModelRead,
    NILMLabPointRead,
    NILMLabReportRead,
)
from app.services.nilm_analysis import NILMDetectionConfig, NILMReading, analyze_load_profile


router = APIRouter(prefix="/homes/{home_id}/nilm", tags=["nilm"])
lab_router = APIRouter(prefix="/nilm/lab", tags=["nilm"])


async def validate_nilm_device_scope(
    device_id: uuid.UUID,
    home_id: uuid.UUID,
    session: AsyncSession,
) -> None:
    existing_device_id = await session.scalar(
        select(Device.id).where(
            Device.id == device_id,
            Device.home_id == home_id,
        )
    )
    if existing_device_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found",
        )


@router.get("/analysis", response_model=NILMAnalysisRead)
async def get_nilm_analysis(
    home: Annotated[Home, Depends(get_current_user_home)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    start: Annotated[datetime | None, Query()] = None,
    end: Annotated[datetime | None, Query()] = None,
    device_id: uuid.UUID | None = None,
    limit: Annotated[int, Query(ge=2, le=5000)] = 1000,
    min_step_w: Annotated[float, Query(ge=10, le=5000)] = 80.0,
) -> NILMAnalysisRead:
    if start is not None and end is not None and start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start must be before end",
        )

    statement = select(EnergyMetric).where(
        EnergyMetric.home_id == home.id,
        EnergyMetric.active_power_w.is_not(None),
    )
    if device_id is not None:
        await validate_nilm_device_scope(device_id, home.id, session)
        statement = statement.where(EnergyMetric.device_id == device_id)
    if start is not None:
        statement = statement.where(EnergyMetric.ts >= start)
    if end is not None:
        statement = statement.where(EnergyMetric.ts <= end)

    result = await session.scalars(statement.order_by(EnergyMetric.ts.desc()).limit(limit))
    readings = sorted(
        (
            NILMReading(ts=metric.ts, active_power_w=float(metric.active_power_w))
            for metric in result
            if metric.active_power_w is not None
        ),
        key=lambda reading: reading.ts,
    )
    analysis = analyze_load_profile(
        readings,
        config=NILMDetectionConfig(min_step_w=min_step_w),
    )

    return NILMAnalysisRead.from_domain(
        home_id=home.id,
        device_id=device_id,
        start=start,
        end=end,
        min_step_w=min_step_w,
        analysis=analysis,
    )


@lab_router.get("/demo", response_model=NILMLabDemoRead)
async def get_nilm_lab_demo(
    dataset: Annotated[str, Query()] = "uk-dale",
    house_id: Annotated[str, Query()] = "house-1",
    appliance: Annotated[str, Query()] = "kettle",
) -> NILMLabDemoRead:
    return _build_nilm_lab_demo(dataset=dataset, house_id=house_id, appliance=appliance)


@lab_router.get("/report", response_model=NILMLabReportRead)
async def get_nilm_lab_report(
    dataset: Annotated[str, Query()] = "uk-dale",
    house_id: Annotated[str, Query()] = "house-1",
    appliance: Annotated[str, Query()] = "kettle",
) -> NILMLabReportRead:
    demo = _build_nilm_lab_demo(dataset=dataset, house_id=house_id, appliance=appliance)
    generated_at = datetime.now(UTC)

    markdown = "\n".join(
        [
            "# NILM Experiment Report",
            "",
            f"- Dataset: {demo.dataset_label}",
            f"- House: {demo.house_id.replace('-', ' ').title()}",
            f"- Appliance: {demo.appliance_label}",
            f"- Model: {demo.model_name}",
            f"- Source file: `{demo.source_file}`",
            f"- Samples: {demo.sample_count}",
            f"- Sample period: {demo.sample_period_seconds} seconds",
            f"- On threshold: {demo.on_threshold_w:g} W",
            f"- Generated at: {generated_at.isoformat()}",
            "",
            "## Method",
            "",
            "This experiment evaluates single-appliance disaggregation from aggregate active power.",
            "The baseline detects aggregate power step changes and maps step magnitude ranges to appliance signatures.",
            "",
            "## Signals",
            "",
            "- Input: aggregate whole-home active power.",
            "- Ground truth: appliance-level active power from the dataset sample.",
            "- Prediction: appliance active power estimated by the threshold step baseline.",
            "",
            "## Metrics",
            "",
            f"- MAE: {demo.metrics.mae_w:g} W",
            f"- RMSE: {demo.metrics.rmse_w:g} W",
            f"- Precision: {demo.metrics.precision:g}",
            f"- Recall: {demo.metrics.recall:g}",
            f"- F1-score: {demo.metrics.f1_score:g}",
            "",
            "## Interpretation",
            "",
            "MAE and RMSE measure watt-level reconstruction quality. Precision, recall, and F1-score measure on/off detection using the appliance threshold above.",
            "",
            "## Limitations",
            "",
            "- This is a baseline demonstration, not a production NILM model.",
            "- The current sample is small and intended to validate the platform pipeline.",
            "- Future reports should compare train/test splits, multiple houses, and ML or Seq2Point models.",
        ]
    )

    return NILMLabReportRead(
        dataset=demo.dataset,
        house_id=demo.house_id,
        appliance=demo.appliance,
        model_name=demo.model_name,
        source_file=demo.source_file,
        generated_at=generated_at,
        markdown=markdown,
    )


def _build_nilm_lab_demo(
    *,
    dataset: str,
    house_id: str,
    appliance: str,
) -> NILMLabDemoRead:
    if dataset not in SUPPORTED_LAB_DATASETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"dataset must be one of: {', '.join(SUPPORTED_LAB_DATASETS)}",
        )
    if house_id not in SUPPORTED_LAB_HOUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"house_id must be one of: {', '.join(SUPPORTED_LAB_HOUSES)}",
        )
    if appliance not in SUPPORTED_LAB_APPLIANCES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"appliance must be one of: {', '.join(SUPPORTED_LAB_APPLIANCES)}",
        )

    rows = build_lab_demo_rows()
    predictions = predict_appliance_power_threshold(rows)
    actual_power_w = tuple(row.appliance_power_w.get(appliance, 0.0) for row in rows)
    predicted_power_w = prediction_series_for_appliance(predictions, appliance)
    report = build_evaluation_report(
        appliance=appliance,
        actual_power_w=actual_power_w,
        predicted_power_w=predicted_power_w,
        on_threshold_w=DEFAULT_ON_THRESHOLDS_W.get(appliance, 10.0),
        generated_at=datetime.now(UTC),
    )

    return NILMLabDemoRead(
        dataset=dataset,
        dataset_label=LAB_DATASET_LABELS[dataset],
        house_id=house_id,
        appliance=appliance,
        appliance_label=LAB_APPLIANCE_LABELS[appliance],
        source_file=PROJECT_LAB_SAMPLE_PATH,
        sample_count=len(rows),
        on_threshold_w=DEFAULT_ON_THRESHOLDS_W.get(appliance, 10.0),
        sample_period_seconds=8,
        model_name="threshold_step_baseline",
        metrics=NILMLabMetricsRead.from_report(report),
        points=[
            NILMLabPointRead(
                ts=row.timestamp,
                aggregate_power_w=row.aggregate_power_w,
                actual_power_w=actual_power_w[index],
                predicted_power_w=predicted_power_w[index],
            )
            for index, row in enumerate(rows)
        ],
    )


@lab_router.get("/catalog", response_model=NILMLabCatalogRead)
async def get_nilm_lab_catalog() -> NILMLabCatalogRead:
    return NILMLabCatalogRead(
        default_dataset="uk-dale",
        default_house_id="house-1",
        default_appliance="kettle",
        datasets=[
            NILMLabDatasetRead(
                id=dataset,
                label=LAB_DATASET_LABELS[dataset],
                description=LAB_DATASET_DESCRIPTIONS[dataset],
            )
            for dataset in SUPPORTED_LAB_DATASETS
        ],
        houses=[
            NILMLabHouseRead(
                id=house_id,
                label=house_id.replace("-", " ").title(),
            )
            for house_id in SUPPORTED_LAB_HOUSES
        ],
        appliances=[
            NILMLabApplianceRead(
                id=appliance,
                label=LAB_APPLIANCE_LABELS[appliance],
                on_threshold_w=DEFAULT_ON_THRESHOLDS_W.get(appliance, 10.0),
                nominal_power_w=LAB_APPLIANCE_NOMINAL_POWER_W[appliance],
            )
            for appliance in SUPPORTED_LAB_APPLIANCES
        ],
        models=[
            NILMLabModelRead(
                id="threshold_step_baseline",
                label="Threshold step baseline",
                task="single-appliance disaggregation",
                input_signal="aggregate active power window",
                output_signal="appliance active power",
                status="baseline",
            )
        ],
    )


@lab_router.get("/datasets", response_model=NILMLabDatasetsRead)
async def get_nilm_lab_datasets() -> NILMLabDatasetsRead:
    return NILMLabDatasetsRead(
        datasets=[
            NILMLabDatasetInventoryItemRead(
                id=dataset,
                label=LAB_DATASET_LABELS[dataset],
                description=LAB_DATASET_DESCRIPTIONS[dataset],
                scope=metadata["scope"],
                houses=metadata["houses"],
                appliances=list(metadata["appliances"]),
                sample_period=metadata["sample_period"],
                estimated_scale=metadata["estimated_scale"],
                public_reference=metadata["public_reference"],
                raw_path=metadata["raw_path"],
                processed_path=metadata["processed_path"],
                sample_path=metadata["sample_path"] or None,
                status=metadata["status"],
                raw_available=project_path_has_data(metadata["raw_path"]),
                processed_available=project_path_exists(metadata["processed_path"]),
                sample_available=(
                    dataset == "uk-dale" or project_path_exists(metadata["sample_path"])
                ),
                actions=list(metadata["actions"]),
            )
            for dataset, metadata in LAB_DATASET_METADATA.items()
        ],
        storage_note=(
            "Full public NILM datasets are intentionally stored under data/raw/ "
            "and are not committed to git. The repository only keeps small samples."
        ),
        ingestion_note=(
            "Convert raw houses into the unified CSV schema under data/processed/ "
            "before training or evaluating larger experiments."
        ),
    )
