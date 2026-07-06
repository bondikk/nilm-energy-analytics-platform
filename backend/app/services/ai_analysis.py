from __future__ import annotations

import uuid
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True)
class AIAnalysisExplanation:
    run_id: uuid.UUID
    enabled: bool
    provider: str
    model: str | None
    technical_summary: str
    plain_language_explanation: str
    limitations: list[str]
    suggested_next_experiment: str


def explain_analysis_run(
    *,
    run_id: uuid.UUID,
    analysis_summary: dict[str, object],
) -> AIAnalysisExplanation:
    if not settings.ai_analysis_enabled or not settings.ai_api_key.get_secret_value():
        return _fallback_explanation(run_id=run_id, analysis_summary=analysis_summary)

    # The integration point is intentionally narrow: callers pass compact metrics and
    # event examples, never raw CSV/HDF5 payloads. A future provider client can be added
    # here without changing the normal deterministic NILM pipeline.
    return _fallback_explanation(run_id=run_id, analysis_summary=analysis_summary)


def _fallback_explanation(
    *,
    run_id: uuid.UUID,
    analysis_summary: dict[str, object],
) -> AIAnalysisExplanation:
    dataset = str(analysis_summary.get("dataset_label") or analysis_summary.get("dataset_id") or "dataset")
    appliance = str(analysis_summary.get("appliance_label") or analysis_summary.get("appliance") or "appliance")
    f1_score = analysis_summary.get("f1_score")
    mae_w = analysis_summary.get("mae_w")
    event_count = analysis_summary.get("event_count")

    return AIAnalysisExplanation(
        run_id=run_id,
        enabled=False,
        provider="local_fallback",
        model=None,
        technical_summary=(
            f"{dataset} / {appliance}: baseline disaggregation run completed with "
            f"MAE={mae_w if mae_w is not None else 'n/a'} W, "
            f"F1={f1_score if f1_score is not None else 'n/a'}, "
            f"events={event_count if event_count is not None else 'n/a'}."
        ),
        plain_language_explanation=(
            "The deterministic baseline compared aggregate household power with the selected "
            "appliance ground truth and a threshold-step prediction. Treat the result as a "
            "pipeline and research-demo check, not as production NILM accuracy."
        ),
        limitations=[
            "AI analysis is disabled or no API key is configured.",
            "No raw dataset rows were sent to an external model.",
            "Use deterministic metrics and event tables as the source of truth.",
        ],
        suggested_next_experiment=(
            "Run the same appliance on a larger processed CSV window, then compare the baseline "
            "against another house or a trained model."
        ),
    )
