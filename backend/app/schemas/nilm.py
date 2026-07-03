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
    house_id: str
    appliance: str
    sample_period_seconds: int
    model_name: str
    metrics: NILMLabMetricsRead
    points: list[NILMLabPointRead]
