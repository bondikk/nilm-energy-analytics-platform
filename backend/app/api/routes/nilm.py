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
    LabDatasetMetadata,
    PROJECT_LAB_SAMPLE_PATH,
    ProjectDatasetFile,
    SUPPORTED_LAB_APPLIANCES,
    SUPPORTED_LAB_DATASETS,
    SUPPORTED_LAB_HOUSES,
    build_lab_demo_rows,
    dataset_conversion_command,
    dataset_download_guide,
    project_file_inventory,
    project_path_has_data,
    project_path_exists,
    resolve_project_path,
)
from app.ml.datasets.profiling import DatasetFileProfile, profile_dataset_file
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
    NILMLabDatasetColumnProfileRead,
    NILMLabDatasetConversionRead,
    NILMLabDatasetDownloadGuideRead,
    NILMLabDatasetFileRead,
    NILMLabDatasetFileProfileRead,
    NILMLabDatasetFilesRead,
    NILMLabDatasetInventoryItemRead,
    NILMLabDatasetProfileRead,
    NILMLabDatasetRead,
    NILMLabDatasetStructureNodeRead,
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
            _build_dataset_inventory_item(dataset, metadata)
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


@lab_router.get("/datasets/{dataset}", response_model=NILMLabDatasetInventoryItemRead)
async def get_nilm_lab_dataset(dataset: str) -> NILMLabDatasetInventoryItemRead:
    metadata = _get_lab_dataset_metadata(dataset)
    return _build_dataset_inventory_item(dataset, metadata)


@lab_router.get("/datasets/{dataset}/files", response_model=NILMLabDatasetFilesRead)
async def get_nilm_lab_dataset_files(
    dataset: str,
    max_files: Annotated[int, Query(ge=1, le=200)] = 80,
) -> NILMLabDatasetFilesRead:
    metadata = _get_lab_dataset_metadata(dataset)
    files, total_count, total_size_bytes = _dataset_file_inventory(metadata, limit=max_files)
    return NILMLabDatasetFilesRead(
        dataset=dataset,
        dataset_label=LAB_DATASET_LABELS[dataset],
        file_count=total_count,
        total_size_bytes=total_size_bytes,
        files=[NILMLabDatasetFileRead(**file) for file in files],
    )


@lab_router.get("/datasets/{dataset}/profile", response_model=NILMLabDatasetProfileRead)
async def get_nilm_lab_dataset_profile(
    dataset: str,
    max_files: Annotated[int, Query(ge=1, le=12)] = 6,
    file_path: Annotated[str | None, Query(max_length=512)] = None,
) -> NILMLabDatasetProfileRead:
    metadata = _get_lab_dataset_metadata(dataset)
    dataset_files, dataset_file_count, dataset_total_bytes = _dataset_file_inventory(
        metadata,
        limit=max(max_files, 80),
    )
    if file_path:
        matching_files = [file for file in dataset_files if file["path"] == file_path]
        if not matching_files:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="dataset file was not found in the local dataset inventory",
            )
        files_to_profile = matching_files
    else:
        raw_files, _, _ = project_file_inventory(
            metadata["raw_path"],
            limit=max_files,
        )
        if raw_files:
            files_to_profile = list(raw_files[:max_files])
        else:
            processed_files, _, _ = _processed_dataset_file_inventory(metadata, limit=max_files)
            files_to_profile = list(processed_files[:max_files])

    profiles = [
        profile_dataset_file(resolve_project_path(file["path"]))
        for file in files_to_profile
    ]

    return NILMLabDatasetProfileRead(
        dataset=dataset,
        dataset_label=LAB_DATASET_LABELS[dataset],
        raw_file_count=dataset_file_count,
        profiled_file_count=len(profiles),
        total_size_bytes=dataset_total_bytes,
        limits={
            "max_files": max_files,
            "csv_row_limit": profiles[0].profiled_row_limit if profiles else None,
        },
        files=[_build_dataset_file_profile_read(profile) for profile in profiles],
    )


@lab_router.get("/datasets/{dataset}/download-guide", response_model=NILMLabDatasetDownloadGuideRead)
async def get_nilm_lab_dataset_download_guide(dataset: str) -> NILMLabDatasetDownloadGuideRead:
    metadata = _get_lab_dataset_metadata(dataset)
    return NILMLabDatasetDownloadGuideRead(
        dataset=dataset,
        dataset_label=LAB_DATASET_LABELS[dataset],
        official_url=metadata["official_url"],
        license_access_notes=metadata["license_access_notes"],
        raw_path=metadata["raw_path"],
        processed_path=metadata["processed_path"],
        sample_path=metadata["sample_path"] or None,
        instructions=list(dataset_download_guide(dataset)),
        import_command=dataset_conversion_command(dataset),
        limitations=list(metadata["limitations"]),
    )


@lab_router.post("/datasets/{dataset}/convert", response_model=NILMLabDatasetConversionRead)
async def convert_nilm_lab_dataset(dataset: str) -> NILMLabDatasetConversionRead:
    metadata = _get_lab_dataset_metadata(dataset)
    command = dataset_conversion_command(dataset)
    raw_available = project_path_has_data(metadata["raw_path"])
    runnable = metadata["safe_to_convert_locally"] and raw_available
    if runnable:
        message = (
            "Local raw files were found and the converter command is safe to run from a "
            "developer shell. The API returns the command instead of starting a potentially "
            "long dataset conversion inside the web request."
        )
        response_status = "ready_for_local_run"
    elif metadata["safe_to_convert_locally"]:
        message = (
            "The converter is implemented, but raw files are missing. Download or extract "
            f"the dataset under {metadata['raw_path']} first."
        )
        response_status = "missing_raw_files"
    else:
        message = (
            "Automatic conversion is not implemented for this dataset yet. Use the guide "
            "and keep raw files outside git."
        )
        response_status = "manual_only"

    return NILMLabDatasetConversionRead(
        dataset=dataset,
        dataset_label=LAB_DATASET_LABELS[dataset],
        runnable=runnable,
        executed=False,
        status=response_status,
        command=command,
        message=message,
    )


def _build_dataset_inventory_item(
    dataset: str,
    metadata: LabDatasetMetadata,
) -> NILMLabDatasetInventoryItemRead:
    raw_files, raw_file_count, raw_total_bytes = project_file_inventory(metadata["raw_path"])
    processed_available = project_path_exists(metadata["processed_path"])
    processed_sample_available = project_path_exists(metadata["processed_sample_path"])
    processed_is_sample = not processed_available and processed_sample_available
    processed_inventory_path = (
        metadata["processed_path"] if processed_available else metadata["processed_sample_path"]
    )
    processed_files, processed_file_count, processed_total_bytes = project_file_inventory(
        processed_inventory_path
    )

    return NILMLabDatasetInventoryItemRead(
        id=dataset,
        label=LAB_DATASET_LABELS[dataset],
        name=metadata["name"],
        description=LAB_DATASET_DESCRIPTIONS[dataset],
        scope=metadata["scope"],
        houses=metadata["houses"],
        supported_houses=list(metadata["supported_houses"]),
        appliances=list(metadata["appliances"]),
        sample_period=metadata["sample_period"],
        estimated_scale=metadata["estimated_scale"],
        public_reference=metadata["public_reference"],
        official_url=metadata["official_url"],
        license_access_notes=metadata["license_access_notes"],
        raw_path=metadata["raw_path"],
        processed_path=metadata["processed_path"],
        processed_sample_path=metadata["processed_sample_path"] or None,
        sample_path=metadata["sample_path"] or None,
        status=metadata["status"],
        raw_available=project_path_has_data(metadata["raw_path"]),
        processed_available=processed_available or processed_sample_available,
        processed_sample_available=processed_sample_available,
        processed_is_sample=processed_is_sample,
        sample_available=project_path_exists(metadata["sample_path"]),
        raw_file_count=raw_file_count,
        raw_total_bytes=raw_total_bytes,
        processed_file_count=processed_file_count,
        processed_total_bytes=processed_total_bytes,
        raw_files=[NILMLabDatasetFileRead(**file) for file in raw_files],
        processed_files=[NILMLabDatasetFileRead(**file) for file in processed_files],
        actions=list(metadata["actions"]),
        available_actions=list(metadata["actions"]),
        import_command=metadata["import_command"],
        limitations=list(metadata["limitations"]),
        safe_to_convert_locally=metadata["safe_to_convert_locally"],
    )


def _get_lab_dataset_metadata(dataset: str) -> LabDatasetMetadata:
    if dataset not in SUPPORTED_LAB_DATASETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"dataset must be one of: {', '.join(SUPPORTED_LAB_DATASETS)}",
        )
    return LAB_DATASET_METADATA[dataset]


def _dataset_file_inventory(
    metadata: LabDatasetMetadata,
    *,
    limit: int,
) -> tuple[tuple[ProjectDatasetFile, ...], int, int | None]:
    files: list[ProjectDatasetFile] = []
    total_count = 0
    total_size = 0
    has_unknown_size = False

    seen_paths: set[str] = set()
    inventory_paths = tuple(
        dict.fromkeys(
            (
                metadata["sample_path"],
                metadata["raw_path"],
                metadata["processed_path"],
                metadata["processed_sample_path"],
            )
        )
    )
    for dataset_path in inventory_paths:
        dataset_files, count, size_bytes = project_file_inventory(dataset_path, limit=limit)
        total_count += count
        if size_bytes is None and count:
            has_unknown_size = True
        elif size_bytes is not None:
            total_size += size_bytes
        remaining = max(0, limit - len(files))
        for file in dataset_files:
            if remaining <= 0:
                break
            if file["path"] in seen_paths:
                continue
            files.append(file)
            seen_paths.add(file["path"])
            remaining -= 1

    return tuple(files), total_count, None if has_unknown_size else total_size


def _processed_dataset_file_inventory(
    metadata: LabDatasetMetadata,
    *,
    limit: int,
) -> tuple[tuple[ProjectDatasetFile, ...], int, int | None]:
    processed_files, processed_count, processed_total = project_file_inventory(
        metadata["processed_path"],
        limit=limit,
    )
    if processed_files:
        return processed_files, processed_count, processed_total
    return project_file_inventory(metadata["processed_sample_path"], limit=limit)


def _build_dataset_file_profile_read(profile: DatasetFileProfile) -> NILMLabDatasetFileProfileRead:
    return NILMLabDatasetFileProfileRead(
        name=profile.name,
        path=profile.path,
        kind=profile.kind,
        size_bytes=profile.size_bytes,
        status=profile.status,
        profiled_row_limit=profile.profiled_row_limit,
        profiled_row_count=profile.profiled_row_count,
        truncated=profile.truncated,
        row_count=profile.row_count,
        column_count=profile.column_count,
        columns=list(profile.columns),
        detected_timestamp_column=profile.detected_timestamp_column,
        detected_power_columns=list(profile.detected_power_columns),
        detected_current_columns=list(profile.detected_current_columns),
        detected_voltage_columns=list(profile.detected_voltage_columns),
        detected_appliance_columns=list(profile.detected_appliance_columns),
        preview_rows=list(profile.preview_rows),
        column_profiles=[
            NILMLabDatasetColumnProfileRead(
                name=column.name,
                kind=column.kind,
                non_empty_count=column.non_empty_count,
                missing_count=column.missing_count,
                min_value=column.min_value,
                max_value=column.max_value,
                mean_value=column.mean_value,
            )
            for column in profile.column_profiles
        ],
        start_time=profile.start_time,
        end_time=profile.end_time,
        structure=[
            NILMLabDatasetStructureNodeRead(
                path=node.path,
                kind=node.kind,
                shape=node.shape,
                dtype=node.dtype,
            )
            for node in profile.structure
        ],
        notes=list(profile.notes),
    )
