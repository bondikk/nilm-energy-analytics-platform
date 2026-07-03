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
    SUPPORTED_LAB_APPLIANCES,
    SUPPORTED_LAB_DATASETS,
    SUPPORTED_LAB_HOUSES,
    build_lab_demo_rows,
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
    NILMLabDatasetRead,
    NILMLabDemoRead,
    NILMLabHouseRead,
    NILMLabMetricsRead,
    NILMLabModelRead,
    NILMLabPointRead,
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
