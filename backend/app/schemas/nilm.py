import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.ml.evaluation.reports import NILMEvaluationReport
from app.services.nilm_analysis import NILMAnalysis, NILMEventType, NILMSignature


class NILMEventRead(BaseModel):
    ts: datetime
    event_type: NILMEventType
    signature: NILMSignature
    delta_w: float
    before_w: float
    after_w: float
    confidence: float = Field(ge=0, le=1)
    score: float = Field(ge=0, le=1)
    description: str
    duration_seconds: int | None
    estimated_energy_wh: float | None


class NILMSummaryRead(BaseModel):
    sample_count: int
    event_count: int
    baseload_w: float | None
    average_power_w: float | None
    peak_power_w: float | None
    detected_load_w: float
    largest_step_w: float | None


class NILMAnalysisRead(BaseModel):
    home_id: uuid.UUID
    device_id: uuid.UUID | None
    start: datetime | None
    end: datetime | None
    min_step_w: float
    summary: NILMSummaryRead
    events: list[NILMEventRead]

    @classmethod
    def from_domain(
        cls,
        *,
        home_id: uuid.UUID,
        device_id: uuid.UUID | None,
        start: datetime | None,
        end: datetime | None,
        min_step_w: float,
        analysis: NILMAnalysis,
    ) -> "NILMAnalysisRead":
        return cls(
            home_id=home_id,
            device_id=device_id,
            start=start,
            end=end,
            min_step_w=min_step_w,
            summary=NILMSummaryRead(
                sample_count=analysis.summary.sample_count,
                event_count=analysis.summary.event_count,
                baseload_w=analysis.summary.baseload_w,
                average_power_w=analysis.summary.average_power_w,
                peak_power_w=analysis.summary.peak_power_w,
                detected_load_w=analysis.summary.detected_load_w,
                largest_step_w=analysis.summary.largest_step_w,
            ),
            events=[
                NILMEventRead(
                    ts=event.ts,
                    event_type=event.event_type,
                    signature=event.signature,
                    delta_w=event.delta_w,
                    before_w=event.before_w,
                    after_w=event.after_w,
                    confidence=event.confidence,
                    score=event.score,
                    description=event.description,
                    duration_seconds=event.duration_seconds,
                    estimated_energy_wh=event.estimated_energy_wh,
                )
                for event in analysis.events
            ],
        )


class NILMLabPointRead(BaseModel):
    ts: datetime
    aggregate_power_w: float
    actual_power_w: float
    predicted_power_w: float


class NILMLabMetricsRead(BaseModel):
    mae_w: float
    rmse_w: float
    precision: float
    recall: float
    f1_score: float

    @classmethod
    def from_report(cls, report: NILMEvaluationReport) -> "NILMLabMetricsRead":
        return cls(
            mae_w=report.regression.mae_w,
            rmse_w=report.regression.rmse_w,
            precision=report.classification.precision,
            recall=report.classification.recall,
            f1_score=report.classification.f1_score,
        )


class NILMLabDemoRead(BaseModel):
    dataset: str
    dataset_label: str
    house_id: str
    appliance: str
    appliance_label: str
    source_file: str
    sample_count: int
    on_threshold_w: float
    sample_period_seconds: int
    model_name: str
    metrics: NILMLabMetricsRead
    points: list[NILMLabPointRead]


class NILMLabDatasetRead(BaseModel):
    id: str
    label: str
    description: str


class NILMLabDatasetFileRead(BaseModel):
    name: str
    path: str
    kind: str
    size_bytes: int | None
    is_symlink: bool
    storage_area: str = "file"


class NILMLabDatasetInventoryItemRead(BaseModel):
    id: str
    label: str
    name: str
    description: str
    scope: str
    houses: int
    supported_houses: list[str]
    appliances: list[str]
    sample_period: str
    estimated_scale: str
    public_reference: str
    official_url: str
    license_access_notes: str
    raw_path: str
    processed_path: str
    sample_path: str | None
    status: str
    raw_available: bool
    processed_available: bool
    sample_available: bool
    raw_file_count: int
    raw_total_bytes: int | None
    processed_file_count: int
    processed_total_bytes: int | None
    raw_files: list[NILMLabDatasetFileRead]
    processed_files: list[NILMLabDatasetFileRead]
    actions: list[str]
    available_actions: list[str]
    import_command: str
    limitations: list[str]
    safe_to_convert_locally: bool


class NILMLabDatasetsRead(BaseModel):
    datasets: list[NILMLabDatasetInventoryItemRead]
    storage_note: str
    ingestion_note: str


class NILMLabDatasetColumnProfileRead(BaseModel):
    name: str
    kind: str
    non_empty_count: int
    missing_count: int
    min_value: float | None
    max_value: float | None
    mean_value: float | None


class NILMLabDatasetStructureNodeRead(BaseModel):
    path: str
    kind: str
    shape: str | None
    dtype: str | None


class NILMLabDatasetFileProfileRead(BaseModel):
    name: str
    path: str
    kind: str
    size_bytes: int | None
    status: str
    profiled_row_limit: int | None
    profiled_row_count: int | None
    truncated: bool
    row_count: int | None
    column_count: int | None
    columns: list[str]
    detected_timestamp_column: str | None
    detected_power_columns: list[str]
    detected_current_columns: list[str]
    detected_voltage_columns: list[str]
    detected_appliance_columns: list[str]
    preview_rows: list[dict[str, str]]
    column_profiles: list[NILMLabDatasetColumnProfileRead]
    start_time: datetime | None
    end_time: datetime | None
    structure: list[NILMLabDatasetStructureNodeRead]
    notes: list[str]


class NILMLabDatasetProfileRead(BaseModel):
    dataset: str
    dataset_label: str
    raw_file_count: int
    profiled_file_count: int
    total_size_bytes: int | None
    limits: dict[str, int | None]
    files: list[NILMLabDatasetFileProfileRead]


class NILMLabDatasetFilesRead(BaseModel):
    dataset: str
    dataset_label: str
    file_count: int
    total_size_bytes: int | None
    files: list[NILMLabDatasetFileRead]


class NILMLabDatasetDownloadGuideRead(BaseModel):
    dataset: str
    dataset_label: str
    official_url: str
    license_access_notes: str
    raw_path: str
    processed_path: str
    sample_path: str | None
    instructions: list[str]
    import_command: str
    limitations: list[str]


class NILMLabDatasetConversionRead(BaseModel):
    dataset: str
    dataset_label: str
    runnable: bool
    executed: bool
    status: str
    command: str
    message: str


class NILMLabHouseRead(BaseModel):
    id: str
    label: str


class NILMLabApplianceRead(BaseModel):
    id: str
    label: str
    on_threshold_w: float
    nominal_power_w: float


class NILMLabModelRead(BaseModel):
    id: str
    label: str
    task: str
    input_signal: str
    output_signal: str
    status: str


class NILMLabCatalogRead(BaseModel):
    default_dataset: str
    default_house_id: str
    default_appliance: str
    datasets: list[NILMLabDatasetRead]
    houses: list[NILMLabHouseRead]
    appliances: list[NILMLabApplianceRead]
    models: list[NILMLabModelRead]


class NILMLabReportRead(BaseModel):
    dataset: str
    house_id: str
    appliance: str
    model_name: str
    source_file: str
    generated_at: datetime
    markdown: str
