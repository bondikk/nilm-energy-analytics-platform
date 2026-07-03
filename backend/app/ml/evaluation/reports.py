from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Sequence

from app.ml.evaluation.metrics import (
    ClassificationMetrics,
    RegressionMetrics,
    classification_metrics,
    on_off_labels,
    regression_metrics,
)


@dataclass(frozen=True)
class NILMEvaluationReport:
    appliance: str
    sample_count: int
    generated_at: datetime
    regression: RegressionMetrics
    classification: ClassificationMetrics

    def to_markdown(self) -> str:
        return "\n".join(
            [
                f"# NILM Evaluation: {self.appliance}",
                "",
                f"- Samples: {self.sample_count}",
                f"- Generated at: {self.generated_at.isoformat()}",
                f"- MAE: {self.regression.mae_w} W",
                f"- RMSE: {self.regression.rmse_w} W",
                f"- Precision: {self.classification.precision}",
                f"- Recall: {self.classification.recall}",
                f"- F1-score: {self.classification.f1_score}",
            ]
        )


def build_evaluation_report(
    *,
    appliance: str,
    actual_power_w: Sequence[float],
    predicted_power_w: Sequence[float],
    on_threshold_w: float,
    generated_at: datetime,
) -> NILMEvaluationReport:
    return NILMEvaluationReport(
        appliance=appliance,
        sample_count=len(actual_power_w),
        generated_at=generated_at,
        regression=regression_metrics(actual_power_w, predicted_power_w),
        classification=classification_metrics(
            on_off_labels(actual_power_w, threshold_w=on_threshold_w),
            on_off_labels(predicted_power_w, threshold_w=on_threshold_w),
        ),
    )
